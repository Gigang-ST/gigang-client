-- sch_post → sch_post_mst 리네임 (_mst 접미사 규칙 통일)
ALTER TABLE public.sch_post RENAME TO sch_post_mst;

ALTER INDEX sch_post_pkey                RENAME TO sch_post_mst_pkey;
ALTER INDEX ix_sch_post_team_evt_stt_at  RENAME TO ix_sch_post_mst_team_evt_stt_at;
ALTER INDEX ix_sch_post_crt_by           RENAME TO ix_sch_post_mst_crt_by;
