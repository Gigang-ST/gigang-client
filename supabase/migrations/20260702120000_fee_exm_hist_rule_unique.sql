-- 규칙 면제(rule) 이력의 (팀, 회원, 귀속월, 규칙) 부분 유니크 인덱스.
--
-- 배경: recalculateBalance 의 규칙 면제 적재는 "존재 확인 SELECT → 없으면 INSERT" 패턴이라
--   원자적이지 않다. 확정+재계산(confirmAndRecalc)과 확정취소(cancelTransaction)의 재계산이
--   같은 회원에 동시 진입하면 둘 다 '없음'으로 보고 같은 (mem, aply_ym, cfg) 면제를 2행
--   INSERT → RPC 가 둘 다 합산해 면제가 이중 반영된다. RPC 의 advisory lock 은 INSERT
--   이후(합산·마킹)만 직렬화하므로 이 레이스를 막지 못한다 — DB 제약이 최종 방어선.
--
-- 스코프: exm_cfg_id IS NOT NULL(규칙 기반)만. 퀘스트 면제는 uk_fee_exm_hist_quest 가 별도로
--   지키고, cfg 없는 수동 면제는 한 달 여러 건이 정당할 수 있어 제외한다.
--
-- 애플리케이션은 이 인덱스 충돌(23505)을 "이미 다른 재계산이 적재함"으로 보고 무시한다.
-- (PostgREST upsert 는 부분 유니크를 onConflict 로 못 잡으므로 — KNOWLEDGE.md 참조 —
--  insert 에러코드 분기로 처리한다.)

CREATE UNIQUE INDEX IF NOT EXISTS uk_fee_exm_hist_rule
  ON public.fee_due_exm_hist (team_id, mem_id, aply_ym, exm_cfg_id)
  WHERE del_yn = false AND exm_cfg_id IS NOT NULL;
