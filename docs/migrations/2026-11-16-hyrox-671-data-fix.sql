-- #671 운영(prd) 데이터 보정 **초안** — 아직 적용하지 않았다. 운영 적용은 사람 승인 뒤 수동으로 돌린다.
-- (supabase/migrations 가 아니라 여기 둔 이유: 특정 prd 대회 한 건을 고치는 일회성 보정이라 dev·새 환경에
--  돌 이유가 없다. dev 엔 이 대회가 없어 돌려도 0행이다.)
-- ⚠️ 실제 DB 에서 돌려 보지 않았다 — 문법·논리 검토만 했다. 처음 돌릴 땐 끝의 COMMIT 을 ROLLBACK 으로 바꿔
--    NOTICE·확인 쿼리를 본 뒤 다시 돌릴 것.
--
-- ■ 원인 (2026-11-16 prd 읽기 전용 조회)
--   유일한 하이록스 대회 「서울 하이록스」(comp_id 1e3ae4b7-…, 2026-11-13)가
--     - 종목 comp_sprt_cd = 'road_run'   (등록 폼 기본값 그대로)
--     - 코스 comp_evt_type = 'OPEN SINGLE'·'OPEN DOUBLE'·'PRO SINGLE'·'PRO DOUBLE' (「기타」 직접 입력)
--   으로 등록돼, 종목 hyrox + 코스 OPEN·PRO·DOUBLES 만 읽는 전당 하이록스 판·MCP 에 기록 2건이 안 잡혔다.
--
-- ■ 고치는 것 — 결과적으로 이 대회엔 OPEN · DOUBLES (+있으면 RELAY) 만 남는다
--   기강엔 프로 참가자가 없어 전부 오픈으로 친다(2026-11-16 현근 결정).
--     OPEN SINGLE → OPEN     (행 이름만 바꾼다 — comp_evt_id 유지, 기록 1건 그대로 연결)
--     OPEN DOUBLE → DOUBLES  (같음 — 기록 1건 그대로 연결)
--     PRO SINGLE  → 신청·기록을 OPEN 행으로 옮긴 뒤 소프트삭제
--     PRO DOUBLE  → 신청·기록을 DOUBLES 행으로 옮긴 뒤 소프트삭제
--   (오픈 쪽 행이 없으면 프로 행의 이름을 OPEN/DOUBLES 로 바꿔 그대로 쓴다)
--   그리고 대회 종목을 hyrox 로.
--
--   - 기록을 옮겨도 포인트는 안 흔들린다: 포인트 트리거는 rec_race_hist INSERT·DELETE 에만 걸려 있다.
--     변경 이력(chg_hist)엔 UPDATE 로 남는다.
--   - 옮길 때 같은 사람·같은 날·같은 대회명 기록이 이미 OPEN/DOUBLES 쪽에 있으면 유니크
--     (mem_id, comp_evt_id, race_dt, race_nm, vers)에 걸리므로 **미리 멈춘다**(사람이 판단).
--     참가 신청(comp_reg_rel)은 한 사람 한 행(team_comp_id, mem_id)이라 옮겨도 충돌하지 않는다.
--
-- ■ 돌린 뒤
--   전당 캐시(records:{팀}, 24시간)는 DB 변경으로 안 털린다. 이 PR 이 키를 v10 으로 올려 두었으니
--   **이 SQL → 이 PR 이 들어간 운영 배포** 순서면 바로 보인다. 배포가 먼저 나갔다면 그 팀 아무 기록이나
--   저장·수정하면 털리고, 아니면 최대 24시간 뒤 맞는다. MCP list_hyrox_rankings 는 캐시가 없어 즉시 보인다.
--
-- ■ 확인 쿼리(돌리기 전·후) — 후에는 OPEN·DOUBLES 만 del_yn=false 로 남고 기록 1·1 건이어야 한다
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
  v_cnt integer;
  -- (옛 코스, 남길 부문). 오픈 쪽을 먼저 처리해 프로 쪽이 합칠 대상을 찾게 한다
  v_map constant text[][] := ARRAY[
    ['OPEN SINGLE', 'OPEN'],
    ['OPEN DOUBLE', 'DOUBLES'],
    ['PRO SINGLE',  'OPEN'],
    ['PRO DOUBLE',  'DOUBLES']
  ];
  v_src text;
  v_dst text;
  v_src_id uuid;
  v_dst_id uuid;
  i integer;
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

  -- 이미 부문 코드 행이 있으면(소프트삭제 포함) 아래 rename 이 유니크(comp_id, comp_evt_type, vers)에
  -- 걸리거나 엉뚱한 행과 합쳐진다 — 미리 멈춘다
  SELECT count(*) INTO v_cnt
  FROM public.comp_evt_cfg
  WHERE comp_id = v_comp_id AND vers = 0 AND upper(btrim(comp_evt_type)) IN ('OPEN', 'PRO', 'DOUBLES', 'RELAY');
  IF v_cnt > 0 THEN
    RAISE EXCEPTION '#671: 이 대회에 이미 부문 코드 코스가 % 개 있다 — 매핑을 다시 짤 것', v_cnt;
  END IF;

  FOR i IN 1 .. array_length(v_map, 1) LOOP
    v_src := v_map[i][1];
    v_dst := v_map[i][2];

    SELECT comp_evt_id INTO v_src_id
    FROM public.comp_evt_cfg
    WHERE comp_id = v_comp_id AND vers = 0 AND del_yn = false AND comp_evt_type = v_src;
    CONTINUE WHEN v_src_id IS NULL;

    SELECT comp_evt_id INTO v_dst_id
    FROM public.comp_evt_cfg
    WHERE comp_id = v_comp_id AND vers = 0 AND del_yn = false AND comp_evt_type = v_dst;

    IF v_dst_id IS NULL THEN
      -- 남길 부문 행이 아직 없다 → 이 행의 이름을 바꿔 그대로 쓴다(comp_evt_id 유지)
      UPDATE public.comp_evt_cfg SET comp_evt_type = v_dst WHERE comp_evt_id = v_src_id;
      RAISE NOTICE '#671: % → % (행 유지)', v_src, v_dst;
    ELSE
      -- 이미 있다 → 신청·기록을 그쪽으로 옮기고 이 행은 소프트삭제
      SELECT count(*) INTO v_cnt
      FROM public.rec_race_hist a
      JOIN public.rec_race_hist b
        ON b.comp_evt_id = v_dst_id
       AND b.mem_id = a.mem_id AND b.race_dt = a.race_dt AND b.race_nm = a.race_nm AND b.vers = a.vers
      WHERE a.comp_evt_id = v_src_id;
      IF v_cnt > 0 THEN
        RAISE EXCEPTION '#671: % 기록 % 건이 % 쪽 기록과 겹친다(같은 사람·날·대회명) — 사람이 판단할 것',
          v_src, v_cnt, v_dst;
      END IF;

      UPDATE public.rec_race_hist SET comp_evt_id = v_dst_id WHERE comp_evt_id = v_src_id;
      GET DIAGNOSTICS v_cnt = ROW_COUNT;
      RAISE NOTICE '#671: % 기록 % 건 → %', v_src, v_cnt, v_dst;

      UPDATE public.comp_reg_rel SET comp_evt_id = v_dst_id WHERE comp_evt_id = v_src_id;
      GET DIAGNOSTICS v_cnt = ROW_COUNT;
      RAISE NOTICE '#671: % 신청 % 건 → %', v_src, v_cnt, v_dst;

      UPDATE public.comp_evt_cfg SET del_yn = true WHERE comp_evt_id = v_src_id;
      RAISE NOTICE '#671: % 소프트삭제', v_src;
    END IF;
  END LOOP;

  -- 남은 코스가 부문 코드뿐인지 — 위 넷 말고 다른 직접 입력 코스가 있었으면 멈춘다
  SELECT count(*) INTO v_cnt
  FROM public.comp_evt_cfg
  WHERE comp_id = v_comp_id AND vers = 0 AND del_yn = false
    AND upper(btrim(comp_evt_type)) NOT IN ('OPEN', 'DOUBLES', 'RELAY');
  IF v_cnt > 0 THEN
    RAISE EXCEPTION '#671: 부문 코드가 아닌 코스가 % 개 남는다 — 매핑을 다시 짤 것', v_cnt;
  END IF;

  -- 대회 종목 (comp_sprt_cd 검증 트리거가 COMP_SPRT_CD 의 hyrox 를 확인한다)
  UPDATE public.comp_mst SET comp_sprt_cd = 'hyrox' WHERE comp_id = v_comp_id AND vers = 0;

  RAISE NOTICE '#671: 보정 완료';
END;
$$;

-- 확인: 기록 2건이 HYROX_OPEN · HYROX_DOUBLES 로 나와야 한다
-- SELECT evt_cd, mem_nm, rec_time_sec FROM public.get_public_team_hyrox_rankings('<기강 team_id>');

COMMIT;
