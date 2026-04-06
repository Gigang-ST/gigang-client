-- v2: 회원 UTMB 프로필 확장 테이블 + 백필 (utmb_profile -> mem_utmb_prf)
-- 파일명 타임스탬프는 supabase-gigang-dev `schema_migrations`(MCP 적용 시각)와 맞춤.
-- 기준: database-schema-v2-member-domain.md (mem_utmb_prf), database-schema-v2-migration-map.md §3.6
-- 선행: 웨이브 2 mem_mst, P1 백필( utmb.member_id = mem_mst.mem_id )
-- 레거시 RLS: SELECT 공개, CUD 는 본인 member_id — v2 는 mem_id = auth.uid() 동등

CREATE TABLE public.mem_utmb_prf (
  utmb_prf_id uuid NOT NULL DEFAULT gen_random_uuid(),
  mem_id uuid NOT NULL,
  utmb_prf_url text NOT NULL,
  utmb_idx integer NOT NULL,
  vers integer NOT NULL DEFAULT 0,
  del_yn boolean NOT NULL DEFAULT false,
  crt_at timestamptz NOT NULL DEFAULT now(),
  upd_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_mem_utmb_prf PRIMARY KEY (utmb_prf_id),
  CONSTRAINT fk_mem_utmb_prf__mem_mst FOREIGN KEY (mem_id) REFERENCES public.mem_mst (mem_id) ON DELETE RESTRICT,
  CONSTRAINT uk_mem_utmb_prf_mem_vers UNIQUE (mem_id, vers),
  CONSTRAINT ck_mem_utmb_prf_utmb_idx CHECK (utmb_idx >= 0)
);

CREATE INDEX ix_mem_utmb_prf_mem_id ON public.mem_utmb_prf (mem_id);

CREATE TRIGGER mem_utmb_prf_set_upd_at
  BEFORE UPDATE ON public.mem_utmb_prf
  FOR EACH ROW
  EXECUTE FUNCTION public.set_v2_upd_at();

COMMENT ON TABLE public.mem_utmb_prf IS '회원 UTMB 프로필 확장 (v2, mem_mst 1:1·정본 vers=0)';

ALTER TABLE public.mem_utmb_prf ENABLE ROW LEVEL SECURITY;

-- 레거시 utmb_profile_select: 누구나 조회
CREATE POLICY mem_utmb_prf_select_public
  ON public.mem_utmb_prf
  FOR SELECT
  USING (del_yn = false);

CREATE POLICY mem_utmb_prf_insert_own
  ON public.mem_utmb_prf
  FOR INSERT
  TO authenticated
  WITH CHECK (mem_id = auth.uid());

CREATE POLICY mem_utmb_prf_update_own
  ON public.mem_utmb_prf
  FOR UPDATE
  TO authenticated
  USING (mem_id = auth.uid() AND del_yn = false)
  WITH CHECK (mem_id = auth.uid());

CREATE POLICY mem_utmb_prf_delete_own
  ON public.mem_utmb_prf
  FOR DELETE
  TO authenticated
  USING (mem_id = auth.uid());

GRANT ALL ON TABLE public.mem_utmb_prf TO anon;
GRANT ALL ON TABLE public.mem_utmb_prf TO authenticated;
GRANT ALL ON TABLE public.mem_utmb_prf TO service_role;

-- 백필: AS-IS id -> utmb_prf_id 1:1, member_id -> mem_id (정본 mem_mst 만)
INSERT INTO public.mem_utmb_prf (
  utmb_prf_id,
  mem_id,
  utmb_prf_url,
  utmb_idx,
  vers,
  del_yn,
  crt_at,
  upd_at
)
SELECT
  u.id,
  u.member_id,
  u.utmb_profile_url,
  u.utmb_index,
  0,
  false,
  u.created_at,
  u.updated_at
FROM public.utmb_profile u
INNER JOIN public.mem_mst mm
  ON mm.mem_id = u.member_id
 AND mm.vers = 0
 AND mm.del_yn = false
WHERE NOT EXISTS (
  SELECT 1 FROM public.mem_utmb_prf p WHERE p.utmb_prf_id = u.id
)
ON CONFLICT (utmb_prf_id) DO NOTHING;

DO $$
DECLARE
  n_src bigint;
  n_tgt bigint;
BEGIN
  SELECT count(*) INTO n_src FROM public.utmb_profile;
  SELECT count(*) INTO n_tgt FROM public.mem_utmb_prf WHERE vers = 0 AND del_yn = false;
  RAISE NOTICE 'v2_mem_utmb_prf: utmb_profile_cnt=%, mem_utmb_prf_canonical=%', n_src, n_tgt;
END;
$$;
