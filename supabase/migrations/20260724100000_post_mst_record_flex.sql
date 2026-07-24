-- 기록 자랑(record_flex) — 전광판 팻말로 올리는 러닝 기록
--   ① post_type_enm / post_src_enm — 포스트 종류·유입 경로 ENUM
--   ② post_mst — 각오·기록자랑을 함께 담는 포스트 테이블 (설계: docs/design/2026-07-23-기록자랑-포스트확장.md)
--   ③ storage 버킷 post-photos — 자랑 사진(멤버별 폴더, 공개 read)
--   ④ get_team_posts — 전광판 기록자랑 조회 RPC
--
-- 스콥 메모: 설계서는 `pldg_mst`(각오)를 `post_mst`로 이관해 하나의 피드로 합치자고 했다.
-- 이번 마이그레이션은 **테이블만 그 형태로 신설**하고 실제로는 record_flex만 쓴다.
-- 각오는 계속 pldg_mst에 남는다 — 이관은 설계서 §6-3대로 별도 작업으로 분리한다
-- (각오 UI를 방금 종이비행기로 교체한 참이라, 같은 경로를 연달아 두 번 흔들지 않는다).
--
-- RPC를 get_team_story_feed에 얹지 않고 분리한 이유: 그 함수는 이미 CTE 10개+이고
-- 운영 중이다. 사진 URL이 붙어 payload도 무거워서, 조회 주기가 다른 걸 한 함수에
-- 묶으면 캐시 무효화 단위가 서로를 끌고 다닌다.

-- ─────────────────────────────────────────────
-- ① ENUM
-- ─────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'post_type_enm') THEN
    CREATE TYPE public.post_type_enm AS ENUM (
      'pledge',      -- 각오(한 줄 다짐) — pldg_mst 후신(이관 예정)
      'record_flex'  -- 기록 자랑(사진 + 한마디 + 거리)
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'post_src_enm') THEN
    CREATE TYPE public.post_src_enm AS ENUM (
      'manual',   -- 사용자가 전광판에서 직접 작성
      'mlg_auto'  -- 마일리지런 기록 등록 시 자동 생성(후속 작업)
    );
  END IF;
END
$$;

-- ─────────────────────────────────────────────
-- ② post_mst
-- ─────────────────────────────────────────────
-- 감사 컬럼은 pldg_mst와 동일(del_yn 소프트삭제 + crt_at/upd_at, vers 없음).
CREATE TABLE IF NOT EXISTS public.post_mst (
  post_id       uuid                  PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id       uuid                  NOT NULL REFERENCES public.team_mst(team_id),
  mem_id        uuid                  NOT NULL REFERENCES public.mem_mst(mem_id),
  post_type_enm public.post_type_enm  NOT NULL,
  src_enm       public.post_src_enm   NOT NULL DEFAULT 'manual',

  -- 각오(pledge)일 때만 사용 — record_flex는 NULL
  pldg_txt      text,

  -- 기록자랑(record_flex)일 때만 사용
  photo_url     text,           -- Storage 공개 URL. nullable — 마일리지런 자동 유입분은 사진이 없다
  cmnt_txt      text,           -- 한마디. 마일리지런 evt_mlg_act_hist.review와 같은 역할
  dst_km        numeric(6,2),   -- 거리 — 마일리지런과 같은 정밀도(소수 둘째 자리)
  sprt_enm      text,           -- 종목 — 마일리지런 evt_mlg_sprt_enm 값을 문자열로 그대로 저장
  act_dt        date,           -- 언제 뛰었나. 팻말 하단에 찍히는 날짜는 작성일이 아니라 이것이다

  -- 자동 유입 원천 역참조(감사·중복 방지). src_enm='mlg_auto'일 때만 값이 있다
  ref_type_txt  text,           -- 'mlg_act' 고정(현재는). 추후 대회기록 자동유입 등 확장 대비
  ref_id        uuid,           -- evt_mlg_act_hist.act_id

  del_yn        boolean         NOT NULL DEFAULT false,
  crt_at        timestamptz     NOT NULL DEFAULT now(),
  upd_at        timestamptz     NOT NULL DEFAULT now(),

  CONSTRAINT ck_post_mst_pldg_txt_len
    CHECK (post_type_enm <> 'pledge' OR char_length(pldg_txt) BETWEEN 1 AND 40),
  -- 기록자랑은 한마디가 본체다. 사진은 CHECK로 강제하지 않는다 —
  -- 자동 유입분(사진 없음)이 같은 테이블에 들어와야 하므로. 수동 작성의 사진 필수는 앱(zod)이 건다.
  CONSTRAINT ck_post_mst_record_flex_fields
    CHECK (post_type_enm <> 'record_flex' OR cmnt_txt IS NOT NULL),
  -- 같은 마일리지런 기록에서 두 번 유입되는 걸 DB가 막는다(트리거 멱등성의 근거)
  CONSTRAINT uq_post_mst_ref UNIQUE (ref_type_txt, ref_id)
);

COMMENT ON TABLE public.post_mst IS
  '전광판 포스트 — 각오(pledge)와 기록자랑(record_flex)을 함께 담는다. 현재는 record_flex만 사용, 각오는 아직 pldg_mst.';
COMMENT ON COLUMN public.post_mst.src_enm IS
  'manual=사용자가 전광판에서 직접 작성, mlg_auto=마일리지런 기록 등록 시 트리거가 자동 생성(후속 작업)';
COMMENT ON COLUMN public.post_mst.act_dt IS
  '활동일 — 팻말에 표시되는 날짜. 작성일(crt_at)과 다르다(어제 뛴 걸 오늘 올릴 수 있다)';
COMMENT ON COLUMN public.post_mst.ref_id IS
  '자동 유입 원천 PK. src_enm=mlg_auto면 evt_mlg_act_hist.act_id';

-- 팀별 최신순 조회 — get_team_posts가 team_id+del_yn+type 필터 후 act_dt DESC로 긁는다
CREATE INDEX IF NOT EXISTS ix_post_mst_team_recent
  ON public.post_mst (team_id, act_dt DESC, crt_at DESC)
  WHERE del_yn = false;

CREATE INDEX IF NOT EXISTS ix_post_mst_mem
  ON public.post_mst (mem_id)
  WHERE del_yn = false;

ALTER TABLE public.post_mst ENABLE ROW LEVEL SECURITY;

-- SELECT: 전광판은 비로그인도 보므로 공개 read (pldg_mst_select와 동일 정책)
DROP POLICY IF EXISTS post_mst_select ON public.post_mst;
CREATE POLICY post_mst_select ON public.post_mst
  FOR SELECT USING (del_yn = false);

-- INSERT: 로그인 + 본인 mem_id + 소속 팀 + manual만.
-- 'active' 여부는 v2_rls_auth_in_team이 보지 않으므로 서버 액션의 withActive가 강제한다(pldg_mst와 동일 경계).
-- mlg_auto는 트리거(SECURITY DEFINER)가 쓸 것이라 이 정책을 타지 않는다.
DROP POLICY IF EXISTS post_mst_insert ON public.post_mst;
CREATE POLICY post_mst_insert ON public.post_mst
  FOR INSERT WITH CHECK (
    mem_id = public.v2_rls_resolve_mem_id()
    AND public.v2_rls_auth_in_team(team_id)
    AND del_yn = false
    AND src_enm = 'manual'
  );

-- UPDATE: 본인 포스트만 (수정·소프트삭제)
DROP POLICY IF EXISTS post_mst_update ON public.post_mst;
CREATE POLICY post_mst_update ON public.post_mst
  FOR UPDATE USING (mem_id = public.v2_rls_resolve_mem_id())
  WITH CHECK (
    mem_id = public.v2_rls_resolve_mem_id()
    AND public.v2_rls_auth_in_team(team_id)
  );

-- ─────────────────────────────────────────────
-- ③ Storage 버킷 — post-photos
-- ─────────────────────────────────────────────
-- avatars와 분리한 이유: 자랑 사진은 원본 비율·큰 폭이 필요하고(아바타는 512 정사각 crop),
-- 버킷이 갈려 있어야 용량 정책을 따로 걸 수 있다.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('post-photos', 'post-photos', true, 10485760,
        ARRAY['image/webp', 'image/jpeg', 'image/png'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS post_photos_public_read ON storage.objects;
CREATE POLICY post_photos_public_read ON storage.objects
  FOR SELECT USING (bucket_id = 'post-photos');

DROP POLICY IF EXISTS post_photos_auth_insert ON storage.objects;
CREATE POLICY post_photos_auth_insert ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'post-photos' AND auth.role() = 'authenticated'
  );

DROP POLICY IF EXISTS post_photos_auth_delete ON storage.objects;
CREATE POLICY post_photos_auth_delete ON storage.objects
  FOR DELETE USING (
    bucket_id = 'post-photos' AND auth.role() = 'authenticated'
  );

-- ─────────────────────────────────────────────
-- ④ get_team_posts — 전광판 기록자랑 조회
-- ─────────────────────────────────────────────
-- 정렬은 활동일(act_dt) 우선 — 어제 뛴 걸 오늘 올려도 어제 자리에 꽂힌다.
-- 같은 날이 여럿이면 올린 순서(crt_at)로 가른다.
CREATE OR REPLACE FUNCTION public.get_team_posts(p_team_id uuid, p_limit integer DEFAULT 12)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
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
    'crt_at',     r.crt_at
  ) ORDER BY r.rn), '[]'::jsonb)
  FROM (
    SELECT p.post_id, p.mem_id, mm.mem_nm, mm.avatar_url, p.photo_url,
           p.cmnt_txt, p.dst_km, p.sprt_enm, p.act_dt, p.src_enm, p.crt_at,
           row_number() OVER (ORDER BY p.act_dt DESC NULLS LAST, p.crt_at DESC) AS rn
    FROM public.post_mst p
    INNER JOIN public.mem_mst mm
      ON mm.mem_id = p.mem_id AND mm.vers = 0 AND mm.del_yn = false
    WHERE p.team_id = p_team_id
      AND p.del_yn = false
      AND p.post_type_enm = 'record_flex'
    ORDER BY p.act_dt DESC NULLS LAST, p.crt_at DESC
    LIMIT GREATEST(p_limit, 1)
  ) r;
$function$;

COMMENT ON FUNCTION public.get_team_posts(uuid, integer) IS
  '전광판 기록 자랑(record_flex) 최근 N건. 활동일(act_dt) 최신순. 비로그인도 조회 가능(전광판 공개 정책).';

REVOKE ALL ON FUNCTION public.get_team_posts(uuid, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.get_team_posts(uuid, integer) TO anon, authenticated, service_role;
