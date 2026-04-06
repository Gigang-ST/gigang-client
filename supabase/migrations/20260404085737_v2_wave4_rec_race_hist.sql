-- v2 웨이브 4: 기록 (rec_race_hist)
-- 기준: .claude/docs/database-schema-v2-domains.md §3, database-schema-v2-migration-map.md §3.4
-- 선행: 20260404083704_v2_wave3_competition.sql, 20260404081732_v2_wave2_member_team.sql
-- 대상: supabase-gigang-dev
-- 버전: supabase_migrations.schema_migrations 와 동일한 타임스탬프 (CLI·원격 동기화용)
-- 비고: comp_id / comp_evt_id 는 백필 매핑 실패 시 null 허용(B-3, rollout §3.1)

CREATE TABLE public.rec_race_hist (
  race_result_id uuid NOT NULL DEFAULT gen_random_uuid(),
  mem_id uuid NOT NULL,
  comp_id uuid,
  comp_evt_id uuid,
  rec_time_sec integer NOT NULL,
  race_nm text NOT NULL,
  race_dt date NOT NULL,
  swim_time_sec integer,
  bike_time_sec integer,
  run_time_sec integer,
  rec_src_cd text,
  vers integer NOT NULL DEFAULT 0,
  del_yn boolean NOT NULL DEFAULT false,
  crt_at timestamptz NOT NULL DEFAULT now(),
  upd_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_rec_race_hist PRIMARY KEY (race_result_id),
  CONSTRAINT fk_rec_race_hist__mem_mst FOREIGN KEY (mem_id) REFERENCES public.mem_mst (mem_id) ON DELETE RESTRICT,
  CONSTRAINT fk_rec_race_hist__comp_mst FOREIGN KEY (comp_id) REFERENCES public.comp_mst (comp_id) ON DELETE SET NULL,
  CONSTRAINT fk_rec_race_hist__comp_evt_cfg FOREIGN KEY (comp_evt_id) REFERENCES public.comp_evt_cfg (comp_evt_id) ON DELETE SET NULL,
  CONSTRAINT uk_rec_race_hist_mem_evt_dt_nm_vers UNIQUE (mem_id, comp_evt_id, race_dt, race_nm, vers),
  CONSTRAINT ck_rec_race_hist_rec_src_cd CHECK (
    rec_src_cd IS NULL
    OR rec_src_cd IN ('manual', 'imported', 'api')
  )
);

CREATE INDEX ix_rec_race_hist_mem_race_dt ON public.rec_race_hist (mem_id, race_dt);
CREATE INDEX ix_rec_race_hist_comp_evt_rec ON public.rec_race_hist (comp_evt_id, rec_time_sec);

CREATE TRIGGER rec_race_hist_set_upd_at
  BEFORE UPDATE ON public.rec_race_hist
  FOR EACH ROW
  EXECUTE FUNCTION public.set_v2_upd_at();

COMMENT ON TABLE public.rec_race_hist IS '개인 기록 (v2)';

ALTER TABLE public.rec_race_hist ENABLE ROW LEVEL SECURITY;

-- 레거시 race_result 와 동등: 누구나 조회 (소프트삭제 제외)
CREATE POLICY rec_race_hist_select_public
  ON public.rec_race_hist
  FOR SELECT
  USING (del_yn = false);

-- 본인 mem_id 기준 CUD (mem_id = auth.users 와 1:1)
CREATE POLICY rec_race_hist_insert_own
  ON public.rec_race_hist
  FOR INSERT
  TO authenticated
  WITH CHECK (mem_id = auth.uid());

CREATE POLICY rec_race_hist_update_own
  ON public.rec_race_hist
  FOR UPDATE
  TO authenticated
  USING (mem_id = auth.uid() AND del_yn = false)
  WITH CHECK (mem_id = auth.uid());

CREATE POLICY rec_race_hist_delete_own
  ON public.rec_race_hist
  FOR DELETE
  TO authenticated
  USING (mem_id = auth.uid());

GRANT ALL ON TABLE public.rec_race_hist TO anon;
GRANT ALL ON TABLE public.rec_race_hist TO authenticated;
GRANT ALL ON TABLE public.rec_race_hist TO service_role;
