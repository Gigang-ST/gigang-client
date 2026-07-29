-- 기강이야기 운동기록 = "사진 있는 것만". 마일리지런 기록도 사진을 실어 올린다.
--   ① evt_mlg_act_hist.photo_url 추가 — 마일리지런 기록이 사진을 직접 갖는다
--   ② 트리거 게이트를 review → photo_url로 교체 + 사진 복사
--   ③ get_team_posts에 photo_url IS NOT NULL 필터
--
-- 왜 바뀌었나(요구 변경):
--   기강이야기의 운동기록은 **수치가 목적이 아니라 친목·응원**이다. 그래서 지면에 서려면
--   사진이 있어야 하고(사진 없는 칸을 프로필 사진으로 때우던 폴백은 없앤다 — 그건 기록이
--   아니라 얼굴 격자가 된다), 반대로 마일리지런은 수치가 본체라 사진이 선택값이다.
--   두 요구가 한 테이블(post_mst)에서 만나므로 경계는 이렇게 갈린다:
--     · post_mst에 뜨는 조건 = 사진 있음 (src_enm 무관)
--     · 마일리지런 원본이 남는 조건 = 그대로 (사진 없어도 마일리지는 쌓인다)
--
-- 왜 게이트가 review가 아니라 photo인가:
--   예전엔 "후기 있으면 전광판에 뜬다"였다. 이제 뜨는 기준이 사진이므로 후기만 있고 사진이
--   없는 기록은 post_mst에 만들 이유가 없다 — 만들어도 ③ 필터에 걸려 안 보이는 유령 행이 된다.
--   한마디(cmnt_txt)는 여전히 review에서 오되, 이제 "사진에 딸린 글"이다.
--
-- 사진은 왜 원본 테이블에 두나(post_mst에 직접 안 쓰고):
--   트리거는 Storage에 파일을 올릴 수 없다. 업로드는 앱(서버 액션)이 하고, 트리거는 이미
--   올라간 URL을 복사만 한다. 원본이 photo_url을 가지면 수정/삭제 때도 같은 트리거 한 곳에서
--   동기화가 유지된다 — 앱이 두 테이블에 각각 쓰면 한 갈래만 빠뜨려도 유령 사진이 남는다.

-- ─────────────────────────────────────────────
-- ① 원본 테이블에 사진 컬럼
-- ─────────────────────────────────────────────
ALTER TABLE public.evt_mlg_act_hist
  ADD COLUMN IF NOT EXISTS photo_url text;

COMMENT ON COLUMN public.evt_mlg_act_hist.photo_url IS
  'post-photos 버킷 공개 URL(선택). 값이 있으면 기강이야기 운동기록에 함께 뜬다. 마일리지 계산과는 무관.';

-- ─────────────────────────────────────────────
-- ② 트리거 함수 — 게이트를 사진으로 바꾸고 사진을 복사한다
-- ─────────────────────────────────────────────
-- 규칙:
--   photo 있음 → post_mst 행이 없으면 INSERT, 있으면 표시값 UPDATE(살림)
--   photo 없음 → 대응 post_mst 행을 soft delete (사진을 지우면 지면에서도 내려간다)
-- cmnt_txt는 review에서 오되 비어 있어도 막지 않는다 — 사진만 올린 기록도 지면에 설 수 있다.
CREATE OR REPLACE FUNCTION public.post_sync_from_mlg_act()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_mem_id   uuid;
  v_team_id  uuid;
  v_has_pic  boolean;
BEGIN
  v_has_pic := NEW.photo_url IS NOT NULL AND btrim(NEW.photo_url) <> '';

  -- 작성자·팀 조인: prt_id → evt_team_prt_rel(mem_id, evt_id) → evt_team_mst.team_id
  SELECT r.mem_id, e.team_id
    INTO v_mem_id, v_team_id
  FROM public.evt_team_prt_rel r
  JOIN public.evt_team_mst e ON e.evt_id = r.evt_id
  WHERE r.prt_id = NEW.prt_id;

  -- 조인이 안 풀리면(참여/이벤트 행이 없음) 복제할 대상이 없다 — 조용히 통과.
  -- 원본 INSERT/UPDATE 자체는 막지 않는다(마일리지런 흐름이 이 복제 때문에 깨지면 안 된다).
  IF v_mem_id IS NULL OR v_team_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_has_pic THEN
    INSERT INTO public.post_mst (
      team_id, mem_id, post_type_enm, src_enm,
      photo_url, cmnt_txt, dst_km, sprt_enm, act_dt,
      ref_type_txt, ref_id, del_yn, crt_at, upd_at
    ) VALUES (
      v_team_id, v_mem_id, 'record_flex', 'mlg_auto',
      NEW.photo_url, NULLIF(btrim(COALESCE(NEW.review, '')), ''),
      NEW.dst_km, NEW.sprt_enm::text, NEW.act_dt,
      'mlg_act', NEW.act_id, false, NEW.created_at, now()
    )
    ON CONFLICT (ref_type_txt, ref_id) DO UPDATE SET
      photo_url = EXCLUDED.photo_url,
      cmnt_txt  = EXCLUDED.cmnt_txt,
      dst_km    = EXCLUDED.dst_km,
      sprt_enm  = EXCLUDED.sprt_enm,
      act_dt    = EXCLUDED.act_dt,
      del_yn    = false,   -- 지웠다가 사진이 다시 붙으면 되살린다
      upd_at    = now();
  ELSE
    -- 사진이 없다(처음부터 없거나, 수정으로 지워짐) → 대응 포스트를 내린다.
    -- 행은 지우지 않는다(soft delete) — post_mst 전체 컨벤션과 통일.
    UPDATE public.post_mst
       SET del_yn = true, upd_at = now()
     WHERE ref_type_txt = 'mlg_act' AND ref_id = NEW.act_id AND del_yn = false;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.post_sync_from_mlg_act() IS
  '마일리지런 기록(photo_url) → post_mst(record_flex, mlg_auto) 동기화. 게이트는 사진이다(후기 아님).';

-- record_flex CHECK가 cmnt_txt NOT NULL을 요구하면 사진만 올린 마일리지런이 트리거에서 터진다
-- (마일리지런 후기는 선택값이라 사진만 있고 한마디가 없는 조합이 정상이다). 제약을 푼다.
--
-- "그럼 photo_url NOT NULL로 바꾸면 되지 않나" — 안 된다. 이미 쌓인 사진 없는 행 46건이
-- 그 제약에 걸려 마이그레이션 자체가 실패한다. 게다가 그 행들은 지우지 않기로 했다
-- (사용자 결정: 데이터 보존, 나중에 사진이 붙으면 되살아난다). 사진 필수는 **쓰기 시점**에
-- 앱(zod + 서버 액션)이 걸고, **읽기 시점**에 ③의 RPC 필터가 거른다. DB 제약은 과거 데이터를
-- 인질로 잡으므로 이 셋 중 유일하게 못 쓰는 수단이다.
ALTER TABLE public.post_mst
  DROP CONSTRAINT IF EXISTS ck_post_mst_record_flex_fields;

-- 기존 mlg_auto 행 정리: 사진이 없으므로 전부 지면에서 내려간다.
-- 행은 남긴다(사용자 결정: 데이터 보존) — 나중에 원본에 사진을 붙이면 트리거가 되살린다.
UPDATE public.post_mst
   SET del_yn = true, upd_at = now()
 WHERE src_enm = 'mlg_auto' AND photo_url IS NULL AND del_yn = false;

-- ─────────────────────────────────────────────
-- ③ get_team_posts — 사진 있는 것만 내려준다
-- ─────────────────────────────────────────────
-- 앱(record-flex-feed / record-reel-viewer / story-lede)에 있던 프사 폴백을 걷어내는 짝이다.
-- 여기서 막지 않으면 사진 없는 행이 계속 내려와 클라이언트마다 폴백 판단이 갈린다.
CREATE OR REPLACE FUNCTION public.get_team_posts(
  p_team_id uuid,
  p_limit   integer DEFAULT 16,
  p_offset  integer DEFAULT 0
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
    ORDER BY p.act_dt DESC NULLS LAST, p.crt_at DESC, p.post_id DESC
    LIMIT GREATEST(p_limit, 1)
    OFFSET GREATEST(p_offset, 0)
  ) r;
$function$;

GRANT EXECUTE ON FUNCTION public.get_team_posts(uuid, integer, integer)
  TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
