-- fee_mem_bal_snap: (team_id, mem_id, vers) 유니크 제약을 del_yn=false 행만 대상으로 변경
-- del_yn=true(롤백된 행)는 유니크 체크에서 제외되어 vers 번호 충돌 없이 del_yn 처리 가능

ALTER TABLE public.fee_mem_bal_snap
  DROP CONSTRAINT uk_fee_mem_bal_snap_team_mem_vers;

CREATE UNIQUE INDEX uk_fee_mem_bal_snap_team_mem_vers
  ON public.fee_mem_bal_snap (team_id, mem_id, vers)
  WHERE del_yn = false;
