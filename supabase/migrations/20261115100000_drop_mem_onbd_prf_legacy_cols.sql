-- mem_onbd_prf 의 옛 가입 정보 칸 6개 걷기 — join_purp_cds · join_purp_txt · join_src_cd · join_src_txt · attd_pldg_at · pldg_gthr_id.
--
-- 이 넷(+약속 둘)은 "이 팀에 들어온 이유"라 20261109180000_team_start_ready 에서 (팀, 사람) 테이블 team_mem_onbd_rel 로 옮겼다.
-- 옛 칸은 배포 전 옛 코드가 계속 쓰고 있어 남겨 뒀고, 멀티팀 배포(2026-11-15) 뒤 「가입 정보 옮기기 다시」까지 끝났다(영향 0행).
-- 지금 앱 코드는 mem_onbd_prf 에서 가까운 역·평균 거리·페이스(사람 것)만 읽고 쓴다. DB 함수·뷰·정책도 이 칸을 안 본다
-- (카드·피드 함수는 tj = team_mem_onbd_rel 칸만 읽는다 — 2026-11-15 dev·prd 확인).
-- 남아 있는 동안은 다른 팀 관리자가 두 팀 소속자의 옛 가입 경로를 볼 수 있었다(mem_onbd_prf_select_team_admin) — 이걸로 끝난다.
--
-- 적용 시점: 지금 운영 코드(#648 배포분)가 이미 이 칸을 안 쓰므로 이 PR 배포 전후 어느 쪽이든 안전하다. 같은 PR 의 코드 변경은
--    database.types 를 DB 에 맞추는 것뿐이다. 아래 1) 확인이 통과해야만 지운다.
-- 어느 팀에도 소속 행이 없는 사람(가입을 끝내지 않은 사람)의 옛 가입 정보는 옮길 팀이 없어 **함께 지워진다**
-- (2026-11-15 prd 2명·dev 0명). 다시 가입하면 그때 team_mem_onbd_rel 에 새로 들어간다.

SET lock_timeout = '3s';

-- 1) 팀 소속인데 새 테이블에 없는 가입 정보가 있으면 멈춘다(옮기기 누락)
DO $$
DECLARE
  missing int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.mem_onbd_prf'::regclass AND attname = 'join_purp_cds' AND NOT attisdropped
  ) THEN
    RAISE NOTICE 'mem_onbd_prf: 옛 가입 정보 칸이 이미 없어 건너뜀';
    RETURN;
  END IF;

  EXECUTE $q$
    SELECT count(*) FROM public.mem_onbd_prf p
    WHERE (cardinality(coalesce(p.join_purp_cds, '{}')) > 0 OR p.join_purp_txt IS NOT NULL OR p.join_src_cd IS NOT NULL
           OR p.join_src_txt IS NOT NULL OR p.attd_pldg_at IS NOT NULL OR p.pldg_gthr_id IS NOT NULL)
      AND EXISTS (SELECT 1 FROM public.team_mem_rel r WHERE r.mem_id = p.mem_id AND r.vers = 0 AND r.del_yn = false)
      AND NOT EXISTS (SELECT 1 FROM public.team_mem_onbd_rel t WHERE t.mem_id = p.mem_id)
  $q$ INTO missing;
  IF missing > 0 THEN
    RAISE EXCEPTION '팀 소속인데 team_mem_onbd_rel 로 안 옮겨진 가입 정보가 % 행 있다 — 롤아웃 문서 「가입 정보 옮기기 다시」부터 돌린다', missing;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosrc ~* 'mem_onbd_prf'
      AND p.prosrc ~* '\m(op|p|mem_onbd_prf)\.(join_purp_cds|join_purp_txt|join_src_cd|join_src_txt|attd_pldg_at|pldg_gthr_id)\M'
  ) THEN
    RAISE EXCEPTION 'mem_onbd_prf 의 옛 가입 정보 칸을 읽는 함수가 있다 — 지우지 않는다';
  END IF;
END $$;

-- 2) 칸 지우기(pldg_gthr_id 의 외래키 fk_mem_onbd_prf__gthr_mst 는 칸과 함께 지워진다)
ALTER TABLE public.mem_onbd_prf
  DROP COLUMN IF EXISTS join_purp_cds,
  DROP COLUMN IF EXISTS join_purp_txt,
  DROP COLUMN IF EXISTS join_src_cd,
  DROP COLUMN IF EXISTS join_src_txt,
  DROP COLUMN IF EXISTS attd_pldg_at,
  DROP COLUMN IF EXISTS pldg_gthr_id;

COMMENT ON TABLE public.mem_onbd_prf IS
  '사람 단위 러닝 프로필(가까운 역·평균 거리·페이스). 가입 목적·유입 경로·첫 모임 약속은 팀별 team_mem_onbd_rel.';
