-- KST 날짜 경계 변환 표준 헬퍼 (dev·prd 적용).
--
-- 배경: timestamptz(UTC 저장) 컬럼을 KST 달력 날짜로 필터링할 때 매번 손으로
--   AT TIME ZONE을 작성하다 보니 잘못된 패턴이 반복됨:
--     - p_start::timestamptz AT TIME ZONE 'Asia/Seoul'  ← 세션 TZ가 개입해 9시간 밀림(버그)
--     - evt_stt_at::date >= p_start                      ← 세션 TZ(UTC) 기준으로 날짜가 잘려 밤 일정이 하루 밀림
--   증상: 월 말일/새벽 시간대 모임·소식이 캘린더에서 누락.
--
-- 표준: timestamptz 컬럼 ts에 대해
--   ts >= kst_day_start(p_start) AND ts < kst_day_end_excl(p_end)
-- 로 비교하면 KST 자정 기준으로 정확히 필터링된다.
--
-- 주의: date 컬럼(예: comp_mst.stt_dt)은 타임존 개념이 없어 date끼리 비교하면 되며 헬퍼 불필요.

CREATE OR REPLACE FUNCTION public.kst_day_start(d date)
RETURNS timestamptz LANGUAGE sql IMMUTABLE PARALLEL SAFE AS
$$ SELECT (d::timestamp AT TIME ZONE 'Asia/Seoul'); $$;

CREATE OR REPLACE FUNCTION public.kst_day_end_excl(d date)
RETURNS timestamptz LANGUAGE sql IMMUTABLE PARALLEL SAFE AS
$$ SELECT ((d + 1)::timestamp AT TIME ZONE 'Asia/Seoul'); $$;

COMMENT ON FUNCTION public.kst_day_start(date) IS 'KST 날짜의 자정(00:00 KST)에 해당하는 UTC instant. timestamptz 컬럼의 KST 날짜 시작 경계 비교용 (>=).';
COMMENT ON FUNCTION public.kst_day_end_excl(date) IS 'KST 다음날 자정(익일 00:00 KST) UTC instant. 끝 경계 exclusive 비교용 (<).';
