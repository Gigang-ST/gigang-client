-- batch_run_hist.result_json — 실행 결과를 문장이 아니라 **구조로** 남긴다.
--
-- 배경(설계 docs/design/2026-08-14-배치-자동화.md §4):
--   배치는 내부적으로 꽤 세밀한 집계를 갖고 있다(`batchDuesExemption`만 해도 granted ·
--   skippedZero · alreadyGranted · skippedInactive · cappedCount를 따로 센다). 그런데
--   전부 한국어 문장 하나로 뭉쳐 `result_msg`에 넣어서:
--     - 자유 텍스트라 집계·비교가 안 된다("지난달보다 감면이 줄었나"를 눈으로 세야 한다)
--     - 누구에게 무슨 일이 있었는지 없다
--     - "성공 + 변화 0"과 "성공 + 5건"이 같은 초록 배지다
--
--   `result_msg`는 **그대로 둔다** — 한 줄 요약으로 쓸모가 있고, 지우면 기존 이력이 빈칸이 된다.
--
-- 형태:
--   { "metrics": { "대상": 34, "부여": 5 },
--     "changes": [ { "memNm": "홍길동", "what": "7월 회비 감면 2,000원" } ],
--     "warnings": [ "..." ] }
--
--   `metrics`는 **고정 필드가 아니라 라벨→숫자 맵**이다. 배치마다 세는 게 달라
--   (회비는 부여/미해당/기존부여, 마일리지런은 시즌/평가/부여) 컬럼을 고정하면 배치를
--   추가할 때마다 UI를 고쳐야 한다. 화면은 키를 모른 채 칩으로 그리기만 한다.

ALTER TABLE public.batch_run_hist
  ADD COLUMN result_json JSONB;

COMMENT ON COLUMN public.batch_run_hist.result_json IS
  '구조화된 실행 결과: { metrics: 라벨→숫자, changes: [{memNm, what}], warnings: string[] }. result_msg는 한 줄 요약으로 병행 유지(설계 §4.2).';
