-- get_team_posts에 댓글 수(cmnt_cnt) 추가 — 깅스타그램 격자 칸 우하단 배지.
--
-- 배경: 격자는 사진만 담는 자리라 수치를 적지 않는데(§DESIGN.md), 어느 사진에 대화가
-- 붙었는지는 칸을 눌러 릴스를 열기 전엔 알 수 없었다. prd 실측으로 사진 있는 기록 149건 중
-- 댓글이 달린 건 26건(17.4%)뿐이라, 0을 감추면(릴스 하단 바와 같은 규칙) 배지가 켜진 칸이
-- 드물어 오히려 신호가 된다 — "여기 대화가 붙었네"가 눈에 띄어 그 칸을 누르게 된다.
--
-- **DROP이 없는 이유**: 인자 시그니처를 그대로 두고 반환 jsonb에 키만 하나 더한다.
-- 20260725115000·20260729100000이 겪은 오버로드 함정(인자를 더하면 덮어쓰기가 아니라
-- 함수가 하나 더 생겨 PostgREST가 호출을 어디로 보낼지 모호해진다)이 여기선 안 생기고,
-- DROP이 REVOKE/GRANT를 날리는 문제도 없어 권한 재설정도 필요 없다.
--
-- **배포 순서 제약이 없다**: 앱 타입(`StoryPost.cmnt_cnt`)을 옵셔널로 두어 이 함수가 늦게
-- 나가도 배지만 안 켜지고 화면은 멀쩡하다(`primary_title`을 붙였던 20260726101000과 같은 방식).
--
-- **비로그인에게도 개수가 나간다.** `cmnt_mst`는 SELECT까지 RLS 인증 전용이지만 이 함수는
-- SECURITY DEFINER라 그 정책을 우회한다 — 나가는 건 **개수뿐이고 본문은 아니다**.
-- 개수를 감추면 댓글이 달린 사진이 "아무도 반응 안 한 사진"으로 오독되는데
-- (`RecordCommentBar` 주석이 경계하던 바로 그 상태), 격자 배지엔 "로그인하면 보여요"를
-- 적을 자리가 없다. 눌러 들어가면 릴스 하단 바가 "로그인하고 댓글 보기"로 정직하게 잇는다.
--
-- 성능: 서브쿼리가 ix_cmnt_mst_entity (team_id, entity_type, entity_id, crt_at)를 그대로 탄다.
-- 한 번에 세는 행은 목록 상한(기본 16)만큼이다.
CREATE OR REPLACE FUNCTION public.get_team_posts(
  p_team_id uuid,
  p_limit   integer DEFAULT 16,
  p_offset  integer DEFAULT 0,
  -- 지정하면 **그 한 건만** 돌려준다(limit·offset 무시). 목록 필터는 그대로 적용되므로
  -- 삭제됐거나 사진이 없는 기록은 빈 배열이 된다 — 호출부가 "이미 내려간 기록"으로 안내한다.
  p_post_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'post_id',    r.post_id,
    'mem_id',     r.mem_id,
    'mem_nm',     r.mem_nm,
    'avatar_url', r.avatar_url,
    'photo_url',  r.photo_url,
    'cmnt_txt',   r.cmnt_txt,
    'dst_km',     r.dst_km,
    'sprt_enm',   r.sprt_enm,
    'act_dt',     r.act_dt,
    'src_enm',    r.src_enm,
    'crt_at',     r.crt_at,
    'cmnt_cnt',   r.cmnt_cnt,
    'badge_effect',   r.badge_effect,
    'primary_title',  r.primary_title
  ) ORDER BY r.rn), '[]'::jsonb)
  FROM (
    SELECT p.post_id, p.mem_id, mm.mem_nm, mm.avatar_url, p.photo_url,
           p.cmnt_txt, p.dst_km, p.sprt_enm, p.act_dt, p.src_enm, p.crt_at,
           COALESCE(tm.selected_badge_effect, 'none') AS badge_effect,
           -- 살아 있는 댓글만 센다. 답글(prnt_id가 있는 것)도 포함 — 릴스 하단 바가 세는
           -- 값(`visiblePostComments`)과 같은 기준이어야 격자와 릴스의 숫자가 안 어긋난다.
           -- 삭제분은 시트 안에서만 "삭제된 댓글입니다" 자리표시자로 남고 개수엔 안 센다.
           (SELECT count(*)
              FROM public.cmnt_mst c
             WHERE c.team_id = p.team_id
               AND c.entity_type = 'post'
               AND c.entity_id = p.post_id
               AND c.del_yn = false) AS cmnt_cnt,
           (SELECT jsonb_build_object(
                     'ttl_nm', t.ttl_nm, 'ttl_desc', t.ttl_desc,
                     'desc_visibility', t.desc_visibility)
              FROM public.mem_ttl_rel mt
              INNER JOIN public.ttl_mst t
                ON t.ttl_id = mt.ttl_id AND t.vers = 0 AND t.del_yn = false AND t.use_yn = true
              WHERE mt.team_mem_id = tm.team_mem_id AND mt.vers = 0 AND mt.del_yn = false
                AND (mt.exp_at IS NULL OR mt.exp_at > now()) AND mt.is_prmy_yn
              LIMIT 1) AS primary_title,
           row_number() OVER (ORDER BY p.act_dt DESC NULLS LAST, p.crt_at DESC, p.post_id DESC) AS rn
    FROM public.post_mst p
    INNER JOIN public.mem_mst mm
      ON mm.mem_id = p.mem_id AND mm.vers = 0 AND mm.del_yn = false
    LEFT JOIN public.team_mem_rel tm
      ON tm.mem_id = p.mem_id AND tm.team_id = p.team_id
     AND tm.vers = 0 AND tm.del_yn = false AND tm.mem_st_cd = 'active'
    WHERE p.team_id = p_team_id
      AND p.del_yn = false
      AND p.post_type_enm = 'record_flex'
      -- 운동기록은 사진이 본체다. 없으면 지면에 세우지 않는다(프사로 때우지 않는다).
      AND p.photo_url IS NOT NULL
      -- 단건 조회 — NULL이면 평소대로 목록. post_id는 PK라 한 건으로 좁혀진다.
      AND (p_post_id IS NULL OR p.post_id = p_post_id)
    ORDER BY p.act_dt DESC NULLS LAST, p.crt_at DESC, p.post_id DESC
    LIMIT GREATEST(p_limit, 1)
    -- 단건 조회에서는 오프셋을 강제로 0으로 눕힌다 — 호출부가 실수로 오프셋을 함께 넘겨도
    -- 유일한 그 행을 건너뛰어 "없음"으로 오인하는 일이 없게.
    OFFSET CASE WHEN p_post_id IS NULL THEN GREATEST(p_offset, 0) ELSE 0 END
  ) r;
$function$;

COMMENT ON FUNCTION public.get_team_posts(uuid, integer, integer, uuid) IS
  '전광판 깅스타그램 조회. p_post_id를 주면 그 한 건만(딥링크용, limit/offset 무시). 사진 없는 기록은 내려주지 않는다. cmnt_cnt는 살아있는 댓글 수(격자 배지용).';

NOTIFY pgrst, 'reload schema';
