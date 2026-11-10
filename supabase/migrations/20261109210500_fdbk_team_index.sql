-- 건의(fdbk_mst) 팀별 조회 인덱스 — 20261109210000_fdbk_team.sql 에서 떼어 냈다(PR #649 리뷰).
-- README 규칙: 인덱스는 CONCURRENTLY 로, 다른 DDL 과 섞지 않고 단독 파일에서(트랜잭션 밖에서 돌아야 해서).
-- 테이블 쓰기를 막지 않는다. 이미 있으면(dev — 예전 파일로 만들어짐) 건너뛴다.

SET lock_timeout = '3s';

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_fdbk_mst_team_stts ON public.fdbk_mst (team_id, stts_enm);
