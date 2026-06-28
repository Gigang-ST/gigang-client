-- get_member_monthly_activity — 멤버의 월간 활동 집계 RPC (출석 감면·칭호·랭킹 공유 기반).
--
-- 배경(설계 §4): 출석·개설·참석 집계는 회비 감면 전용이 아니라 곧 만들 칭호·랭킹도 쓸
--   공통 기반이다. 그래서 집계의 인터페이스(RPC)를 지금 확정하고, 내부 구현은 즉석 쿼리로 둔다.
--   성능 이슈가 생기면 이 함수 "속만" 월별 집계 스냅샷 테이블을 읽도록 교체한다(호출부 불변).
--
-- 반환은 중립적 숫자만. 게이트 판정(정모/개설) 같은 로직은 여기 두지 않고
-- 소비처 calcExemption(lib/dues/calc-exemption.ts)에 둔다.
--
-- hosted_cnt 는 gthr_attd_rel JOIN 과 무관하게 gthr_mst.crt_by 로만 센다
-- (게이트 판정용: 개설 사실 자체, 참석 여부 무관).
--
-- KST 월 경계는 표준 헬퍼 kst_day_start(date) 재사용. 월 시작 = p_ym 1일,
-- 끝(exclusive) = 다음 달 1일의 시작.
--
-- ⚠️ gthr_attd_rel 스키마 전제: 현재 참석 취소 = hard delete(row 삭제)라 별도 필터 불필요.
--    향후 soft delete(del_yn 컬럼)로 바꾸면 아래 JOIN 에 AND a.del_yn=false 추가 필수.

CREATE OR REPLACE FUNCTION public.get_member_monthly_activity(
  p_team_id uuid,
  p_mem_id  uuid,
  p_ym      text   -- 'YYYY-MM'
)
RETURNS TABLE (
  attend_cnt         integer,
  regular_attend_cnt integer,
  hosted_cnt         integer
)
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  WITH bounds AS (
    SELECT
      to_date(p_ym || '-01', 'YYYY-MM-DD')                          AS month_start,
      (to_date(p_ym || '-01', 'YYYY-MM-DD') + interval '1 month')::date AS next_month
  )
  SELECT
    count(*) FILTER (WHERE a.mem_id = p_mem_id)::int                                   AS attend_cnt,
    count(*) FILTER (WHERE a.mem_id = p_mem_id AND g.gthr_type_enm = 'regular')::int   AS regular_attend_cnt,
    count(DISTINCT g.gthr_id) FILTER (WHERE g.crt_by = p_mem_id)::int                  AS hosted_cnt
  FROM bounds b
  JOIN public.gthr_mst g
    ON g.team_id = p_team_id
   AND g.del_yn  = false
   AND g.stt_at >= public.kst_day_start(b.month_start)
   AND g.stt_at <  public.kst_day_start(b.next_month)
  LEFT JOIN public.gthr_attd_rel a
    ON a.gthr_id = g.gthr_id
   AND a.mem_id  = p_mem_id;
$$;

COMMENT ON FUNCTION public.get_member_monthly_activity(uuid, uuid, text) IS
  '멤버의 월간(KST) 활동 집계: 총참석·정모참석·개설 수. 출석 감면·칭호·랭킹 공유 기반(설계 §4).';
