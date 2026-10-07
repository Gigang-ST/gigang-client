-- 겨울 10K PB 클래스 — 팀 미션 폐지 + 기록 확인 단계 폐지 (오너 지시 2026-10-07)
-- 설계 정본: docs/design/2026-10-07-겨울10K-PB클래스.md
--
-- 1. 팀 미션 테이블 둘(evt_pb_msn_mst · evt_pb_msn_rslt_rel)을 지운다.
--    오너가 「팀 미션 지워버려라」고 했다 — 관리자가 손으로 점수를 넣는 칸이 남아 있으면 「누가 왜 이 점수를
--    줬나」를 따져야 하고, 점수는 벙·참석·기록에서 자동으로 나오는 것만 남기기로 했다.
--    prd 에는 이 기능으로 쌓인 데이터가 없다(오너 확인) — 지워도 잃는 게 없다. dev 도 0행이다.
--    prd 에 테이블이 아직 없어도 IF EXISTS 라 그대로 통과한다.
--    자식(evt_pb_msn_rslt_rel)을 먼저 지운다 — FK 가 부모를 가리켜 거꾸로 하면 CASCADE 없이는 막힌다.
--    테이블과 함께 인덱스(ix_evt_pb_msn_*)·RLS 정책(SELECT)이 자동으로 사라진다. 이 테이블을 읽는
--    함수·뷰는 없다(dev 에서 확인).
-- 2. 기록 확인 단계를 없앤다 — 오너 지시 「기록을 왜 운영진이 적어, 자기가 적어」.
--    회원이 모든 기록(5K 기준·중간 5K·10K 측정·대구 10K)을 직접 적고 곧바로 점수에 쓰인다.
--    확인 대기(cnfm_yn=false)로 남은 행이 있으면 점수판에서 영영 빠지므로 전부 확인 처리한다.
--    컬럼은 지우지 않는다 — 점수 판정(computeScoreboard)이 아직 읽고, 항상 true 라 무해하다.
--    DROP COLUMN 은 코드가 완전히 내려간 뒤 따로 해도 늦지 않다.
SET lock_timeout = '3s';

-- 1. 팀 미션 폐지
DROP TABLE IF EXISTS public.evt_pb_msn_rslt_rel;
DROP TABLE IF EXISTS public.evt_pb_msn_mst;

-- 2. 확인 대기 기록 일괄 확인 + 컬럼 설명 갱신
UPDATE public.evt_pb_rec_hist SET cnfm_yn = true WHERE cnfm_yn = false;

COMMENT ON COLUMN public.evt_pb_rec_hist.cnfm_yn IS
  '확인 여부 — 확인 단계 폐지(2026-10-07)로 항상 true. 회원이 직접 적은 기록이 곧바로 점수에 쓰인다. 점수 판정이 아직 읽으므로 컬럼은 남겨 둔다';
