-- 운동기록(post_mst) 댓글 — 기존 폴리모픽 댓글 시스템에 entity_type만 넓힌다.
--
-- 새 테이블을 만들지 않는 이유: cmnt_mst는 (entity_type, entity_id)로 어디든 붙는 범용
-- 구조라 이미 소식·대회·모임이 같은 표를 쓴다. RLS도 entity가 아니라 team_id 기준
-- (v2_rls_auth_in_team)이라 정책을 새로 쓸 것이 없다 — CHECK 한 줄만 넓히면 답글·멘션·
-- 수정/삭제·Realtime 구독까지 전부 그대로 따라온다.
--
-- **NOT VALID → VALIDATE 2단계로 나눈다**(README의 위험 변경 절차). 값을 넓히기만 해서
-- 기존 행이 걸릴 일은 없지만, 제약을 즉시 검증하면 그 순간 테이블 전체를 훑으며 쓰기를
-- 막는다 — 댓글은 계속 쌓이는 표라 배포 시점에 따라 잠금이 길어질 수 있다.
-- NOT VALID는 풀스캔 없이 즉시 끝나고, 새로 들어오는 행은 그 순간부터 검사된다.
SET lock_timeout = '3s';

ALTER TABLE public.cmnt_mst DROP CONSTRAINT cmnt_mst_entity_type_check;

ALTER TABLE public.cmnt_mst ADD CONSTRAINT cmnt_mst_entity_type_check
  CHECK (entity_type IN ('sch_post', 'comp', 'gathering', 'post')) NOT VALID;

-- 기존 행 검증 — 행 락을 잡지 않는다(SHARE UPDATE EXCLUSIVE). 넓히는 변경이라
-- 여기서 걸릴 행은 없지만, 제약을 "검증됨" 상태로 만들어야 플래너가 신뢰하고 쓴다.
ALTER TABLE public.cmnt_mst VALIDATE CONSTRAINT cmnt_mst_entity_type_check;
