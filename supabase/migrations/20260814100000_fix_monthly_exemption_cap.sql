-- 월별 면제 총액이 부과액을 넘은 기존 데이터 교정.
--
-- 배경: 면제는 감면이지 환급이 아니라 그 달 면제 총액은 부과액을 넘을 수 없다. 그런데
--   면제가 두 경로로 들어오면서(재계산의 규칙 면제 `rule_attd` + 배치의 참여 감면
--   `rule_attd_quest`) 서로를 몰라 합계가 부과액을 넘었고, 잔액 식이 그대로 더해
--   **잔액이 +로 갔다**. prd 2026-07에 2명 발생(회비 2,000원에 2,000+2,000 → +2,000).
--
--   재발 방지는 앱에서 한다 — `capExemptionAmount()`(`lib/dues/calc-exemption.ts`)를
--   면제를 INSERT하는 두 경로가 모두 통과한다. 이 마이그레이션은 **이미 쌓인 것만** 치운다.
--
-- 방식: 초과한 (회원 × 귀속월)에 대해 **최근에 적재된 행부터** 초과분만큼 감액하고,
--   0원이 되면 del_yn 처리한다. 나중에 얹힌 쪽을 깎는 게 시간 순서상 자연스럽고,
--   먼저 확정된 면제를 뒤늦게 줄이면 회원에게 설명하기 어렵다.
--
-- ⚠️ 부과액은 `fee_policy_cfg`의 그 달 단가로 본다. "그 달에 실제로 부과됐는가"(가입월
--   미부과·비활성월 등)는 리플레이가 판정하는 것이라 SQL로 재구현하지 않는다 — 여기서는
--   **단가를 넘은 명백한 초과만** 보수적으로 정리한다. 나머지는 앱의 캡이 앞으로 막는다.
--
-- ⚠️ 실행 후 **관리자 화면에서 잔액 재계산이 필요하다.** 깎인 행은 rflt_yn=true(이미 잔액에
--   반영됨)이므로, 재계산이 base_bal(반영 면제 합)을 다시 세워야 잔액이 정상으로 돌아온다.
--   잔액 반영을 사람이 확인하고 누르는 건 의도된 관문이다(배치 자동화 설계 §3.6).

DO $$
DECLARE
  v_grp     record;
  v_hist    record;
  v_excess  bigint;
  v_cut     bigint;
  v_fixed   int := 0;
BEGIN
  FOR v_grp IN
    SELECT e.team_id, e.mem_id, e.aply_ym,
           sum(e.exm_amt)   AS exm_sum,
           p.monthly_fee_amt AS fee_amt
    FROM public.fee_due_exm_hist e
    JOIN public.fee_policy_cfg p
      ON p.team_id = e.team_id
     AND p.vers = 0
     AND p.del_yn = false
     AND p.aply_stt_dt <= (e.aply_ym || '-01')::date
     AND p.aply_end_dt >= (e.aply_ym || '-01')::date
    WHERE e.del_yn = false
    GROUP BY e.team_id, e.mem_id, e.aply_ym, p.monthly_fee_amt
    HAVING sum(e.exm_amt) > p.monthly_fee_amt
  LOOP
    v_excess := v_grp.exm_sum - v_grp.fee_amt;

    -- 최근 적재분부터 깎는다(aprv_at → crt_at 순). 초과분을 다 덜어낼 때까지.
    FOR v_hist IN
      SELECT exm_hist_id, exm_amt
      FROM public.fee_due_exm_hist
      WHERE team_id = v_grp.team_id
        AND mem_id  = v_grp.mem_id
        AND aply_ym = v_grp.aply_ym
        AND del_yn  = false
      ORDER BY aprv_at DESC NULLS LAST, crt_at DESC
    LOOP
      EXIT WHEN v_excess <= 0;

      v_cut := least(v_hist.exm_amt, v_excess);

      UPDATE public.fee_due_exm_hist
        SET exm_amt = v_hist.exm_amt - v_cut,
            del_yn  = ((v_hist.exm_amt - v_cut) = 0),
            rsn_txt = coalesce(rsn_txt, '') || ' [월 면제 한도 초과분 정리 2026-08-14]',
            upd_at  = now()
        WHERE exm_hist_id = v_hist.exm_hist_id;

      v_excess := v_excess - v_cut;
      v_fixed  := v_fixed + 1;
    END LOOP;
  END LOOP;

  IF v_fixed > 0 THEN
    RAISE NOTICE '월 면제 한도 초과 정리: % 건 조정. 관리자 화면에서 잔액 재계산 필요.', v_fixed;
  END IF;
END $$;
