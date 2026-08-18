-- 칭호 배치 2종을 batch_job_mst 에 등록.
--
-- 설계: docs/design/2026-08-14-배치-자동화.md §2.1
--       docs/design/2026-07-30-신규-칭호-후보-모임-깅스타그램.md §7.2
--
-- 핸들러는 `lib/batch/execute.ts`의 BATCH_ACTION_MAP 에 이미 매핑돼 있다.
-- ⚠️ **행을 먼저 넣고 핸들러를 나중에 만들면 안 된다** — 크론이 매일 "매핑된 액션이 없습니다"로
--    실패하고 그때마다 운영진에게 실패 알림이 나간다. 그래서 이 마이그레이션은 코드와 함께 나간다.
--
-- 두 배치를 가르는 기준은 **"달이 끝나야 값이 정해지는가"**다:
--   - 일 배치: 미라클·올빼미·오픈런(월 N회) · 3연벙 · 하루에두번 · 생일축하해
--             → 채우는 순간 확정이라 매일 봐도 된다.
--   - 월 배치: 프로참석러(그 달 참석률)
--             → 달 중간에 75%였다가 남은 모임을 빠지면 최종은 70% 아래인데,
--               엔진이 비회수라 먼저 준 칭호는 안 돌아온다.
--
-- 취소 계열(다음엔꼭·회전문·월요병·칼퇴실패·구구절절)과 막차는 여기 없다 — 취소·신청
-- 액션에서 그 순간 판정한다(`gathering_attend` 트리거).

INSERT INTO batch_job_mst (job_nm, job_cd, job_desc, freq_cd, team_id, param_schema_json)
VALUES
  (
    '칭호 - 모임 참석 (일 배치)',
    'TITLE_GATHERING_DAILY',
    '모임 참석 계열 칭호를 평가·부여합니다. 끝난 지 3일 지난 모임까지만 봅니다(운영진이 안 나온 사람을 취소 처리할 시간).',
    'daily',
    (SELECT team_id FROM team_mst WHERE team_cd = 'gigang' AND del_yn = false LIMIT 1),
    NULL
  ),
  (
    '칭호 - 월 마감 (월 배치)',
    'TITLE_MONTHLY',
    '달이 끝나야 확정되는 칭호를 평가·부여합니다(그 달 참석률 등). 현재월·미래월 시행 금지.',
    'monthly',
    (SELECT team_id FROM team_mst WHERE team_cd = 'gigang' AND del_yn = false LIMIT 1),
    '[
      {
        "key": "base_month",
        "label": "기준 월",
        "type": "month",
        "required": true,
        "default": "prev_month",
        "description": "평가할 기준 월입니다. 기본값은 전월."
      }
    ]'::jsonb
  );
