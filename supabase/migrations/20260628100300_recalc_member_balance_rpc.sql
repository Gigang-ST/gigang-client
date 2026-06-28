-- recalc_member_balance — 멤버 1명의 잔액 스냅샷 갱신을 한 트랜잭션으로 원자화.
--
-- 배경(설계 §6.3): 재계산의 쓰기 부분(미반영 면제 합산 → 잔액 계산 → 기존 스냅샷 vers 밀기
--   → 새 스냅샷 INSERT → 합산한 면제 rflt_yn=true 마킹)이 반드시 원자적이어야 한다.
--   Supabase JS 클라이언트는 여러 쿼리를 한 트랜잭션으로 묶지 못하므로 DB 함수로 강제한다.
--   마킹만 되고 잔액 저장이 실패하면 "반영됨인데 잔액엔 없는" 유령 면제가 생긴다.
--
-- 면제 합산 기준이 aply_ym(귀속월)이 아니라 rflt_yn=false("아직 잔액에 안 들어간 것")로 바뀐다(설계 §6.1).
--   - 귀속월이 과거든 당월이든 미반영 면제는 무조건 한 번 합산 → 마킹. 배치를 늦게 돌려도 다음 재계산이 잡는다.
--   - 같은 달 두 번 재계산? 1차가 true 마킹 → 2차는 그 row 미포함 → 이중 합산 없음.
--   - 규칙 면제 INSERT(rflt_yn=false)는 서버 액션이 RPC 호출 전에 끝내고, 그 row도 같은 호출의 ①이 합산한다.
--
-- 불변식(설계 §6.1.1): baseBal 에 녹은 면제 = rflt_yn=true 인 면제. 재계산은 rflt_yn=false 만 더한다.
--
-- 인자:
--   p_base_bal       이전 스냅샷 bal_amt(없으면 0). 직전 재계산까지 반영된 면제가 녹아 있음.
--   p_total_paid     이번 구간 입금 합(서버 액션이 계산)
--   p_total_charged  이번 구간 부과 합(서버 액션이 계산)
--   p_now            재계산 기준 시각(last_calc_dt 로 저장)
--   p_last_calc_at   새 스냅샷의 last_calc_at(입금 커서; 서버 액션이 결정)
--   p_last_ref_pay_id 마지막 참조 입금 id(없으면 NULL)
-- 반환: new_bal(bigint)

CREATE OR REPLACE FUNCTION public.recalc_member_balance(
  p_team_id         uuid,
  p_mem_id          uuid,
  p_base_bal        bigint,
  p_total_paid      bigint,
  p_total_charged   bigint,
  p_now             timestamptz,
  p_last_calc_at    timestamptz,
  p_last_ref_pay_id uuid DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
  v_total_exempted bigint := 0;
  v_exm_ids        uuid[] := '{}';
  v_last_exm_id    uuid;
  v_new_bal        bigint;
  v_cur            record;
  v_next_vers      integer;
BEGIN
  -- ⓪ 멤버 단위 트랜잭션 락 — 같은 멤버 재계산을 직렬화한다.
  --    ①(미반영 면제 읽기)과 ⑤(rflt_yn=true 마킹) 사이에 같은 멤버로 재계산이 동시 진입하면
  --    두 트랜잭션이 같은 미반영 면제를 각각 합산해 잔액이 이중 가산되고, vers=0 스냅샷도 중복될 수 있다.
  --    advisory xact lock 으로 같은 (team, mem) 호출을 한 번에 하나씩만 통과시킨다(트랜잭션 종료 시 자동 해제).
  PERFORM pg_advisory_xact_lock(hashtextextended(p_team_id::text || ':' || p_mem_id::text, 0));

  -- ① 미반영 면제(규칙 + 퀘스트 공통) 합산 + id 수집
  SELECT
    coalesce(sum(exm_amt), 0),
    coalesce(array_agg(exm_hist_id ORDER BY aply_ym DESC), '{}')
  INTO v_total_exempted, v_exm_ids
  FROM public.fee_due_exm_hist
  WHERE team_id = p_team_id
    AND mem_id  = p_mem_id
    AND rflt_yn = false
    AND del_yn  = false;

  v_last_exm_id := v_exm_ids[1];  -- aply_ym 최신(없으면 NULL)

  -- ② 새 잔액
  v_new_bal := p_base_bal + p_total_paid + v_total_exempted - p_total_charged;

  -- ③ 기존 스냅샷(vers=0)이 있으면 vers = max(vers)+1 로 밀기
  SELECT bal_snap_id INTO v_cur
  FROM public.fee_mem_bal_snap
  WHERE team_id = p_team_id AND mem_id = p_mem_id AND vers = 0 AND del_yn = false
  LIMIT 1;

  IF v_cur.bal_snap_id IS NOT NULL THEN
    SELECT coalesce(max(vers), 0) + 1 INTO v_next_vers
    FROM public.fee_mem_bal_snap
    WHERE team_id = p_team_id AND mem_id = p_mem_id;

    UPDATE public.fee_mem_bal_snap
      SET vers = v_next_vers, upd_at = now()
      WHERE bal_snap_id = v_cur.bal_snap_id;
  END IF;

  -- ④ 새 스냅샷 INSERT (vers=0)
  INSERT INTO public.fee_mem_bal_snap (
    team_id, mem_id, bal_amt, last_calc_dt, last_calc_at,
    last_ref_pay_id, last_ref_exm_hist_id, vers, del_yn
  ) VALUES (
    p_team_id, p_mem_id, v_new_bal, p_now, p_last_calc_at,
    p_last_ref_pay_id, v_last_exm_id, 0, false
  );

  -- ⑤ 합산한 면제 rflt_yn=true 마킹
  IF array_length(v_exm_ids, 1) IS NOT NULL THEN
    UPDATE public.fee_due_exm_hist
      SET rflt_yn = true, upd_at = now()
      WHERE exm_hist_id = ANY(v_exm_ids);
  END IF;

  RETURN v_new_bal;
END;
$$;

COMMENT ON FUNCTION public.recalc_member_balance(uuid, uuid, bigint, bigint, bigint, timestamptz, timestamptz, uuid) IS
  '멤버 1명 잔액 스냅샷 갱신을 원자화: 미반영(rflt_yn=false) 면제 합산 → 잔액 계산 → vers 밀기 → INSERT → 면제 마킹(설계 §6.3).';