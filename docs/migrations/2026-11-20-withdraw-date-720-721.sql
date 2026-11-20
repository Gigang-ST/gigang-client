-- #720 · #721 운영(prd) 데이터 보정 — 7/16 상태 일괄 정리의 탈퇴일 바로잡기
-- ⚠️ 운영 적용은 사람 승인 뒤 수동으로 돌린다. (supabase/migrations 가 아니라 여기 둔 이유: 특정 시점의 일회성 보정이라
--    새 환경·dev 에서 돌 이유가 없다 — 대상 건수가 정확히 68 이 아니면 스스로 멈춘다. 2026-11-16-hyrox-671-data-fix.sql 과 같은 방식.)
-- ⚠️ 돌리기 전에 먼저 supabase/migrations/20261120120000_team_mem_rel_status_chg_hist.sql 을 적용해 둔다(없으면 이 SQL 이 멈춘다).
--    그러면 아래 UPDATE 가 변경 이력(chg_hist, 처리자='sql')에 전/후 값으로 남아 되돌릴 근거가 된다.
-- ⚠️ 처음엔 맨 끝 COMMIT 을 ROLLBACK 으로 바꿔 NOTICE 와 요약 결과를 본 뒤, 맞으면 COMMIT 으로 다시 돌린다.
--    NOTICE 는 psql 이나 Supabase MCP 에서 보인다 — 대시보드 SQL 편집기는 NOTICE 를 안 보여 주니 시험 실행에 쓰지 않는다.
--
-- ■ 원인
--   2026-07-16 01:13(KST) 1분 안에 비활성 → 탈퇴 일괄 변경이 있었다(상태 이력 기능 배포 직후, 처리자 기록 없음).
--   변경분은 탈퇴일(leave_dt)이 2026-07-16 으로, 상태 효력 시각(eff_at)이 01:13 으로 찍혀 실제 이탈 시점이 가려졌다.
--   바로 앞 이력 행(비활성, eff_at = 그 상태가 시작된 시각)에 원래 시작 시점이 남아 있다.
--
-- ■ 대상(조건으로만 고른다 — 개인 식별 정보 없음)
--   team_mem_rel 에서  mem_st_cd='left' · del_yn=false · leave_dt=2026-07-16
--   · eff_at 이 2026-07-16 01:13:00 ~ 01:15:00 KST  이고,
--   바로 앞(같은 팀·같은 회원에서 eff_at 이 가장 늦은 이전 행, 삭제 행 포함)이 삭제되지 않은 inactive 인 행.
--   그 시각 밖의 개별 탈퇴(예: 같은 날 06:58 의 1건)는 건드리지 않는다.
--   정본(vers=0)뿐 아니라 그 뒤 재활성화돼 이력(vers>0)으로 밀려난 같은 일괄분도 포함한다(이력 기간이 같은 오류를 안고 있다).
--   기대 건수: 전체 68 = 정본 65 + 이력 3 (2026-11-20 prd 백업 기준). 68 이 아니면 멈춘다.
--
-- ■ 고치는 것
--   탈퇴 행의 eff_at ← 비활성이 **실제로 시작된** 행의 eff_at, leave_dt ← 그 시각의 KST 날짜(가입일보다 앞서지 않게 보정).
--   바로 앞 비활성 행 뒤에 같은 상태로 역할만 바뀐 이력이 끼어 있어도(비활성 → 비활성) 같은 비활성 구간의 맨 처음 행을 잡는다.
--   복구(#721)는 운영자 확인 결과 대상이 없어 하지 않는다 — 후보였던 회원도 다른 대상과 같이 탈퇴일만 정정된다.
--
-- ■ 회비(#423/#424) 영향 — 없음
--   회비 제외 기간은 team_mem_rel 이력에서 **active 구간**만 만들어 판정한다(lib/dues/ledger-replay.ts buildActiveIntervals).
--   대상은 모두 이력의 첫 상태가 비활성이라 active 구간이 없고(또는 재활성 이후만), 탈퇴 행 eff_at 은 비활성 → 비활성으로
--   바뀔 뿐 active 구간의 시작·끝을 움직이지 않는다. leave_dt 는 화면 표시(몇 일째 탈퇴 상태인가)에만 쓴다.
--
-- ■ 확인 쿼리(돌리기 전·후) — 돌린 뒤에는 still_batch_stamped 가 0
--   SELECT count(*) FILTER (WHERE mem_st_cd='left' AND leave_dt = DATE '2026-07-16'
--                           AND eff_at >= TIMESTAMPTZ '2026-07-16 01:13:00+09' AND eff_at < TIMESTAMPTZ '2026-07-16 01:15:00+09') AS still_batch_stamped,
--          count(*) FILTER (WHERE mem_st_cd='left' AND leave_dt = DATE '2026-07-16') AS leave_0716_all
--   FROM public.team_mem_rel WHERE del_yn = false;
--   적용 뒤 변경 이력: SELECT count(*) FROM public.chg_hist WHERE tbl_nm='team_mem_rel' AND actor_src_cd='sql' AND crt_at > now() - interval '1 hour';  -- 약 68

BEGIN;
SET LOCAL lock_timeout = '3s';

-- 변경 이력 트리거가 없으면 정정이 이력에 안 남는다 — 멈춘다.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.team_mem_rel'::regclass
      AND tgname = 'chg_hist_capture'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'team_mem_rel 에 chg_hist_capture 트리거가 없다 — 20261120120000_team_mem_rel_status_chg_hist.sql 먼저 적용할 것';
  END IF;
END $$;

-- 같은 시각 구간에 탈퇴로 바뀐 행 전부 + 바로 앞 행(삭제 행 포함). ok_yn = 앞 행이 삭제되지 않은 비활성
CREATE TEMP TABLE _fix720_win ON COMMIT DROP AS
SELECT
  t.team_mem_id AS tgt_id,
  t.vers        AS tgt_vers,
  t.join_dt     AS join_dt,
  p.team_mem_id AS prev_id,
  p.eff_at      AS prev_eff_at,
  (p.mem_st_cd = 'inactive' AND p.del_yn = false) AS ok_yn
FROM public.team_mem_rel t
LEFT JOIN LATERAL (
  SELECT x.*
  FROM public.team_mem_rel x
  WHERE x.team_id = t.team_id
    AND x.mem_id = t.mem_id
    AND x.team_mem_id <> t.team_mem_id
    AND x.eff_at <= t.eff_at
  ORDER BY x.eff_at DESC, (x.vers = 0) DESC, x.vers DESC
  LIMIT 1
) p ON true
WHERE t.mem_st_cd = 'left'
  AND t.del_yn = false
  AND t.leave_dt = DATE '2026-07-16'
  AND t.eff_at >= TIMESTAMPTZ '2026-07-16 01:13:00+09'
  AND t.eff_at <  TIMESTAMPTZ '2026-07-16 01:15:00+09';

-- 정정 대상 + 비활성이 실제로 시작된 시각(같은 비활성이 이어진 구간의 첫 행)
CREATE TEMP TABLE _fix720 ON COMMIT DROP AS
SELECT
  w.tgt_id,
  w.tgt_vers,
  w.join_dt,
  s.start_at AS prev_eff_at,
  GREATEST((s.start_at AT TIME ZONE 'Asia/Seoul')::date, w.join_dt) AS new_leave_dt
FROM _fix720_win w
JOIN public.team_mem_rel pp ON pp.team_mem_id = w.prev_id
JOIN LATERAL (
  SELECT min(x.eff_at) AS start_at
  FROM public.team_mem_rel x
  WHERE x.team_id = pp.team_id
    AND x.mem_id = pp.mem_id
    AND x.mem_st_cd = 'inactive'
    AND x.del_yn = false
    AND x.eff_at <= pp.eff_at
    AND x.eff_at > COALESCE((
      -- 이 비활성 구간 바로 앞의 다른 상태(또는 삭제) 행 — 그 뒤부터가 같은 비활성 구간이다
      SELECT max(b.eff_at)
      FROM public.team_mem_rel b
      WHERE b.team_id = pp.team_id
        AND b.mem_id = pp.mem_id
        AND b.eff_at <= pp.eff_at
        AND (b.mem_st_cd <> 'inactive' OR b.del_yn)
    ), '-infinity'::timestamptz)
) s ON true
WHERE w.ok_yn;

DO $$
DECLARE
  v_win   integer;
  v_total integer;
  v_cur   integer;
  v_hist  integer;
  v_same  integer;
BEGIN
  SELECT count(*) INTO v_win FROM _fix720_win;
  SELECT count(*), count(*) FILTER (WHERE tgt_vers = 0), count(*) FILTER (WHERE tgt_vers > 0),
         count(*) FILTER (WHERE new_leave_dt = join_dt)
    INTO v_total, v_cur, v_hist, v_same
  FROM _fix720;
  RAISE NOTICE '#720 시각 구간(01:13~01:15 KST)의 탈퇴 행 %건 중 대상 %건 (정본 % · 재활성돼 이력으로 밀린 행 %)', v_win, v_total, v_cur, v_hist;
  RAISE NOTICE '앞 행이 비활성이 아니거나 삭제 행이라 빠지는 건수: %', v_win - v_total;
  RAISE NOTICE '정정 뒤 탈퇴일이 가입일과 같아지는 건수(가입일보다 앞서지 않게 보정된 것): %', v_same;
  IF v_total <> 68 THEN
    RAISE EXCEPTION '대상이 정확히 68건이어야 한다(실제 %) — 조건·데이터 점검', v_total;
  END IF;
END $$;

-- 탈퇴일·상태 효력 시각을 원래 비활성 시작 시점으로
UPDATE public.team_mem_rel t
SET eff_at   = f.prev_eff_at,
    leave_dt = f.new_leave_dt,
    upd_at   = now()
FROM _fix720 f
WHERE t.team_mem_id = f.tgt_id;

-- 결과 요약(PR 비교표용): 보정 뒤 월별 탈퇴일 분포
SELECT to_char(t.leave_dt, 'YYYY-MM') AS leave_month, count(*) AS cnt
FROM public.team_mem_rel t
JOIN _fix720 f ON f.tgt_id = t.team_mem_id
GROUP BY 1 ORDER BY 1;

COMMIT;
