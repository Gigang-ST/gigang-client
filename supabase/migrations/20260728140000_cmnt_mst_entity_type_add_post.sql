-- 운동기록(post_mst) 댓글 — 기존 폴리모픽 댓글 시스템에 entity_type만 넓힌다.
--
-- 새 테이블을 만들지 않는 이유: cmnt_mst는 (entity_type, entity_id)로 어디든 붙는 범용
-- 구조라 이미 소식·대회·모임이 같은 표를 쓴다. RLS도 entity가 아니라 team_id 기준
-- (v2_rls_auth_in_team)이라 정책을 새로 쓸 것이 없다 — CHECK 한 줄만 넓히면 답글·멘션·
-- 수정/삭제·Realtime 구독까지 전부 그대로 따라온다.
--
-- 기존 행에는 영향이 없다(넓히기만 — 좁히는 게 아니라 재검증에서 걸릴 행이 없다).
ALTER TABLE public.cmnt_mst DROP CONSTRAINT cmnt_mst_entity_type_check;

ALTER TABLE public.cmnt_mst ADD CONSTRAINT cmnt_mst_entity_type_check
  CHECK (entity_type IN ('sch_post', 'comp', 'gathering', 'post'));
