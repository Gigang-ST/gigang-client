-- rctn_mst 외래키 보강 — 자매 테이블 cmnt_mst와 동일하게 mem_id·team_id FK를 건다.
--   rctn_mst(20260722110000)는 cmnt_mst의 entity_type/entity_id 패턴을 답습하면서
--   FK만 빠져 있었다. FK가 없으면 삭제된 멤버/팀을 참조하는 고아 리액션을 막지 못한다.
--   ON DELETE 절 없음(NO ACTION) — cmnt_mst와 완전히 동일. 멤버는 소프트 삭제(del_yn)가
--   원칙이라 하드 삭제 자체가 정상 경로가 아니며, 실수로 지우려 하면 FK가 막아준다.
--   (참조: cmnt_mst_mem_id_fkey / cmnt_mst_team_id_fkey — 둘 다 순수 FK)
SET lock_timeout = '3s';

ALTER TABLE public.rctn_mst DROP CONSTRAINT IF EXISTS rctn_mst_mem_id_fkey;
ALTER TABLE public.rctn_mst
  ADD CONSTRAINT rctn_mst_mem_id_fkey
  FOREIGN KEY (mem_id) REFERENCES public.mem_mst(mem_id);

ALTER TABLE public.rctn_mst DROP CONSTRAINT IF EXISTS rctn_mst_team_id_fkey;
ALTER TABLE public.rctn_mst
  ADD CONSTRAINT rctn_mst_team_id_fkey
  FOREIGN KEY (team_id) REFERENCES public.team_mst(team_id);
