-- 겨울 10K PB 클래스 인덱스 (CONCURRENTLY — 이 파일엔 인덱스만, 트랜잭션 밖에서 실행)
SET lock_timeout = '3s';

-- 측정(10K TT)은 프로젝트당 하나 — wk_no 유니크와 별개로 「측정이 두 주차에 걸리는」 경우를 막는다
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_evt_gthr_rel_measure
  ON public.evt_gthr_rel (evt_id)
  WHERE sess_type_cd = 'MEASURE';

-- 「내가 참가 중인 PB 프로젝트」 조회·mem_mst FK 검사용 (evt_id 는 uq_evt_pb_prt_rel 선두 컬럼이 이미 커버)
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_evt_pb_prt_rel_mem_id
  ON public.evt_pb_prt_rel (mem_id);
