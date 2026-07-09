-- ============================================================
-- 기강 포인트 제도 — 헬퍼 + 트리거
-- 설계 문서: docs/design/2026-07-04-기강포인트제도.md §4, §5.2~5.4, §6
--
-- 적립 지점을 앱 코드가 아니라 DB 트리거로 둔다(§4.1) — comp_reg_rel 등 클라이언트
-- 직접 INSERT/DELETE 경로가 여러 컴포넌트에 산재해 앱 훅으로는 누락 위험이 크기 때문.
-- 트리거 함수는 SECURITY DEFINER + search_path 고정으로 RLS 잠긴 pt_txn_hist에 쓴다.
-- 실패를 삼키지 않는다(원장 유실이 UX 에러 1회보다 나쁘다는 결정, §6 트리거 공통 구현 규칙).
--
-- 도입일 가드: aply_dt < '2026-07-01'이면 earn 하지 않는다(과거 백필 없음, §1).
--   회수는 가드하지 않는다 — 도입 후 적립된 것만 회수 대상이므로 net 규칙이 자연히 처리(§6 하단 주석).
-- ============================================================

-- ------------------------------------------------------------
-- 0. 도입일 상수 — 여러 함수가 공유
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pt_intro_dt()
RETURNS date LANGUAGE sql IMMUTABLE PARALLEL SAFE AS
$$ SELECT '2026-07-01'::date; $$;

COMMENT ON FUNCTION public.pt_intro_dt() IS '기강 포인트 제도 도입일(KST). 이 날짜 이전 aply_dt는 earn 적립하지 않는다(백필 없음, §1)';

-- ------------------------------------------------------------
-- 1. 점수 상수 — 단일 지점(§4.2). 값 변경 = 이 함수만 재정의하는 마이그레이션 1건.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pt_rule_amt(p_actv public.pt_actv_type_enm)
RETURNS integer LANGUAGE sql IMMUTABLE PARALLEL SAFE AS
$$
  SELECT CASE p_actv
    WHEN 'regular_attend' THEN 30
    WHEN 'gthr_attend'    THEN 10
    WHEN 'evt_attend'     THEN 20
    WHEN 'gthr_host'      THEN 5
    WHEN 'comp_join'      THEN 20
    WHEN 'comp_record'    THEN 20
    WHEN 'mlg_record'     THEN 2
    WHEN 'mlg_goal'       THEN 10
    WHEN 'sch_post'       THEN 5
    ELSE 0
  END;
$$;

COMMENT ON FUNCTION public.pt_rule_amt(public.pt_actv_type_enm) IS
  '활동 유형별 적립 포인트 상수 (설계 문서 §2 룰셋). manual은 0 반환 — manual_adj는 별도 amt를 직접 지정';

-- ------------------------------------------------------------
-- 2. net 판정 헬퍼 (§5.2) — ref_id 기반 (기본 케이스)
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pt_net_by_ref(
  p_mem_id uuid,
  p_actv   public.pt_actv_type_enm,
  p_ref_id uuid
) RETURNS integer LANGUAGE sql STABLE AS
$$
  SELECT COALESCE(SUM(pt_amt), 0)::integer
  FROM public.pt_txn_hist
  WHERE mem_id = p_mem_id
    AND actv_type_enm = p_actv
    AND ref_id IS NOT DISTINCT FROM p_ref_id;
$$;

COMMENT ON FUNCTION public.pt_net_by_ref(uuid, public.pt_actv_type_enm, uuid) IS
  'net(mem, actv, ref) — 순액 판정(§5.2). earn은 net=0일 때만, revoke는 net>0일 때만(-net) 적용';

-- mlg_record 전용 net 판정 — ref_id 대신 (mem, actv, aply_dt)로 짝 판정 (1일 1건 규칙, §6 하단)
CREATE OR REPLACE FUNCTION public.pt_net_mlg_record(
  p_mem_id  uuid,
  p_aply_dt date
) RETURNS integer LANGUAGE sql STABLE AS
$$
  SELECT COALESCE(SUM(pt_amt), 0)::integer
  FROM public.pt_txn_hist
  WHERE mem_id = p_mem_id
    AND actv_type_enm = 'mlg_record'
    AND ref_id IS NULL
    AND aply_dt = p_aply_dt;
$$;

COMMENT ON FUNCTION public.pt_net_mlg_record(uuid, date) IS
  'mlg_record 전용 net 판정 — ref_id를 안 쓰고 (mem, aply_dt=달린 날짜)로 1일 1건 짝을 맞춘다(§5.2, §6)';

-- ------------------------------------------------------------
-- 3. earn/revoke 삽입 헬퍼 — 도입일 가드 + net 판정을 한 곳에서 처리
-- ------------------------------------------------------------

-- ref_id 기반 earn: net=0일 때만 삽입. 도입일 이전 aply_dt는 스킵.
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

  IF public.pt_net_by_ref(p_mem_id, p_actv, p_ref_id) <> 0 THEN
    RETURN; -- 이미 적립됨(토글/재시도 안전, §5.2)
  END IF;

  INSERT INTO public.pt_txn_hist (team_id, mem_id, actv_type_enm, txn_type_enm, pt_amt, aply_dt, ref_type_txt, ref_id, rsn_txt)
  VALUES (p_team_id, p_mem_id, p_actv, 'earn', public.pt_rule_amt(p_actv), p_aply_dt, p_ref_type, p_ref_id, p_rsn_txt);
END;
$$;

COMMENT ON FUNCTION public.pt_earn(uuid, uuid, public.pt_actv_type_enm, date, text, uuid, text) IS
  'ref_id 기반 earn. net=0일 때만 삽입 + 도입일(pt_intro_dt) 가드';

-- ref_id 기반 revoke: net>0일 때만 -net 삽입. 도입일 가드 없음(회수는 net 규칙이 자연히 처리).
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
  v_net := public.pt_net_by_ref(p_mem_id, p_actv, p_ref_id);
  IF v_net <= 0 THEN
    RETURN; -- 이미 회수됐거나 애초에 적립 없음(이중 회수 안전, §5.2)
  END IF;

  INSERT INTO public.pt_txn_hist (team_id, mem_id, actv_type_enm, txn_type_enm, pt_amt, aply_dt, ref_type_txt, ref_id, rsn_txt)
  VALUES (p_team_id, p_mem_id, p_actv, 'revoke', -v_net, p_aply_dt, p_ref_type, p_ref_id, p_rsn_txt);
END;
$$;

COMMENT ON FUNCTION public.pt_revoke(uuid, uuid, public.pt_actv_type_enm, date, text, uuid, text) IS
  'ref_id 기반 revoke. net>0일 때만 -net 삽입(회수액=현재 순액). 도입일 가드 없음';

-- mlg_record 전용 earn/revoke (ref_id 없이 aply_dt로 짝 판정)
CREATE OR REPLACE FUNCTION public.pt_earn_mlg_record(
  p_team_id uuid,
  p_mem_id  uuid,
  p_aply_dt date,
  p_rsn_txt text
) RETURNS void LANGUAGE plpgsql AS
$$
BEGIN
  IF p_aply_dt < public.pt_intro_dt() THEN
    RETURN;
  END IF;

  -- 동시성 직렬화: (mem, 날짜) 짝에 유니크 제약이 없어(같은 날 기록 다건 허용) net 판정이
  -- 겹치는 트랜잭션에서 레이스 → 이중 earn 가능. advisory xact lock으로 같은 키를 직렬화.
  PERFORM pg_advisory_xact_lock(hashtext('pt_mlg_record:' || p_mem_id::text || ':' || p_aply_dt::text)::bigint);

  IF public.pt_net_mlg_record(p_mem_id, p_aply_dt) <> 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.pt_txn_hist (team_id, mem_id, actv_type_enm, txn_type_enm, pt_amt, aply_dt, ref_type_txt, ref_id, rsn_txt)
  VALUES (p_team_id, p_mem_id, 'mlg_record', 'earn', public.pt_rule_amt('mlg_record'), p_aply_dt, 'mlg_act', NULL, p_rsn_txt);
END;
$$;

COMMENT ON FUNCTION public.pt_earn_mlg_record(uuid, uuid, date, text) IS
  'mlg_record 전용 earn — ref_id NULL, (mem, aply_dt)로 1일 1건 판정 + 도입일 가드';

CREATE OR REPLACE FUNCTION public.pt_revoke_mlg_record(
  p_team_id uuid,
  p_mem_id  uuid,
  p_aply_dt date,
  p_rsn_txt text
) RETURNS void LANGUAGE plpgsql AS
$$
DECLARE
  v_net integer;
BEGIN
  -- pt_earn_mlg_record와 같은 키로 직렬화 (동시 earn/revoke 레이스 방지)
  PERFORM pg_advisory_xact_lock(hashtext('pt_mlg_record:' || p_mem_id::text || ':' || p_aply_dt::text)::bigint);

  v_net := public.pt_net_mlg_record(p_mem_id, p_aply_dt);
  IF v_net <= 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.pt_txn_hist (team_id, mem_id, actv_type_enm, txn_type_enm, pt_amt, aply_dt, ref_type_txt, ref_id, rsn_txt)
  VALUES (p_team_id, p_mem_id, 'mlg_record', 'revoke', -v_net, p_aply_dt, 'mlg_act', NULL, p_rsn_txt);
END;
$$;

COMMENT ON FUNCTION public.pt_revoke_mlg_record(uuid, uuid, date, text) IS
  'mlg_record 전용 revoke — (mem, aply_dt) 짝의 net>0일 때만 회수';

-- ------------------------------------------------------------
-- 4. 마일리지런 월 목표 달성 재판정 (§5.4)
--    기록 INSERT/UPDATE/DELETE, 목표 수정이 전부 이 함수를 호출한다.
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

  v_achieved := v_achv_mlg >= v_goal_mlg;
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

COMMENT ON FUNCTION public.recheck_mlg_goal(uuid) IS
  '마일리지런 월 목표 달성 실시간 재판정(§5.4). ref_id=evt_mlg_mth_snap.goal_id, aply_dt=해당 월 1일(base_dt)';

-- ------------------------------------------------------------
-- 5. ①gthr_attd_rel — 참석 적립/회수
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

    v_actv := CASE v_gthr.gthr_type_enm
      WHEN 'regular' THEN 'regular_attend'
      WHEN 'general' THEN 'gthr_attend'
      WHEN 'event'   THEN 'evt_attend'
      ELSE NULL
    END;
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

    v_actv := CASE v_gthr.gthr_type_enm
      WHEN 'regular' THEN 'regular_attend'
      WHEN 'general' THEN 'gthr_attend'
      WHEN 'event'   THEN 'evt_attend'
      ELSE NULL
    END;
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

COMMENT ON FUNCTION public.pt_trg_gthr_attd_rel() IS
  '모임 참석 등록(INSERT)/취소(hard delete, DELETE) 시 타입별 포인트 적립·회수(§6)';

CREATE TRIGGER trg_pt_gthr_attd_rel
  AFTER INSERT OR DELETE ON public.gthr_attd_rel
  FOR EACH ROW EXECUTE FUNCTION public.pt_trg_gthr_attd_rel();

-- ------------------------------------------------------------
-- 6. ②gthr_mst — 개설 적립 / 소프트 삭제 회수 / 시작일·타입 변경 재적립
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pt_gthr_actv_type(p_gthr_type_enm text)
RETURNS public.pt_actv_type_enm LANGUAGE sql IMMUTABLE PARALLEL SAFE AS
$$
  SELECT CASE p_gthr_type_enm
    WHEN 'regular' THEN 'regular_attend'::public.pt_actv_type_enm
    WHEN 'general' THEN 'gthr_attend'::public.pt_actv_type_enm
    WHEN 'event'   THEN 'evt_attend'::public.pt_actv_type_enm
    ELSE NULL
  END;
$$;

COMMENT ON FUNCTION public.pt_gthr_actv_type(text) IS
  'gthr_mst.gthr_type_enm → 참석 포인트 pt_actv_type_enm 매핑 (§6)';

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

    -- 시작일(stt_at) 또는 모임 타입(gthr_type_enm) 변경: 귀속일/점수가 어긋나므로
    -- 해당 gthr ref의 earn 전부(개설+참석) 을 "옛 타입" 기준으로 revoke 후
    -- "새 타입·새 aply_dt" 기준으로 재적립. 단 모임이 살아있고(del_yn=false) 도입일
    -- 가드를 통과할 때만 재적립 — 회수는 net 규칙이 자연히 처리하므로 가드 불필요.
    IF (NEW.gthr_type_enm IS DISTINCT FROM OLD.gthr_type_enm OR NEW.stt_at IS DISTINCT FROM OLD.stt_at)
       AND NEW.del_yn = false THEN
      v_old_aply_dt := (OLD.stt_at AT TIME ZONE 'Asia/Seoul')::date;
      v_new_aply_dt := (NEW.stt_at AT TIME ZONE 'Asia/Seoul')::date;

      -- 개설 포인트: general→비general 전환 시 revoke만, 비general→general 전환 시 earn만,
      -- general 유지 시 (일시만 바뀐 경우) revoke 후 재적립
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

      -- 참석 포인트: 옛 타입으로 정확히 회수(ref_id+actv_type 짝) 후 새 타입으로 재적립
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
  '모임 개설(INSERT, general만) 적립 / 소프트삭제(del_yn→true) 회수 / 시작일·타입(stt_at, gthr_type_enm) 변경 시 재적립(§6)';

CREATE TRIGGER trg_pt_gthr_mst
  AFTER INSERT OR UPDATE ON public.gthr_mst
  FOR EACH ROW EXECUTE FUNCTION public.pt_trg_gthr_mst();

-- ------------------------------------------------------------
-- 7. ③comp_reg_rel — 대회 참가 적립/회수 (aply_dt = 대회 개최일)
--    조인 경로: comp_reg_rel.team_comp_id → team_comp_plan_rel(team_id, comp_id) → comp_mst.stt_dt
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pt_trg_comp_reg_rel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS
$$
DECLARE
  v_team_id  uuid;
  v_stt_dt   date;
  v_comp_nm  text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT tc.team_id, c.stt_dt, c.comp_nm
      INTO v_team_id, v_stt_dt, v_comp_nm
    FROM public.team_comp_plan_rel tc
    JOIN public.comp_mst c ON c.comp_id = tc.comp_id
    WHERE tc.team_comp_id = NEW.team_comp_id;

    IF NOT FOUND OR v_stt_dt IS NULL THEN
      -- 대회 개최일을 알 수 없으면 적립 스킵(§ 보고서 — comp_mst.stt_dt는 NOT NULL이라
      -- 실무상 발생하지 않지만 방어적으로 처리)
      RETURN NEW;
    END IF;

    PERFORM public.pt_earn(
      v_team_id, NEW.mem_id, 'comp_join', v_stt_dt, 'comp_reg', NEW.comp_reg_id,
      '대회 참가: ' || v_comp_nm
    );

    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    SELECT tc.team_id, c.stt_dt, c.comp_nm
      INTO v_team_id, v_stt_dt, v_comp_nm
    FROM public.team_comp_plan_rel tc
    JOIN public.comp_mst c ON c.comp_id = tc.comp_id
    WHERE tc.team_comp_id = OLD.team_comp_id;

    IF NOT FOUND OR v_stt_dt IS NULL THEN
      RETURN OLD;
    END IF;

    PERFORM public.pt_revoke(
      v_team_id, OLD.mem_id, 'comp_join', v_stt_dt, 'comp_reg', OLD.comp_reg_id,
      '대회 참가 취소: ' || v_comp_nm
    );

    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.pt_trg_comp_reg_rel() IS
  '대회 참가 신청(INSERT)/취소(hard delete, DELETE) 적립·회수. aply_dt=대회 개최일(comp_mst.stt_dt)(§6)';

CREATE TRIGGER trg_pt_comp_reg_rel
  AFTER INSERT OR DELETE ON public.comp_reg_rel
  FOR EACH ROW EXECUTE FUNCTION public.pt_trg_comp_reg_rel();

-- ------------------------------------------------------------
-- 8. ④rec_race_hist — 대회 기록 등록 적립/회수 (대회일 2026-07-01 이후만)
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pt_trg_rec_race_hist()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS
$$
DECLARE
  v_team_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT tmr.team_id INTO v_team_id
    FROM public.team_mem_rel tmr
    WHERE tmr.mem_id = NEW.mem_id AND tmr.vers = 0 AND tmr.del_yn = false
    LIMIT 1;

    IF NOT FOUND THEN
      RETURN NEW;
    END IF;

    PERFORM public.pt_earn(
      v_team_id, NEW.mem_id, 'comp_record', NEW.race_dt, 'race_result', NEW.race_result_id,
      '대회 기록 등록: ' || NEW.race_nm
    );

    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    SELECT tmr.team_id INTO v_team_id
    FROM public.team_mem_rel tmr
    WHERE tmr.mem_id = OLD.mem_id AND tmr.vers = 0 AND tmr.del_yn = false
    LIMIT 1;

    IF NOT FOUND THEN
      RETURN OLD;
    END IF;

    PERFORM public.pt_revoke(
      v_team_id, OLD.mem_id, 'comp_record', OLD.race_dt, 'race_result', OLD.race_result_id,
      '대회 기록 삭제: ' || OLD.race_nm
    );

    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.pt_trg_rec_race_hist() IS
  '대회 기록 등록(INSERT)/삭제(hard delete, DELETE) 적립·회수. aply_dt=race_dt, pt_earn 내부 도입일 가드가 2026-07-01 이전 대회 기록을 자동 차단(§6)';

CREATE TRIGGER trg_pt_rec_race_hist
  AFTER INSERT OR DELETE ON public.rec_race_hist
  FOR EACH ROW EXECUTE FUNCTION public.pt_trg_rec_race_hist();

-- ------------------------------------------------------------
-- 9. ⑤evt_mlg_act_hist — 마일리지런 기록 1일 1건 적립/회수 + 목표 재판정
--    mem_id/team_id가 직접 없어 evt_team_prt_rel(→evt_team_mst) 조인 필요.
--    실제 삭제 방식은 하드 delete(app/actions/mileage-run.ts deleteActivity 확인).
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pt_trg_evt_mlg_act_hist()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS
$$
DECLARE
  v_mem_id   uuid;
  v_team_id  uuid;
  v_remain   integer;
  v_goal     record;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT p.mem_id, t.team_id INTO v_mem_id, v_team_id
    FROM public.evt_team_prt_rel p JOIN public.evt_team_mst t ON t.evt_id = p.evt_id
    WHERE p.prt_id = NEW.prt_id;

    IF FOUND THEN
      PERFORM public.pt_earn_mlg_record(v_team_id, v_mem_id, NEW.act_dt, '마일리지런 기록: ' || to_char(NEW.act_dt, 'YYYY-MM-DD'));

      FOR v_goal IN
        SELECT goal_id FROM public.evt_mlg_mth_snap
        WHERE prt_id = NEW.prt_id AND base_dt = date_trunc('month', NEW.act_dt)::date
      LOOP
        PERFORM public.recheck_mlg_goal(v_goal.goal_id);
      END LOOP;
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    SELECT p.mem_id, t.team_id INTO v_mem_id, v_team_id
    FROM public.evt_team_prt_rel p JOIN public.evt_team_mst t ON t.evt_id = p.evt_id
    WHERE p.prt_id = OLD.prt_id;

    IF FOUND THEN
      SELECT count(*) INTO v_remain
      FROM public.evt_mlg_act_hist
      WHERE prt_id = OLD.prt_id AND act_dt = OLD.act_dt AND act_id <> OLD.act_id;

      IF v_remain = 0 THEN
        PERFORM public.pt_revoke_mlg_record(v_team_id, v_mem_id, OLD.act_dt, '마일리지런 기록 삭제: ' || to_char(OLD.act_dt, 'YYYY-MM-DD'));
      END IF;

      FOR v_goal IN
        SELECT goal_id FROM public.evt_mlg_mth_snap
        WHERE prt_id = OLD.prt_id AND base_dt = date_trunc('month', OLD.act_dt)::date
      LOOP
        PERFORM public.recheck_mlg_goal(v_goal.goal_id);
      END LOOP;
    END IF;

    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.act_dt IS DISTINCT FROM OLD.act_dt THEN
      SELECT p.mem_id, t.team_id INTO v_mem_id, v_team_id
      FROM public.evt_team_prt_rel p JOIN public.evt_team_mst t ON t.evt_id = p.evt_id
      WHERE p.prt_id = NEW.prt_id;

      IF FOUND THEN
        -- 옛 날짜: 이 기록을 뺀 나머지가 없으면 회수
        SELECT count(*) INTO v_remain
        FROM public.evt_mlg_act_hist
        WHERE prt_id = OLD.prt_id AND act_dt = OLD.act_dt AND act_id <> OLD.act_id;

        IF v_remain = 0 THEN
          PERFORM public.pt_revoke_mlg_record(v_team_id, v_mem_id, OLD.act_dt, '마일리지런 날짜 변경(이전 날짜 회수): ' || to_char(OLD.act_dt, 'YYYY-MM-DD'));
        END IF;

        -- 새 날짜: 그날 첫 유효 기록이면 적립(자기 자신 포함 이미 존재하므로 net=0 검사로 충분)
        PERFORM public.pt_earn_mlg_record(v_team_id, v_mem_id, NEW.act_dt, '마일리지런 기록: ' || to_char(NEW.act_dt, 'YYYY-MM-DD'));

        FOR v_goal IN
          SELECT goal_id FROM public.evt_mlg_mth_snap
          WHERE prt_id = OLD.prt_id
            AND base_dt IN (date_trunc('month', OLD.act_dt)::date, date_trunc('month', NEW.act_dt)::date)
        LOOP
          PERFORM public.recheck_mlg_goal(v_goal.goal_id);
        END LOOP;
      END IF;
    ELSE
      -- 날짜는 그대로, 거리 등 값만 바뀐 경우도 목표 달성 여부가 바뀔 수 있음
      FOR v_goal IN
        SELECT goal_id FROM public.evt_mlg_mth_snap
        WHERE prt_id = NEW.prt_id AND base_dt = date_trunc('month', NEW.act_dt)::date
      LOOP
        PERFORM public.recheck_mlg_goal(v_goal.goal_id);
      END LOOP;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.pt_trg_evt_mlg_act_hist() IS
  '마일리지런 기록 INSERT/UPDATE/DELETE(hard delete) — 1일 1건 적립/회수(§6 하단) + 월 목표 재판정(recheck_mlg_goal) 호출';

CREATE TRIGGER trg_pt_evt_mlg_act_hist
  AFTER INSERT OR UPDATE OR DELETE ON public.evt_mlg_act_hist
  FOR EACH ROW EXECUTE FUNCTION public.pt_trg_evt_mlg_act_hist();

-- ------------------------------------------------------------
-- 10. ⑥evt_mlg_mth_snap — 목표(goal_mlg) 변경 시 재판정
--     achv_mlg/achv_yn도 같은 UPDATE로 갱신되므로(recalcGoalsFromMonth) goal_mlg 변경만 훅.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pt_trg_evt_mlg_mth_snap()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS
$$
BEGIN
  IF NEW.goal_mlg IS DISTINCT FROM OLD.goal_mlg OR NEW.achv_mlg IS DISTINCT FROM OLD.achv_mlg THEN
    PERFORM public.recheck_mlg_goal(NEW.goal_id);
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.pt_trg_evt_mlg_mth_snap() IS
  '월 목표(goal_mlg) 또는 달성 마일리지(achv_mlg) 변경 시 목표 달성 재판정(§6)';

CREATE TRIGGER trg_pt_evt_mlg_mth_snap
  AFTER UPDATE ON public.evt_mlg_mth_snap
  FOR EACH ROW EXECUTE FUNCTION public.pt_trg_evt_mlg_mth_snap();

-- ------------------------------------------------------------
-- 11. ⑦sch_post_mst — 정보 등록 적립 / 소프트 삭제 회수
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
    IF NEW.del_yn = true AND OLD.del_yn = false THEN
      v_aply_dt := (OLD.crt_at AT TIME ZONE 'Asia/Seoul')::date;
      PERFORM public.pt_revoke(
        OLD.team_id, OLD.crt_by, 'sch_post', v_aply_dt, 'sch_post', OLD.sch_post_id,
        '정보 삭제: ' || OLD.sch_nm
      );
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.pt_trg_sch_post_mst() IS
  '정보 등록(INSERT) 적립 / 소프트 삭제(del_yn false→true, app/actions/schedule/manage-sch-post.ts deleteSchPost 확인) 회수. aply_dt=작성일(crt_at, KST)(§6)';

CREATE TRIGGER trg_pt_sch_post_mst
  AFTER INSERT OR UPDATE ON public.sch_post_mst
  FOR EACH ROW EXECUTE FUNCTION public.pt_trg_sch_post_mst();

-- ------------------------------------------------------------
-- 12. comp_mst — 대회 개최일(stt_dt) 변경(연기 등) 시 comp_join 재적립
--     comp_reg_rel(참가 신청)의 aply_dt가 comp_mst.stt_dt에서 파생되므로,
--     대회일이 바뀌면 그 대회에 연결된 모든 참가 신청을 "옛 날짜"로 revoke 후
--     "새 날짜"로 재적립한다(도입일 가드 재적용). comp_record(rec_race_hist.race_dt
--     기준)는 개별 기록의 실제 완주일이라 대회 예정일 변경과 무관 — 건드리지 않음.
--     조인 경로: comp_mst.comp_id → team_comp_plan_rel.comp_id → comp_reg_rel.team_comp_id
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pt_trg_comp_mst()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS
$$
DECLARE
  v_old_aply_dt date;
  v_new_aply_dt date;
  v_reg         record;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.stt_dt IS DISTINCT FROM OLD.stt_dt THEN
    v_old_aply_dt := OLD.stt_dt;
    v_new_aply_dt := NEW.stt_dt;

    FOR v_reg IN
      SELECT r.comp_reg_id, r.mem_id, tc.team_id
      FROM public.team_comp_plan_rel tc
      JOIN public.comp_reg_rel r ON r.team_comp_id = tc.team_comp_id
      WHERE tc.comp_id = NEW.comp_id
    LOOP
      PERFORM public.pt_revoke(
        v_reg.team_id, v_reg.mem_id, 'comp_join', v_old_aply_dt,
        'comp_reg', v_reg.comp_reg_id, '대회 일정 변경으로 참가 포인트 재조정: ' || NEW.comp_nm
      );
      -- pt_earn 내부에서 도입일 가드 재적용 — 새 날짜가 2026-07-01 이전이면 revoke만 되고 재적립 안 됨
      PERFORM public.pt_earn(
        v_reg.team_id, v_reg.mem_id, 'comp_join', v_new_aply_dt,
        'comp_reg', v_reg.comp_reg_id, '대회 참가: ' || NEW.comp_nm
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.pt_trg_comp_mst() IS
  '대회 개최일(stt_dt) 변경(연기 등) 시 그 대회의 모든 comp_join 적립을 재조정. comp_record는 무관(§6, §11 결정로그)';

CREATE TRIGGER trg_pt_comp_mst
  AFTER UPDATE ON public.comp_mst
  FOR EACH ROW EXECUTE FUNCTION public.pt_trg_comp_mst();

-- ------------------------------------------------------------
-- 13. API 노출 차단 — public 스키마 함수는 PostgREST /rpc/ 로 호출될 수 있고
--     Postgres 기본값은 PUBLIC에 EXECUTE 부여. 특히 recheck_mlg_goal은
--     SECURITY DEFINER(RETURNS void)라 클라이언트가 직접 호출 가능해지므로 전면 회수.
--     (트리거 함수 RETURNS trigger는 RPC 호출 불가라 대상 아님)
-- ------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.pt_intro_dt() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pt_rule_amt(public.pt_actv_type_enm) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pt_net_by_ref(uuid, public.pt_actv_type_enm, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pt_net_mlg_record(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pt_earn(uuid, uuid, public.pt_actv_type_enm, date, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pt_revoke(uuid, uuid, public.pt_actv_type_enm, date, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pt_earn_mlg_record(uuid, uuid, date, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pt_revoke_mlg_record(uuid, uuid, date, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pt_gthr_actv_type(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recheck_mlg_goal(uuid) FROM PUBLIC, anon, authenticated;
