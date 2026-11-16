-- #671 운영(prd) 데이터 보정 **초안** — 아직 적용하지 않았다. 운영 적용은 사람 승인 뒤 수동으로 돌린다.
-- (supabase/migrations 가 아니라 여기 둔 이유: 특정 prd 대회 한 건을 고치는 일회성 보정이라 dev·새 환경에
--  돌 이유가 없다. dev 엔 이 대회가 없어 돌려도 0행이다.)
--
-- ■ 원인 (2026-11-16 prd 읽기 전용 조회)
--   유일한 하이록스 대회 「서울 하이록스」(comp_id 1e3ae4b7-…, 2026-11-13)가
--     - 종목 comp_sprt_cd = 'road_run'   (등록 폼 기본값 그대로)
--     - 코스 comp_evt_type = 'OPEN SINGLE'·'OPEN DOUBLE'·'PRO SINGLE'·'PRO DOUBLE' (「기타」 직접 입력)
--   으로 등록돼, 종목 hyrox + 코스 OPEN·PRO·DOUBLES 만 읽는 전당 하이록스 판·MCP 에 기록 2건이 안 잡혔다.
--
-- ■ 고치는 것 — comp_evt_id 는 그대로 두고 문자열만 바꾼다(기록·참가 신청의 연결이 안 끊긴다)
--     OPEN SINGLE → OPEN
--     PRO SINGLE  → PRO
--     OPEN DOUBLE → DOUBLES
--     PRO DOUBLE  → DOUBLES 로 합친다(부문 코드에 프로 더블스가 따로 없다): 참가 신청은 DOUBLES 쪽으로
--                   옮기고 행은 소프트삭제. **기록이 붙어 있으면 멈춘다**(사람이 판단).
--   그리고 대회 종목을 hyrox 로.
--
-- ■ 돌린 뒤
--   전당 캐시(records:{팀}, 24시간)는 DB 변경으로 안 털린다. 이 PR 이 키를 v10 으로 올려 두었으니
--   **이 SQL → 이 PR 이 들어간 운영 배포** 순서면 바로 보인다. 배포가 먼저 나갔다면 그 팀 아무 기록이나
--   저장·수정하면 털리고, 아니면 최대 24시간 뒤 맞는다. MCP list_hyrox_rankings 는 캐시가 없어 즉시 보인다.
--
-- ■ 확인 쿼리(돌리기 전·후)
--   SELECT ce.comp_evt_id, ce.comp_evt_type, ce.del_yn,
--          (SELECT count(*) FROM public.rec_race_hist r WHERE r.comp_evt_id = ce.comp_evt_id AND r.vers = 0 AND r.del_yn = false) AS rec_cnt,
--          (SELECT count(*) FROM public.comp_reg_rel g WHERE g.comp_evt_id = ce.comp_evt_id AND g.vers = 0 AND g.del_yn = false) AS reg_cnt
--   FROM public.comp_evt_cfg ce
--   WHERE ce.comp_id = '1e3ae4b7-a92d-4269-8ba9-47b8a8a12bb8' AND ce.vers = 0;

BEGIN;
SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  v_comp_id constant uuid := '1e3ae4b7-a92d-4269-8ba9-47b8a8a12bb8';
  v_sprt text;
  v_doubles_id uuid;
  v_pro_double_id uuid;
  v_cnt integer;
BEGIN
  SELECT comp_sprt_cd INTO v_sprt
  FROM public.comp_mst
  WHERE comp_id = v_comp_id AND vers = 0 AND del_yn = false;

  IF NOT FOUND THEN
    RAISE NOTICE '#671: 대상 대회가 없다 — 이 환경엔 해당 없음, 아무것도 안 바꾼다';
    RETURN;
  END IF;
  IF v_sprt = 'hyrox' THEN
    RAISE NOTICE '#671: 이미 hyrox — 이미 보정된 것으로 보고 멈춘다';
    RETURN;
  END IF;
  IF v_sprt IS DISTINCT FROM 'road_run' THEN
    RAISE EXCEPTION '#671: 예상한 종목(road_run)이 아니다: % — 다시 조회하고 판단할 것', v_sprt;
  END IF;

  -- 이미 부문 코드 행이 있으면 아래 rename 이 유니크(comp_id, comp_evt_type, vers)에 걸린다 — 미리 멈춘다
  SELECT count(*) INTO v_cnt
  FROM public.comp_evt_cfg
  WHERE comp_id = v_comp_id AND vers = 0 AND upper(btrim(comp_evt_type)) IN ('OPEN', 'PRO', 'DOUBLES', 'RELAY');
  IF v_cnt > 0 THEN
    RAISE EXCEPTION '#671: 이 대회에 이미 부문 코드 코스가 % 개 있다 — 매핑을 다시 짤 것', v_cnt;
  END IF;

  -- ① 싱글·오픈 더블 → 부문 코드 (comp_evt_id 유지)
  UPDATE public.comp_evt_cfg SET comp_evt_type = 'OPEN'
  WHERE comp_id = v_comp_id AND vers = 0 AND del_yn = false AND comp_evt_type = 'OPEN SINGLE';
  UPDATE public.comp_evt_cfg SET comp_evt_type = 'PRO'
  WHERE comp_id = v_comp_id AND vers = 0 AND del_yn = false AND comp_evt_type = 'PRO SINGLE';
  UPDATE public.comp_evt_cfg SET comp_evt_type = 'DOUBLES'
  WHERE comp_id = v_comp_id AND vers = 0 AND del_yn = false AND comp_evt_type = 'OPEN DOUBLE'
  RETURNING comp_evt_id INTO v_doubles_id;

  -- ② 프로 더블 → DOUBLES 로 합치기
  SELECT comp_evt_id INTO v_pro_double_id
  FROM public.comp_evt_cfg
  WHERE comp_id = v_comp_id AND vers = 0 AND del_yn = false AND comp_evt_type = 'PRO DOUBLE';

  IF v_pro_double_id IS NOT NULL THEN
    SELECT count(*) INTO v_cnt FROM public.rec_race_hist WHERE comp_evt_id = v_pro_double_id;
    IF v_cnt > 0 THEN
      RAISE EXCEPTION '#671: PRO DOUBLE 에 기록이 % 건 있다 — 합치지 말고 사람이 판단할 것', v_cnt;
    END IF;

    IF v_doubles_id IS NULL THEN
      -- 오픈 더블 행이 없었으면 프로 더블 행을 그대로 DOUBLES 로 바꾼다
      UPDATE public.comp_evt_cfg SET comp_evt_type = 'DOUBLES' WHERE comp_evt_id = v_pro_double_id;
    ELSE
      -- 참가 신청은 DOUBLES 로 옮기고(comp_reg_rel 은 한 사람 한 행이라 충돌 없음) 행은 소프트삭제
      UPDATE public.comp_reg_rel SET comp_evt_id = v_doubles_id WHERE comp_evt_id = v_pro_double_id;
      UPDATE public.comp_evt_cfg SET del_yn = true WHERE comp_evt_id = v_pro_double_id;
    END IF;
  END IF;

  -- ③ 대회 종목 (comp_sprt_cd 검증 트리거가 COMP_SPRT_CD 의 hyrox 를 확인한다)
  UPDATE public.comp_mst SET comp_sprt_cd = 'hyrox' WHERE comp_id = v_comp_id AND vers = 0;

  RAISE NOTICE '#671: 보정 완료';
END;
$$;

-- 확인: 기록 2건이 HYROX_OPEN · HYROX_DOUBLES 로 나와야 한다
-- SELECT evt_cd, mem_nm, rec_time_sec FROM public.get_public_team_hyrox_rankings('<기강 team_id>');

COMMIT;
