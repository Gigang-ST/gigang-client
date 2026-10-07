-- 겨울 10K PB 클래스 2·3단계 인덱스 (CONCURRENTLY — 이 파일엔 인덱스만, 트랜잭션 밖에서 실행)
-- 전부 FK 검사·CASCADE/SET NULL 이 스캔하는 컬럼이다. 이미 유니크/PK 가 선두로 커버하는 컬럼은 뺐다:
--   evt_pb_grp_mst(evt_id) ← uq_evt_pb_grp_mst_nm / evt_pb_rec_hist(prt_id) ← uq_evt_pb_rec_hist
--   evt_pb_msn_rslt_rel(msn_id) ← PK
SET lock_timeout = '3s';

-- 게임팀 삭제(ON DELETE SET NULL)·팀별 팀원 조회
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_evt_pb_prt_rel_grp_id
  ON public.evt_pb_prt_rel (grp_id);

-- mem_mst FK 검사
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_evt_pb_rec_hist_crt_by
  ON public.evt_pb_rec_hist (crt_by);

-- 게임팀 삭제(ON DELETE CASCADE)·팀별 미션 성공 조회
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_evt_pb_msn_rslt_rel_grp_id
  ON public.evt_pb_msn_rslt_rel (grp_id);

-- 프로젝트별 미션 목록
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_evt_pb_msn_mst_evt_id
  ON public.evt_pb_msn_mst (evt_id);
