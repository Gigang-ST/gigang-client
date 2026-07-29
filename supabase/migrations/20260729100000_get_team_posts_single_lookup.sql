-- get_team_posts에 단건 조회(p_post_id) 추가 — 댓글 알림 딥링크(`/story?rec=<post_id>`)를 살린다.
--
-- 배경(QS-13): 알림을 눌러 들어오면 `RecordFlexFeed`가 `?rec=`를 읽어 그 기록의 릴스를 여는데,
-- 판정을 **이미 받아온 목록**(첫 16건 + 사용자가 민 만큼)에서만 한다. "내 운동기록에 새 댓글"은
-- 오래된 글일수록 오는데, 17번째 이후 글이면 목록에 없어 릴스가 안 열리고 전광판 맨 위만 뜬다
-- — 주소는 살아 있는데 화면이 안 뜨는, deep-link.ts 주석이 경계하던 바로 그 상태다.
-- 앱이 스크롤을 유도할 수도 없다: 알림을 눌러 들어온 사람은 스크롤할 이유를 모른다.
--
-- **왜 별도 RPC가 아니라 인자 추가인가**: 이 함수가 들고 있는 건 목록 로직만이 아니라
-- **한 건의 표시 모양**이다(mem_mst 조인, team_mem_rel의 배지, 대표 칭호 서브쿼리, 사진 필터).
-- 단건용 함수를 새로 파면 그 조인이 두 벌이 되어, 나중에 한쪽만 고치면 같은 기록이 격자와
-- 릴스에서 다르게 보인다. 인자 하나로 같은 SELECT를 재사용한다.
--
-- **구버전 DROP이 반드시 먼저다**(20260725115000에서 겪은 것과 같은 함정). Postgres는 인자
-- 시그니처로 함수를 구분하므로 CREATE OR REPLACE에 인자를 더하면 덮어쓰는 게 아니라
-- **오버로드가 하나 더 생긴다**. (uuid,int,int)와 (uuid,int,int,uuid)가 공존하면 PostgREST가
-- 3인자 호출(`getStoryPosts`·`loadMorePosts`)을 어디로 보낼지 모호해져 조회가 통째로 실패하고,
-- 화면에는 "아직 올라온 기록이 없어요"만 남는다. DROP 후 4인자 하나만 남기면
-- `p_post_id DEFAULT NULL` 덕에 기존 2·3인자 호출도 그대로 받는다.
--
-- ⚠️ **배포 순서**: 이 마이그레이션이 앱 코드보다 **먼저** 나가야 한다. 새 코드가 4인자로
-- 부르는데 구버전 함수만 있으면 단건 조회가 실패한다(반대로 이 함수가 먼저 나가 있으면
-- 구버전 앱의 3인자 호출은 그대로 동작한다 — 그래서 이 순서가 안전한 쪽이다).
DROP FUNCTION IF EXISTS public.get_team_posts(uuid, integer, integer);

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
    'badge_effect',   r.badge_effect,
    'primary_title',  r.primary_title
  ) ORDER BY r.rn), '[]'::jsonb)
  FROM (
    SELECT p.post_id, p.mem_id, mm.mem_nm, mm.avatar_url, p.photo_url,
           p.cmnt_txt, p.dst_km, p.sprt_enm, p.act_dt, p.src_enm, p.crt_at,
           COALESCE(tm.selected_badge_effect, 'none') AS badge_effect,
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
  '전광판 깅스타그램 조회. p_post_id를 주면 그 한 건만(딥링크용, limit/offset 무시). 사진 없는 기록은 내려주지 않는다.';

-- DROP이 이전 마이그레이션의 REVOKE/GRANT를 날렸다 — SECURITY DEFINER 함수가 기본
-- PUBLIC EXECUTE로 돌아가지 않게 여기서 다시 잠근다(전광판 공개 조회는 anon으로 충분하다).
REVOKE ALL ON FUNCTION public.get_team_posts(uuid, integer, integer, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_team_posts(uuid, integer, integer, uuid)
  TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
