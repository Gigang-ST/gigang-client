-- ============================================================
-- 기강 포인트 제도 — 도입 시드(백필)
-- 설계 문서: docs/design/2026-07-04-기강포인트제도.md §10 작업분해 2.5
--
-- 배경: 트리거(20260704110000)는 "적용 이후" 발생하는 원천 변경만 잡는다.
--   그런데 이 마이그레이션이 적용되는 시점엔 이미 7월 모임 RSVP, 도입 후 대회일의
--   기존 참가 신청, 7월 마일리지런 기록 등 "원천은 먼저 존재하지만 트리거는 못 본" 데이터가
--   있을 수 있다. 원칙: 포인트는 활동일(aply_dt) 기준이지 데이터가 언제 쌓였는지는 무관
--   (§1, §10) — 따라서 귀속일 ≥ 2026-07-01인 기존 원천을 소급 earn 한다.
--
-- 멱등성: 전부 트리거와 동일한 pt_earn/pt_earn_mlg_record 헬퍼(net=0 가드 내장)를 재사용한다.
--   이미 트리거가 적립해둔 건은 net<>0이라 스킵되므로, 이 마이그레이션은 dev/prd 어느
--   시점에 실행(재실행 포함)해도 안전하다. 규칙 이원화(시드 전용 로직)를 피하기 위해
--   새 SQL을 직접 작성하지 않고 반드시 기존 헬퍼를 호출한다.
--
-- 회수(revoke)는 시드 대상이 아니다 — 백필은 "아직 없는 적립을 채우는" 단방향 동작이며,
-- 이미 삭제된 원천(hard delete)은 애초에 이 시드가 순회할 대상 테이블에 남아있지 않다.
-- ============================================================

DO $$
DECLARE
  v_row record;
BEGIN
  -- ------------------------------------------------------------
  -- 1) gthr_attd_rel — 참석 (모임 stt_at KST date >= 7/1, 모임 살아있음)
  -- ------------------------------------------------------------
  FOR v_row IN
    SELECT
      a.mem_id,
      g.team_id,
      g.gthr_id,
      g.gthr_nm,
      g.gthr_type_enm,
      (g.stt_at AT TIME ZONE 'Asia/Seoul')::date AS aply_dt
    FROM public.gthr_attd_rel a
    JOIN public.gthr_mst g ON g.gthr_id = a.gthr_id
    WHERE g.del_yn = false
      AND (g.stt_at AT TIME ZONE 'Asia/Seoul')::date >= public.pt_intro_dt()
  LOOP
    IF public.pt_gthr_actv_type(v_row.gthr_type_enm) IS NOT NULL THEN
      PERFORM public.pt_earn(
        v_row.team_id, v_row.mem_id, public.pt_gthr_actv_type(v_row.gthr_type_enm), v_row.aply_dt,
        'gthr', v_row.gthr_id,
        '[시드] ' || CASE v_row.gthr_type_enm
          WHEN 'regular' THEN '정모 참석: '
          WHEN 'general' THEN '벙 참석: '
          ELSE '이벤트 참석: '
        END || v_row.gthr_nm
      );
    END IF;
  END LOOP;

  -- ------------------------------------------------------------
  -- 2) gthr_mst — 개설 (general만, 살아있음, stt_at KST date >= 7/1)
  -- ------------------------------------------------------------
  FOR v_row IN
    SELECT team_id, gthr_id, gthr_nm, crt_by, (stt_at AT TIME ZONE 'Asia/Seoul')::date AS aply_dt
    FROM public.gthr_mst
    WHERE gthr_type_enm = 'general'
      AND del_yn = false
      AND (stt_at AT TIME ZONE 'Asia/Seoul')::date >= public.pt_intro_dt()
  LOOP
    PERFORM public.pt_earn(
      v_row.team_id, v_row.crt_by, 'gthr_host',
      v_row.aply_dt, 'gthr', v_row.gthr_id, '[시드] 벙 개설: ' || v_row.gthr_nm
    );
  END LOOP;

  -- ------------------------------------------------------------
  -- 3) comp_reg_rel — 대회 참가 (대회 개최일 >= 7/1). 11월 등 미래 대회 기신청 포함.
  -- ------------------------------------------------------------
  FOR v_row IN
    SELECT r.comp_reg_id, r.mem_id, tc.team_id, c.stt_dt AS aply_dt, c.comp_nm
    FROM public.comp_reg_rel r
    JOIN public.team_comp_plan_rel tc ON tc.team_comp_id = r.team_comp_id
    JOIN public.comp_mst c ON c.comp_id = tc.comp_id
    WHERE c.stt_dt >= public.pt_intro_dt()
  LOOP
    PERFORM public.pt_earn(
      v_row.team_id, v_row.mem_id, 'comp_join', v_row.aply_dt,
      'comp_reg', v_row.comp_reg_id, '[시드] 대회 참가: ' || v_row.comp_nm
    );
  END LOOP;

  -- ------------------------------------------------------------
  -- 4) rec_race_hist — 대회 기록 (대회일 >= 7/1). pt_earn 내부 가드가 이중 방어.
  -- ------------------------------------------------------------
  FOR v_row IN
    SELECT h.race_result_id, h.mem_id, h.race_dt, h.race_nm, tmr.team_id
    FROM public.rec_race_hist h
    JOIN public.team_mem_rel tmr ON tmr.mem_id = h.mem_id AND tmr.vers = 0 AND tmr.del_yn = false
    WHERE h.race_dt >= public.pt_intro_dt()
  LOOP
    PERFORM public.pt_earn(
      v_row.team_id, v_row.mem_id, 'comp_record', v_row.race_dt,
      'race_result', v_row.race_result_id, '[시드] 대회 기록 등록: ' || v_row.race_nm
    );
  END LOOP;

  -- ------------------------------------------------------------
  -- 5) evt_mlg_act_hist — 마일리지런 기록 (act_dt >= 7/1). 1일 1건만 인정하므로
  --    (mem, 날짜)별로 한 번만 호출 — pt_earn_mlg_record의 net=0 가드가 자연히
  --    "그 날짜의 첫 유효 기록"만 적립되게 한다(같은 날 여러 건이어도 중복 없음).
  -- ------------------------------------------------------------
  FOR v_row IN
    SELECT DISTINCT p.mem_id, t.team_id, h.act_dt
    FROM public.evt_mlg_act_hist h
    JOIN public.evt_team_prt_rel p ON p.prt_id = h.prt_id
    JOIN public.evt_team_mst t ON t.evt_id = p.evt_id
    WHERE h.act_dt >= public.pt_intro_dt()
  LOOP
    PERFORM public.pt_earn_mlg_record(
      v_row.team_id, v_row.mem_id, v_row.act_dt, '[시드] 마일리지런 기록: ' || to_char(v_row.act_dt, 'YYYY-MM-DD')
    );
  END LOOP;

  -- ------------------------------------------------------------
  -- 6) evt_mlg_mth_snap — 월 목표 달성 (base_dt >= 7/1 월, 이미 달성 상태인 것만)
  --    recheck_mlg_goal은 achv_mlg/goal_mlg를 다시 읽어 판정하므로 그대로 재사용 가능.
  -- ------------------------------------------------------------
  FOR v_row IN
    SELECT goal_id
    FROM public.evt_mlg_mth_snap
    WHERE base_dt >= date_trunc('month', public.pt_intro_dt())::date
      AND achv_mlg >= goal_mlg
  LOOP
    PERFORM public.recheck_mlg_goal(v_row.goal_id);
  END LOOP;

  -- ------------------------------------------------------------
  -- 7) sch_post_mst — 정보 등록 (살아있음, 작성일 KST >= 7/1)
  -- ------------------------------------------------------------
  FOR v_row IN
    SELECT sch_post_id, team_id, crt_by, sch_nm, (crt_at AT TIME ZONE 'Asia/Seoul')::date AS aply_dt
    FROM public.sch_post_mst
    WHERE del_yn = false
      AND (crt_at AT TIME ZONE 'Asia/Seoul')::date >= public.pt_intro_dt()
  LOOP
    PERFORM public.pt_earn(
      v_row.team_id, v_row.crt_by, 'sch_post', v_row.aply_dt,
      'sch_post', v_row.sch_post_id, '[시드] 정보 등록: ' || v_row.sch_nm
    );
  END LOOP;
END $$;
