-- 락 대기만 짧게 끊는다(실행 자체는 끝까지). supabase/migrations/README.md 체크리스트.
SET lock_timeout = '3s';

-- ============================================================
-- 모임 참여조건 — 참석 조건 면제 프로젝트 (OR 조건)
--   설계: docs/superpowers/specs/2026-08-25-모임-참여조건-승인제-design.md §13
--
-- 계기: 2026 송년회 "최근 6개월 모임 참석 6회 이상 **또는** 동계훈련 승인 참가자".
-- 횟수 조건에 딸린 값이다 — 이 프로젝트의 승인 참가자(PB 클래스 `evt_pb_prt_rel.aprv_yn`)는
-- 횟수와 무관하게 통과한다. 판정은 앱(lib/gathering/join-condition.ts) 한 곳이고 SQL 에
-- 같은 판정을 두지 않는다(원 설계 §4 와 같은 태도).
--
-- 컬럼으로 두는 이유는 원 설계 §3.1 과 같다: 모임 행이 자기 조건을 영구히 들고 있어야
-- 작년 송년회가 "그때 그 조건"으로 남는다.
-- ============================================================

ALTER TABLE public.gthr_mst
  ADD COLUMN IF NOT EXISTS exm_evt_id uuid
    REFERENCES public.evt_team_mst(evt_id) ON DELETE SET NULL;

COMMENT ON COLUMN public.gthr_mst.exm_evt_id IS
  '참여조건 면제 프로젝트 — 이 프로젝트의 승인 참가자는 참석 횟수 조건 없이 통과(OR). req_attd_cnt 와 함께만 의미';

-- 면제는 횟수 조건에 딸린다. 횟수 없이 면제만 있으면 판정할 조건 자체가 없다.
-- (프로젝트를 지우면 ON DELETE SET NULL 이라 이 CHECK 와 부딪히지 않는다.)
ALTER TABLE public.gthr_mst DROP CONSTRAINT IF EXISTS ck_gthr_mst_exm_evt;
ALTER TABLE public.gthr_mst ADD CONSTRAINT ck_gthr_mst_exm_evt
  CHECK (exm_evt_id IS NULL OR req_attd_cnt IS NOT NULL);

-- ============================================================
-- get_gathering_detail — 수정 폼 프리필용으로 면제 프로젝트 id 를 싣는다.
--   일정탭 다이얼로그가 이 RPC 로 모임을 채우고, 그 값으로 수정 폼을 연다. 안 실으면
--   폼이 "면제 없음"으로 열리고 **저장하는 순간 면제가 지워진다.**
--   모임 속성이라 anon 에게 보여도 무방하다(원 설계 §8-9 — 신청자 정보는 여전히 안 싣는다).
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_gathering_detail(p_gthr_id uuid, p_team_id uuid)
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'max_prt_cnt',     g.max_prt_cnt,
    'sprt_cd',         g.sprt_cd,
    'aprv_req_yn',     g.aprv_req_yn,
    'req_attd_cnt',    g.req_attd_cnt,
    'req_attd_months', g.req_attd_months,
    'exm_evt_id',      g.exm_evt_id,
    'attendees',   COALESCE(
      (
        SELECT json_agg(
          json_build_object(
            'mem_id',    ar.mem_id,
            'mem_nm',    m.mem_nm,
            'avatar_url', m.avatar_url
          )
          ORDER BY ar.crt_at ASC
        )
        FROM   gthr_attd_rel ar
        LEFT JOIN mem_mst m ON m.mem_id = ar.mem_id
        WHERE  ar.gthr_id = p_gthr_id
      ),
      '[]'::json
    )
  )
  FROM  gthr_mst g
  WHERE g.gthr_id  = p_gthr_id
    AND g.team_id  = p_team_id
    AND g.del_yn   = false;
$$;

GRANT EXECUTE ON FUNCTION public.get_gathering_detail(uuid, uuid) TO anon, authenticated;

-- ============================================================
-- REVERT
--   get_gathering_detail 은 20260825130000_get_gathering_detail_join_cond.sql 본문으로 되돌린다.
--   ALTER TABLE public.gthr_mst DROP CONSTRAINT IF EXISTS ck_gthr_mst_exm_evt;
--   ALTER TABLE public.gthr_mst DROP COLUMN IF EXISTS exm_evt_id;
-- ============================================================
