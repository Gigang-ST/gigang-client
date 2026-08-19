-- 신규 칭호 시드·배치 등록이 **실제로 들어갔는지** 확인하고, 안 들어갔으면 배포를 실패시킨다.
--
-- 왜 필요한가: 앞선 세 마이그레이션(배치 등록 · 모임 칭호 시드 · 소셜 칭호 시드)은 모두
--   INSERT ... SELECT ... CROSS JOIN (SELECT team_id FROM team_mst WHERE team_cd = 'gigang' ...)
-- 형태다. 이 서브쿼리가 0행이면 전체 SELECT가 0행이 되어 **아무것도 안 넣고 성공**한다.
-- `batch_job_mst.team_id`는 nullable이라 배치 행도 team_id NULL로 들어갈 수 있는데, 그러면
-- 크론이 `team_id 미설정`으로 조용히 skip한다 — 실패 알림조차 안 나가서 "마이그레이션 성공 +
-- 배치 영구 미실행"이 된다. 며칠 뒤 "왜 칭호가 안 붙지"로 발견되는 종류의 실패다.
--
-- 그래서 배포 시점에 못박는다. 여기서 터지면 팀 코드(`gigang`)를 먼저 확인할 것.
--
-- ⚠️ 이 마이그레이션은 **검증만 한다** — 데이터를 만들지 않는다. 앞 3건을 고치는 게 아니라,
-- 그것들이 조용히 no-op으로 끝나는 걸 막는 안전망이다.
DO $$
DECLARE
  v_team_id uuid;
  v_jobs    int;
  v_titles  int;
BEGIN
  SELECT team_id INTO v_team_id
    FROM public.team_mst
   WHERE team_cd = 'gigang' AND del_yn = false
   LIMIT 1;

  IF v_team_id IS NULL THEN
    RAISE EXCEPTION
      'team_cd=''gigang'' 팀을 찾을 수 없습니다. 앞선 시드 마이그레이션들이 0행을 넣고 성공했을 것입니다.';
  END IF;

  -- 칭호 배치 2종
  SELECT count(*) INTO v_jobs
    FROM public.batch_job_mst
   WHERE job_cd IN ('TITLE_GATHERING_DAILY', 'TITLE_MONTHLY')
     AND team_id = v_team_id;

  IF v_jobs <> 2 THEN
    RAISE EXCEPTION
      '칭호 배치 등록이 불완전합니다(기대 2건, 실제 %건). team_id가 NULL로 들어갔는지 확인하세요.', v_jobs;
  END IF;

  -- 신규 칭호 25종 중 **24종**이 적용일을 갖는다. `eff_stt_dt`가 곧 "신규분" 표식이다
  -- (기존 64종은 전부 NULL — 소급이 정상 동작인 칭호들이라 그대로 뒀다).
  --
  -- 24인 이유: `인간화로`(받은 응원 누적)만 `eff_stt_dt = NULL`로 시드한다. `rctn_mst`는
  -- (팀 × 항목 × 누른사람) 1행에 카운트를 누적하는 구조라 **개별 탭의 시각이 없어**
  -- 적용일 필터가 구조적으로 불가능하다. 문턱이 1,000이라 소급해도 받을 사람이 극소수다.
  SELECT count(*) INTO v_titles
    FROM public.ttl_mst
   WHERE team_id = v_team_id
     AND eff_stt_dt IS NOT NULL
     AND del_yn = false;

  IF v_titles < 24 THEN
    RAISE EXCEPTION
      '신규 칭호 시드가 불완전합니다(기대 24종 이상, 실제 %종).', v_titles;
  END IF;

  RAISE NOTICE '칭호 배치 %건 / 신규 칭호 %종 확인 (team_id=%)', v_jobs, v_titles, v_team_id;
END $$;

-- `result_json` 컬럼 주석을 실제 저장 형태로 바로잡는다.
-- 원 마이그레이션(20260814140000)은 metrics를 "라벨→숫자 맵"으로 적었는데, 실제로는 배열이다
-- (jsonb 객체는 Postgres가 키를 정렬해 저장해서 순서가 뒤섞인다 — 지표는 순서에 뜻이 있다).
-- 운영자가 이 주석을 근거로 쿼리를 짜면 없는 경로를 판다.
COMMENT ON COLUMN public.batch_run_hist.result_json IS
  '실행 결과 구조. { metrics: [{label,value}, ...], changedCount: int, changes: [{memNm,what}, ...], warnings: [text]|null }. '
  'metrics는 **배열**이다 — 객체로 두면 jsonb가 키를 정렬해 표시 순서가 뒤섞인다. '
  '옛 행은 이 컬럼이 NULL이므로 읽는 쪽은 항상 방어적으로 파싱한다(lib/batch/types.ts의 parseStoredBatchResult).';
