-- ============================================================
-- 기강 포인트 제도 — 결함 점검(8관점 리뷰) 반영 수정
-- 설계 문서: docs/design/2026-07-04-기강포인트제도.md
--
-- 리뷰에서 확정된 결함/개선 8건:
--  ① [정합] recheck_mlg_goal 달성 판정이 앱(lib/mileage.ts isMonthAchieved)과 반올림 규칙 불일치
--     — 앱은 소수 첫째 자리 반올림 후 비교(199.96→200.0→달성), DB는 raw 비교라 경계값에서
--       UI "달성" 표시와 포인트 적립이 어긋남 → round(achv, 1)로 통일
--  ② [회수 누락] evt_team_prt_rel 삭제(관리자 참가 거절/삭제) 시 evt_mlg_act_hist·evt_mlg_mth_snap이
--     ON DELETE CASCADE로 지워지는데, cascade 시점엔 부모가 이미 없어 자식 AFTER DELETE 트리거의
--     조인이 NOT FOUND → 포인트 회수가 조용히 스킵되어 고아 earn이 남음
--     → 부모(BEFORE DELETE)에서 cascade 전에 일괄 회수
--  ③ [복원 미처리] gthr_mst·sch_post_mst 소프트 삭제 복원(del_yn true→false) 시 회수만 되고
--     재적립 경로가 없어 영구 회수 상태로 남음 → 복원 분기 추가
--  ④ [동시성] 범용 pt_earn/pt_revoke에 advisory lock 부재 — 원천 유니크 제약이 대부분 직렬화해주지만,
--     gthr_mst UPDATE 트리거의 참석자 순회와 참석 토글이 겹치면 레이스 가능 → mlg 경로와 동일하게 직렬화
--  ⑤ [중복 제거] pt_trg_gthr_attd_rel의 인라인 타입 CASE 2곳 → pt_gthr_actv_type 헬퍼로 통일
--  ⑥ [효율] UPDATE OF 절 미사용 트리거 4개 — 무관 컬럼 UPDATE에도 발동하던 것을 관련 컬럼으로 한정
--     (기존 선례: 20260421180000의 UPDATE OF comp_sprt_cd)
--  ⑦ [효율] pt_net_mlg_record 조회를 커버하는 부분 인덱스 추가
--  ⑧ 함수 내부 IS DISTINCT 가드는 그대로 유지(UPDATE OF는 SET 목록 기준이라 값 동일 UPDATE도 발동하므로)
-- ============================================================

-- ------------------------------------------------------------
-- ④ pt_earn / pt_revoke — 범용 advisory lock (같은 (mem, actv, ref) 짝 직렬화)
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pt_earn(
  p_team_id uuid,
  p_mem_id  uuid,
  p_actv    public.pt_actv_type_enm,
  p_aply_dt date,
  p_ref_type text,
  p_ref_id  uuid,
  p_rsn_txt text
) RETURNS void LANGUAGE plpgsql AS
$$
BEGIN
  IF p_aply_dt < public.pt_intro_dt() THEN
    RETURN;
  END IF;

  -- 동시성 직렬화: net 판정(SELECT)과 INSERT 사이 레이스 방지.
  -- 원천 유니크 제약이 대부분 막아주지만, gthr_mst 변경 트리거의 참석자 순회와
  -- 참석 토글이 겹치는 경로 등은 제약 밖이라 mlg 경로(선례)와 동일하게 잠근다.
  PERFORM pg_advisory_xact_lock(
    hashtext('pt_ref:' || p_mem_id::text || ':' || p_actv::text || ':' || coalesce(p_ref_id::text, ''))::bigint);

  IF public.pt_net_by_ref(p_mem_id, p_actv, p_ref_id) <> 0 THEN
    RETURN; -- 이미 적립됨(토글/재시도 안전, §5.2)
  END IF;

  INSERT INTO public.pt_txn_hist (team_id, mem_id, actv_type_enm, txn_type_enm, pt_amt, aply_dt, ref_type_txt, ref_id, rsn_txt)
  VALUES (p_team_id, p_mem_id, p_actv, 'earn', public.pt_rule_amt(p_actv), p_aply_dt, p_ref_type, p_ref_id, p_rsn_txt);
END;
$$;

CREATE OR REPLACE FUNCTION public.pt_revoke(
  p_team_id uuid,
  p_mem_id  uuid,
  p_actv    public.pt_actv_type_enm,
  p_aply_dt date,
  p_ref_type text,
  p_ref_id  uuid,
  p_rsn_txt text
) RETURNS void LANGUAGE plpgsql AS
$$
DECLARE
  v_net integer;
BEGIN
  -- pt_earn과 같은 키로 직렬화 (동시 earn/revoke 레이스 방지)
  PERFORM pg_advisory_xact_lock(
    hashtext('pt_ref:' || p_mem_id::text || ':' || p_actv::text || ':' || coalesce(p_ref_id::text, ''))::bigint);

  v_net := public.pt_net_by_ref(p_mem_id, p_actv, p_ref_id);
  IF v_net <= 0 THEN
    RETURN; -- 이미 회수됐거나 애초에 적립 없음(이중 회수 안전, §5.2)
  END IF;

  INSERT INTO public.pt_txn_hist (team_id, mem_id, actv_type_enm, txn_type_enm, pt_amt, aply_dt, ref_type_txt, ref_id, rsn_txt)
  VALUES (p_team_id, p_mem_id, p_actv, 'revoke', -v_net, p_aply_dt, p_ref_type, p_ref_id, p_rsn_txt);
END;
$$;

-- ------------------------------------------------------------
-- ① recheck_mlg_goal — 달성 판정을 앱(isMonthAchieved)과 동일한 반올림 규칙으로
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.recheck_mlg_goal(p_goal_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS
$$
DECLARE
  v_prt_id    uuid;
  v_base_dt   date;
  v_goal_mlg  integer;
  v_mem_id    uuid;
  v_team_id   uuid;
  v_achv_mlg  numeric;
  v_achieved  boolean;
  v_net       integer;
BEGIN
  SELECT s.prt_id, s.base_dt, s.goal_mlg, s.achv_mlg
    INTO v_prt_id, v_base_dt, v_goal_mlg, v_achv_mlg
  FROM public.evt_mlg_mth_snap s
  WHERE s.goal_id = p_goal_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT p.mem_id, t.team_id
    INTO v_mem_id, v_team_id
  FROM public.evt_team_prt_rel p
  JOIN public.evt_team_mst t ON t.evt_id = p.evt_id
  WHERE p.prt_id = v_prt_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- 동시성 직렬화: 근접 기록 다건 삽입 시 같은 goal_id 재판정이 겹치면 net 레이스 → 이중 earn 가능
  PERFORM pg_advisory_xact_lock(hashtext('pt_mlg_goal:' || p_goal_id::text)::bigint);

  -- 달성 판정은 앱(lib/mileage.ts isMonthAchieved)과 동일하게
  -- "소수 첫째 자리 반올림 후 비교" (199.96 → 200.0 → 달성). raw 비교 시 UI와 어긋남.
  v_achieved := round(v_achv_mlg, 1) >= v_goal_mlg;
  v_net := public.pt_net_by_ref(v_mem_id, 'mlg_goal', p_goal_id);

  IF v_achieved AND v_net = 0 THEN
    PERFORM public.pt_earn(
      v_team_id, v_mem_id, 'mlg_goal', v_base_dt, 'mlg_goal', p_goal_id,
      '마일리지런 월 목표 달성 (' || to_char(v_base_dt, 'YYYY-MM') || ')'
    );
  ELSIF NOT v_achieved AND v_net > 0 THEN
    PERFORM public.pt_revoke(
      v_team_id, v_mem_id, 'mlg_goal', v_base_dt, 'mlg_goal', p_goal_id,
      '마일리지런 월 목표 미달 전환 (' || to_char(v_base_dt, 'YYYY-MM') || ')'
    );
  END IF;
END;
$$;

-- ------------------------------------------------------------
-- ⑤ pt_trg_gthr_attd_rel — 인라인 타입 CASE → pt_gthr_actv_type 헬퍼로 통일
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pt_trg_gthr_attd_rel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS
$$
DECLARE
  v_gthr      record;
  v_actv      public.pt_actv_type_enm;
  v_aply_dt   date;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT team_id, gthr_type_enm, gthr_nm, stt_at, del_yn INTO v_gthr
    FROM public.gthr_mst WHERE gthr_id = NEW.gthr_id;

    IF NOT FOUND OR v_gthr.del_yn THEN
      RETURN NEW; -- 삭제된 모임에 대한 참석은 적립하지 않음
    END IF;

    v_actv := public.pt_gthr_actv_type(v_gthr.gthr_type_enm);
    IF v_actv IS NULL THEN
      RETURN NEW;
    END IF;

    v_aply_dt := (v_gthr.stt_at AT TIME ZONE 'Asia/Seoul')::date;

    PERFORM public.pt_earn(
      v_gthr.team_id, NEW.mem_id, v_actv, v_aply_dt, 'gthr', NEW.gthr_id,
      CASE v_actv
        WHEN 'regular_attend' THEN '정모 참석: ' || v_gthr.gthr_nm
        WHEN 'gthr_attend'    THEN '벙 참석: ' || v_gthr.gthr_nm
        ELSE '이벤트 참석: ' || v_gthr.gthr_nm
      END
    );

    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    SELECT team_id, gthr_type_enm, gthr_nm, stt_at INTO v_gthr
    FROM public.gthr_mst WHERE gthr_id = OLD.gthr_id;

    IF NOT FOUND THEN
      RETURN OLD;
    END IF;

    v_actv := public.pt_gthr_actv_type(v_gthr.gthr_type_enm);
    IF v_actv IS NULL THEN
      RETURN OLD;
    END IF;

    v_aply_dt := (v_gthr.stt_at AT TIME ZONE 'Asia/Seoul')::date;

    PERFORM public.pt_revoke(
      v_gthr.team_id, OLD.mem_id, v_actv, v_aply_dt, 'gthr', OLD.gthr_id,
      '참석 취소: ' || v_gthr.gthr_nm
    );

    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

-- ------------------------------------------------------------
-- ③-a pt_trg_gthr_mst — 소프트 삭제 복원(del_yn true→false) 분기 추가
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pt_trg_gthr_mst()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS
$$
DECLARE
  v_old_aply_dt date;
  v_new_aply_dt date;
  v_attendee    record;
  v_old_actv    public.pt_actv_type_enm;
  v_new_actv    public.pt_actv_type_enm;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.gthr_type_enm = 'general' THEN
      PERFORM public.pt_earn(
        NEW.team_id, NEW.crt_by, 'gthr_host',
        (NEW.stt_at AT TIME ZONE 'Asia/Seoul')::date,
        'gthr', NEW.gthr_id, '벙 개설: ' || NEW.gthr_nm
      );
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- 소프트 삭제(del_yn false→true): 개설 포인트 회수 + 모든 참석 적립 회수
    IF NEW.del_yn = true AND OLD.del_yn = false THEN
      IF OLD.gthr_type_enm = 'general' THEN
        PERFORM public.pt_revoke(
          OLD.team_id, OLD.crt_by, 'gthr_host',
          (OLD.stt_at AT TIME ZONE 'Asia/Seoul')::date,
          'gthr', OLD.gthr_id, '모임 삭제로 개설 포인트 회수: ' || OLD.gthr_nm
        );
      END IF;

      v_old_actv := public.pt_gthr_actv_type(OLD.gthr_type_enm);

      IF v_old_actv IS NOT NULL THEN
        v_old_aply_dt := (OLD.stt_at AT TIME ZONE 'Asia/Seoul')::date;
        FOR v_attendee IN
          SELECT mem_id FROM public.gthr_attd_rel WHERE gthr_id = OLD.gthr_id
        LOOP
          PERFORM public.pt_revoke(
            OLD.team_id, v_attendee.mem_id, v_old_actv, v_old_aply_dt,
            'gthr', OLD.gthr_id, '모임 삭제로 참석 포인트 회수: ' || OLD.gthr_nm
          );
        END LOOP;
      END IF;

      RETURN NEW;
    END IF;

    -- 복원(del_yn true→false): 삭제 때 회수했던 개설·참석 포인트를 현재 타입·일시 기준으로 재적립
    -- (없으면 관리자가 복원해도 포인트만 영구 회수 상태로 남는 비대칭 — 리뷰 ③)
    IF NEW.del_yn = false AND OLD.del_yn = true THEN
      v_new_aply_dt := (NEW.stt_at AT TIME ZONE 'Asia/Seoul')::date;

      IF NEW.gthr_type_enm = 'general' THEN
        PERFORM public.pt_earn(
          NEW.team_id, NEW.crt_by, 'gthr_host', v_new_aply_dt,
          'gthr', NEW.gthr_id, '모임 복원으로 개설 포인트 재적립: ' || NEW.gthr_nm
        );
      END IF;

      v_new_actv := public.pt_gthr_actv_type(NEW.gthr_type_enm);
      IF v_new_actv IS NOT NULL THEN
        FOR v_attendee IN
          SELECT mem_id FROM public.gthr_attd_rel WHERE gthr_id = NEW.gthr_id
        LOOP
          PERFORM public.pt_earn(
            NEW.team_id, v_attendee.mem_id, v_new_actv, v_new_aply_dt,
            'gthr', NEW.gthr_id, '모임 복원으로 참석 포인트 재적립: ' || NEW.gthr_nm
          );
        END LOOP;
      END IF;

      RETURN NEW;
    END IF;

    -- 시작일(stt_at) 또는 모임 타입(gthr_type_enm) 변경: 옛 기준 revoke 후 새 기준 재적립
    IF (NEW.gthr_type_enm IS DISTINCT FROM OLD.gthr_type_enm OR NEW.stt_at IS DISTINCT FROM OLD.stt_at)
       AND NEW.del_yn = false THEN
      v_old_aply_dt := (OLD.stt_at AT TIME ZONE 'Asia/Seoul')::date;
      v_new_aply_dt := (NEW.stt_at AT TIME ZONE 'Asia/Seoul')::date;

      IF OLD.gthr_type_enm = 'general' THEN
        PERFORM public.pt_revoke(
          OLD.team_id, OLD.crt_by, 'gthr_host', v_old_aply_dt,
          'gthr', OLD.gthr_id, '모임 정보 변경으로 개설 포인트 재조정: ' || OLD.gthr_nm
        );
      END IF;
      IF NEW.gthr_type_enm = 'general' THEN
        PERFORM public.pt_earn(
          NEW.team_id, NEW.crt_by, 'gthr_host', v_new_aply_dt,
          'gthr', NEW.gthr_id, '벙 개설: ' || NEW.gthr_nm
        );
      END IF;

      v_old_actv := public.pt_gthr_actv_type(OLD.gthr_type_enm);
      v_new_actv := public.pt_gthr_actv_type(NEW.gthr_type_enm);

      FOR v_attendee IN
        SELECT mem_id FROM public.gthr_attd_rel WHERE gthr_id = NEW.gthr_id
      LOOP
        IF v_old_actv IS NOT NULL THEN
          PERFORM public.pt_revoke(
            OLD.team_id, v_attendee.mem_id, v_old_actv, v_old_aply_dt,
            'gthr', NEW.gthr_id, '모임 정보 변경으로 참석 포인트 재조정: ' || OLD.gthr_nm
          );
        END IF;
        IF v_new_actv IS NOT NULL THEN
          PERFORM public.pt_earn(
            NEW.team_id, v_attendee.mem_id, v_new_actv, v_new_aply_dt,
            'gthr', NEW.gthr_id,
            CASE v_new_actv
              WHEN 'regular_attend' THEN '정모 참석: ' || NEW.gthr_nm
              WHEN 'gthr_attend'    THEN '벙 참석: ' || NEW.gthr_nm
              ELSE '이벤트 참석: ' || NEW.gthr_nm
            END
          );
        END IF;
      END LOOP;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.pt_trg_gthr_mst() IS
  '모임 개설(general) 적립 / 소프트삭제 회수 / 복원 재적립 / 시작일·타입 변경 재조정(§6)';

-- ------------------------------------------------------------
-- ③-b pt_trg_sch_post_mst — 복원(del_yn true→false) 분기 추가
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pt_trg_sch_post_mst()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS
$$
DECLARE
  v_aply_dt date;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_aply_dt := (NEW.crt_at AT TIME ZONE 'Asia/Seoul')::date;
    PERFORM public.pt_earn(
      NEW.team_id, NEW.crt_by, 'sch_post', v_aply_dt, 'sch_post', NEW.sch_post_id,
      '정보 등록: ' || NEW.sch_nm
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_aply_dt := (OLD.crt_at AT TIME ZONE 'Asia/Seoul')::date;
    IF NEW.del_yn = true AND OLD.del_yn = false THEN
      PERFORM public.pt_revoke(
        OLD.team_id, OLD.crt_by, 'sch_post', v_aply_dt, 'sch_post', OLD.sch_post_id,
        '정보 삭제: ' || OLD.sch_nm
      );
    ELSIF NEW.del_yn = false AND OLD.del_yn = true THEN
      PERFORM public.pt_earn(
        NEW.team_id, NEW.crt_by, 'sch_post', v_aply_dt, 'sch_post', NEW.sch_post_id,
        '정보 복원으로 재적립: ' || NEW.sch_nm
      );
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.pt_trg_sch_post_mst() IS
  '정보 등록 적립 / 소프트 삭제 회수 / 복원 재적립. aply_dt=작성일(crt_at, KST)(§6)';

-- ------------------------------------------------------------
-- ② evt_team_prt_rel — 참가자 삭제 시 cascade 전에 마일리지 포인트 일괄 회수
--    (자식 테이블 AFTER DELETE 트리거는 cascade 시점에 부모 조인이 실패해 회수를 스킵)
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pt_trg_evt_team_prt_rel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS
$$
DECLARE
  v_team_id uuid;
  v_row     record;
BEGIN
  SELECT t.team_id INTO v_team_id
  FROM public.evt_team_mst t WHERE t.evt_id = OLD.evt_id;

  IF NOT FOUND THEN
    RETURN OLD;
  END IF;

  -- 월 목표 달성 포인트 회수 (snap이 cascade로 지워지기 전에)
  FOR v_row IN
    SELECT goal_id, base_dt FROM public.evt_mlg_mth_snap WHERE prt_id = OLD.prt_id
  LOOP
    PERFORM public.pt_revoke(
      v_team_id, OLD.mem_id, 'mlg_goal', v_row.base_dt, 'mlg_goal', v_row.goal_id,
      '마일리지런 참가 삭제로 목표 포인트 회수'
    );
  END LOOP;

  -- 기록 포인트 회수 — 날짜별 1건이므로 distinct 날짜 단위로
  FOR v_row IN
    SELECT DISTINCT act_dt FROM public.evt_mlg_act_hist WHERE prt_id = OLD.prt_id
  LOOP
    PERFORM public.pt_revoke_mlg_record(
      v_team_id, OLD.mem_id, v_row.act_dt,
      '마일리지런 참가 삭제로 기록 포인트 회수: ' || to_char(v_row.act_dt, 'YYYY-MM-DD')
    );
  END LOOP;

  RETURN OLD;
END;
$$;

COMMENT ON FUNCTION public.pt_trg_evt_team_prt_rel() IS
  '마일리지런 참가자 하드 삭제(관리자 거절/삭제) 시 cascade 전에 기록·목표 포인트 일괄 회수(리뷰 ②)';

CREATE TRIGGER trg_pt_evt_team_prt_rel
  BEFORE DELETE ON public.evt_team_prt_rel
  FOR EACH ROW EXECUTE FUNCTION public.pt_trg_evt_team_prt_rel();

-- ------------------------------------------------------------
-- ⑥ UPDATE OF 절 — 무관 컬럼 UPDATE에 트리거가 발동하지 않도록 한정
--    (함수 내부 IS DISTINCT 가드는 유지 — UPDATE OF는 SET 목록 기준이라 값 동일 UPDATE도 발동)
-- ------------------------------------------------------------

DROP TRIGGER trg_pt_gthr_mst ON public.gthr_mst;
CREATE TRIGGER trg_pt_gthr_mst
  AFTER INSERT OR UPDATE OF del_yn, stt_at, gthr_type_enm ON public.gthr_mst
  FOR EACH ROW EXECUTE FUNCTION public.pt_trg_gthr_mst();

DROP TRIGGER trg_pt_evt_mlg_mth_snap ON public.evt_mlg_mth_snap;
CREATE TRIGGER trg_pt_evt_mlg_mth_snap
  AFTER UPDATE OF goal_mlg, achv_mlg ON public.evt_mlg_mth_snap
  FOR EACH ROW EXECUTE FUNCTION public.pt_trg_evt_mlg_mth_snap();

DROP TRIGGER trg_pt_sch_post_mst ON public.sch_post_mst;
CREATE TRIGGER trg_pt_sch_post_mst
  AFTER INSERT OR UPDATE OF del_yn ON public.sch_post_mst
  FOR EACH ROW EXECUTE FUNCTION public.pt_trg_sch_post_mst();

DROP TRIGGER trg_pt_comp_mst ON public.comp_mst;
CREATE TRIGGER trg_pt_comp_mst
  AFTER UPDATE OF stt_dt ON public.comp_mst
  FOR EACH ROW EXECUTE FUNCTION public.pt_trg_comp_mst();

-- ------------------------------------------------------------
-- ⑦ mlg_record net 판정 전용 부분 인덱스 (ref_id NULL + aply_dt 조회 커버)
-- ------------------------------------------------------------

CREATE INDEX ix_pt_txn_hist_mlg_daily
  ON public.pt_txn_hist (mem_id, aply_dt)
  WHERE actv_type_enm = 'mlg_record' AND ref_id IS NULL;
