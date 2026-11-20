-- #720 · #721 운영(prd) 데이터 보정 — 7/16 상태 일괄 정리의 탈퇴일 바로잡기 + 활동 회원 1명 복구
-- ⚠️ 운영 적용은 사람 승인 뒤 수동으로 돌린다. (supabase/migrations 가 아니라 여기 둔 이유: 특정 시점의 일회성 보정이라
--    새 환경·dev 에서 돌 이유가 없다. 대상이 없으면 0행이다 — 2026-11-16-hyrox-671-data-fix.sql 과 같은 방식.)
-- ⚠️ 돌리기 전에 먼저 supabase/migrations/20261120100000_team_mem_rel_status_chg_hist.sql 을 적용해 둔다.
--    그러면 아래 UPDATE 가 변경 이력(chg_hist, 처리자='sql')에 전/후 값으로 남아 되돌릴 근거가 된다.
-- ⚠️ 처음엔 맨 끝 COMMIT 을 ROLLBACK 으로 바꿔 NOTICE 와 확인 쿼리 결과만 본 뒤, 맞으면 COMMIT 으로 다시 돌린다.
--
-- ■ 원인
--   2026-07-16 01:13(KST) 1분 안에 비활성 → 탈퇴 일괄 변경이 있었다(상태 이력 기능 배포 직후, 처리자 기록 없음).
--   변경분은 탈퇴일(leave_dt)이 2026-07-16 으로, 상태 효력 시각(eff_at)이 01:13 으로 찍혀 실제 이탈 시점이 가려졌다.
--   바로 앞 이력 행(비활성, eff_at = 그 상태가 시작된 시각)에 원래 시작 시점이 남아 있다.
--
-- ■ 대상(조건으로만 고른다 — 개인 식별 정보 없음)
--   team_mem_rel 에서  mem_st_cd='left' · del_yn=false · leave_dt=2026-07-16
--   · eff_at 이 2026-07-16 01:13:00 ~ 01:15:00 KST  이고,
--   바로 앞(같은 팀·같은 회원에서 eff_at 이 가장 늦은 이전 행)이 inactive 인 행.
--   그 시각 밖의 개별 탈퇴(예: 같은 날 06:58 의 1건)는 건드리지 않는다.
--   정본(vers=0)뿐 아니라 그 뒤 재활성화돼 이력(vers>0)으로 밀려난 같은 일괄분도 포함한다(이력 기간이 같은 오류를 안고 있다).
--
-- ■ 고치는 것
--   A) 일반 대상: eff_at ← 바로 앞 비활성 행의 eff_at, leave_dt ← 그 시각의 KST 날짜(가입일보다 앞서지 않게 보정).
--   B) 복구 대상(#721): 위 대상 중 정본이면서 마일리지런(MILEAGE_RUN) 참여 승인(aprv_yn)이 있는 회원.
--      일괄 정리가 하기 전 상태(비활성)로 되돌린다 — mem_st_cd='inactive', leave_dt=NULL, eff_at ← 앞 행의 eff_at,
--      사유도 앞 행의 값으로. 활동(active)으로 올릴지는 운영자가 정한다 — 올린다면 이 SQL 이 아니라 관리 화면의
--      「재활성화」로 한다(잔액 초기화 여부·상태 이력·처리자 기록이 앱 로직으로 정확히 남는다).
--      이 조건에 맞는 사람이 둘 이상이면 멈춘다(사람이 판단).
--
-- ■ 회비(#423/#424) 영향 — 없음
--   회비 제외 기간은 team_mem_rel 이력에서 **active 구간**만 만들어 판정한다(lib/dues/ledger-replay.ts buildActiveIntervals).
--   대상은 모두 이력의 첫 상태가 비활성이라 active 구간이 없고(또는 재활성 이후만), 탈퇴 행 eff_at 은 비활성 → 비활성으로
--   바뀔 뿐 active 구간의 시작·끝을 움직이지 않는다. leave_dt 는 화면 표시(몇 일째 탈퇴 상태인가)에만 쓴다.
--
-- ■ 확인 쿼리(돌리기 전·후) — 돌린 뒤에는 ① 대상 중 leave_dt=2026-07-16 이 0건 ② 복구 대상은 inactive
--   SELECT count(*) FILTER (WHERE mem_st_cd='left' AND leave_dt = DATE '2026-07-16'
--                           AND eff_at >= TIMESTAMPTZ '2026-07-16 01:13:00+09' AND eff_at < TIMESTAMPTZ '2026-07-16 01:15:00+09') AS still_batch_stamped,
--          count(*) FILTER (WHERE mem_st_cd='left' AND leave_dt = DATE '2026-07-16') AS leave_0716_all
--   FROM public.team_mem_rel WHERE del_yn = false;

BEGIN;
SET LOCAL lock_timeout = '3s';

CREATE TEMP TABLE _fix720 ON COMMIT DROP AS
SELECT
  t.team_mem_id                                           AS tgt_id,
  t.vers                                                  AS tgt_vers,
  p.eff_at                                                AS prev_eff_at,
  p.inact_rsn_txt                                         AS prev_rsn,
  GREATEST((p.eff_at AT TIME ZONE 'Asia/Seoul')::date, t.join_dt) AS new_leave_dt,
  (
    t.vers = 0
    AND EXISTS (
      SELECT 1
      FROM public.evt_team_prt_rel pr
      JOIN public.evt_team_mst em ON em.evt_id = pr.evt_id
      WHERE pr.mem_id = t.mem_id
        AND pr.aprv_yn = true
        AND em.evt_type_cd = 'MILEAGE_RUN'
    )
  )                                                       AS restore_yn
FROM public.team_mem_rel t
JOIN LATERAL (
  SELECT x.*
  FROM public.team_mem_rel x
  WHERE x.team_id = t.team_id
    AND x.mem_id = t.mem_id
    AND x.del_yn = false
    AND x.team_mem_id <> t.team_mem_id
    AND x.eff_at <= t.eff_at
  ORDER BY x.eff_at DESC, x.vers DESC
  LIMIT 1
) p ON p.mem_st_cd = 'inactive'
WHERE t.mem_st_cd = 'left'
  AND t.del_yn = false
  AND t.leave_dt = DATE '2026-07-16'
  AND t.eff_at >= TIMESTAMPTZ '2026-07-16 01:13:00+09'
  AND t.eff_at <  TIMESTAMPTZ '2026-07-16 01:15:00+09';

DO $$
DECLARE
  v_total integer;
  v_cur   integer;
  v_hist  integer;
  v_rest  integer;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE tgt_vers = 0), count(*) FILTER (WHERE tgt_vers > 0),
         count(*) FILTER (WHERE restore_yn)
    INTO v_total, v_cur, v_hist, v_rest
  FROM _fix720;
  RAISE NOTICE '#720 대상: 전체 % (정본 % · 재활성돼 이력으로 밀린 행 %), 그중 복구 대상 %', v_total, v_cur, v_hist, v_rest;
  IF v_rest > 1 THEN
    RAISE EXCEPTION '복구 대상이 2명 이상(%) — 사람이 확인 뒤 조건을 좁힐 것', v_rest;
  END IF;
  IF v_total > 100 THEN
    RAISE EXCEPTION '대상이 예상(약 70)보다 훨씬 많다(%) — 조건 점검', v_total;
  END IF;
END $$;

-- A) 탈퇴일·상태 효력 시각을 원래 비활성 시작 시점으로
UPDATE public.team_mem_rel t
SET eff_at   = f.prev_eff_at,
    leave_dt = f.new_leave_dt,
    upd_at   = now()
FROM _fix720 f
WHERE t.team_mem_id = f.tgt_id
  AND NOT f.restore_yn;

-- B) 복구 대상은 일괄 정리 전 상태(비활성)로
UPDATE public.team_mem_rel t
SET mem_st_cd     = 'inactive',
    leave_dt      = NULL,
    eff_at        = f.prev_eff_at,
    inact_rsn_txt = f.prev_rsn,
    upd_at        = now()
FROM _fix720 f
WHERE t.team_mem_id = f.tgt_id
  AND f.restore_yn;

-- 결과 요약(PR 비교표용): 보정 뒤 월별 탈퇴일 분포 / 복구 건수
SELECT to_char(t.leave_dt, 'YYYY-MM') AS leave_month, count(*) AS cnt
FROM public.team_mem_rel t
JOIN _fix720 f ON f.tgt_id = t.team_mem_id
WHERE t.leave_dt IS NOT NULL
GROUP BY 1 ORDER BY 1;

SELECT count(*) AS restored_to_inactive
FROM public.team_mem_rel t
JOIN _fix720 f ON f.tgt_id = t.team_mem_id AND f.restore_yn
WHERE t.mem_st_cd = 'inactive' AND t.leave_dt IS NULL;

COMMIT;
