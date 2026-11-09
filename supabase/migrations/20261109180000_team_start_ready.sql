-- 멀티팀 — 새 팀(울산지부)이 첫 회원을 받기 전에 갖춰야 할 것.
--
-- 1) 배치 작업(batch_job_mst): job_cd 가 전역 유일이라 팀마다 같은 배치를 둘 수 없었다.
--    유일 조건을 (job_cd, team_id)로 바꾸고, 기강 배치를 울산에 그대로 복사한다.
--    (회비 감면은 회비 정책이 없는 팀에선 "정책 없음"으로 아무것도 안 하고 끝난다 — 켜 둬도 안전)
-- 2) 칭호(ttl_mst): 칭호는 이미 팀별이다. 울산엔 0개라 가입해도 '뉴비'조차 안 붙는다.
--    기강의 **자동(auto) 칭호만** 복사한다. 운영진이 직접 주는 칭호(awarded — 기강단장·맛객…)와
--    특정 회원을 기준으로 삼는 칭호(조건에 target_mem_id — '서브현근')는 기강 것이라 뺀다.
--    울산에서 안 쓸 칭호는 그 팀 관리자가 사용 안 함(use_yn)으로 끈다.
-- 3) 가입 정보 팀별 분리(team_mem_onbd_rel): mem_onbd_prf 는 사람(mem_id) 하나에 한 행이라
--    가입 목적·유입 경로·첫 모임 약속이 팀을 안 가렸다. 두 팀에 가입하면 나중 팀 것이 앞 팀 것을 덮고,
--    뉴비 넛지 크론은 기강에서 한 약속으로 울산 알림을 보낼 수 있었다. 이 넷은 "이 팀에 들어온 이유"라
--    (팀, 사람)으로 옮긴다. 가까운 역·평균 거리·페이스는 사람 것이라 mem_onbd_prf 에 남긴다.
--    옛 컬럼은 **지우지 않는다** — 배포 전 옛 코드가 계속 읽고 쓰므로, 배포가 끝난 뒤 정리한다(runbook).
-- 4) 셀프 가입 정책: 본인이 소속 행을 만들 때 상태를 'active' 로만 넣게 한다.
SET lock_timeout = '3s';

-- ────────────────────────────────────────────────────────────────
-- 1) 배치 작업 — 팀마다
-- ────────────────────────────────────────────────────────────────
ALTER TABLE public.batch_job_mst DROP CONSTRAINT IF EXISTS batch_job_mst_job_cd_key;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_batch_job_mst_job_cd_team') THEN
    ALTER TABLE public.batch_job_mst
      ADD CONSTRAINT uq_batch_job_mst_job_cd_team UNIQUE (job_cd, team_id);
  END IF;
END $$;

INSERT INTO public.batch_job_mst (job_nm, job_cd, job_desc, cron_expr, param_schema_json, use_yn, freq_cd, team_id)
SELECT b.job_nm, b.job_cd, b.job_desc, b.cron_expr, b.param_schema_json, b.use_yn, b.freq_cd, u.team_id
FROM public.batch_job_mst b
JOIN public.team_mst g ON g.team_id = b.team_id AND g.team_cd = 'gigang'
CROSS JOIN (SELECT team_id FROM public.team_mst WHERE team_cd = 'ulsan') u
WHERE NOT EXISTS (
  SELECT 1 FROM public.batch_job_mst x WHERE x.job_cd = b.job_cd AND x.team_id = u.team_id
);

-- ────────────────────────────────────────────────────────────────
-- 2) 칭호 — 기강 자동 칭호를 울산에 복사
-- ────────────────────────────────────────────────────────────────
INSERT INTO public.ttl_mst (
  team_id, ttl_kind_enm, ttl_ctgr_cd, ttl_nm, ttl_desc, cond_rule_json, sort_ord, use_yn,
  vers, del_yn, rarity_level, ttl_group_cd, desc_visibility, eff_stt_dt
)
SELECT u.team_id, t.ttl_kind_enm, t.ttl_ctgr_cd, t.ttl_nm, t.ttl_desc, t.cond_rule_json, t.sort_ord, t.use_yn,
       0, false, t.rarity_level, t.ttl_group_cd, t.desc_visibility, t.eff_stt_dt
FROM public.ttl_mst t
JOIN public.team_mst g ON g.team_id = t.team_id AND g.team_cd = 'gigang'
CROSS JOIN (SELECT team_id FROM public.team_mst WHERE team_cd = 'ulsan') u
WHERE t.vers = 0
  AND t.del_yn = false
  AND t.ttl_kind_enm = 'auto'
  AND NOT (t.cond_rule_json ? 'target_mem_id')
  AND NOT EXISTS (
    SELECT 1 FROM public.ttl_mst x WHERE x.team_id = u.team_id AND x.ttl_nm = t.ttl_nm AND x.vers = 0
  );

-- ────────────────────────────────────────────────────────────────
-- 3) 가입 정보 — (팀, 사람)
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.team_mem_onbd_rel (
  team_id       uuid        NOT NULL REFERENCES public.team_mst(team_id),
  mem_id        uuid        NOT NULL REFERENCES public.mem_mst(mem_id) ON DELETE CASCADE,
  join_purp_cds text[]      NOT NULL DEFAULT ARRAY[]::text[],
  join_purp_txt text,
  join_src_cd   text,
  join_src_txt  text,
  attd_pldg_at  timestamptz,
  pldg_gthr_id  uuid        REFERENCES public.gthr_mst(gthr_id) ON DELETE SET NULL,
  crt_at        timestamptz NOT NULL DEFAULT now(),
  upd_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_team_mem_onbd_rel PRIMARY KEY (team_id, mem_id)
);

COMMENT ON TABLE public.team_mem_onbd_rel IS
  '팀별 가입 정보 — 가입 목적·유입 경로·첫 모임 약속. 사람 것(가까운 역·거리·페이스)은 mem_onbd_prf.';

ALTER TABLE public.team_mem_onbd_rel ENABLE ROW LEVEL SECURITY;

-- 쓰기는 서버(service_role)만 — 가입·러닝 프로필 저장 액션이 한다. 읽기는 본인 + 그 팀 관리자.
DROP POLICY IF EXISTS team_mem_onbd_rel_select_own ON public.team_mem_onbd_rel;
CREATE POLICY team_mem_onbd_rel_select_own ON public.team_mem_onbd_rel
  FOR SELECT TO authenticated
  USING (mem_id = public.v2_rls_resolve_mem_id());

DROP POLICY IF EXISTS team_mem_onbd_rel_select_team_admin ON public.team_mem_onbd_rel;
CREATE POLICY team_mem_onbd_rel_select_team_admin ON public.team_mem_onbd_rel
  FOR SELECT TO authenticated
  USING (public.v2_rls_auth_team_owner_or_admin(team_id));

-- 옮기기: 지금까지 가입 정보는 전부 기강에서 받은 것이다(울산은 아직 회원이 없다).
-- 기강 소속 행(탈퇴 포함 — 이력)이 있는 사람만 옮긴다.
INSERT INTO public.team_mem_onbd_rel (
  team_id, mem_id, join_purp_cds, join_purp_txt, join_src_cd, join_src_txt, attd_pldg_at, pldg_gthr_id, crt_at, upd_at
)
SELECT g.team_id, p.mem_id, COALESCE(p.join_purp_cds, ARRAY[]::text[]), p.join_purp_txt,
       p.join_src_cd, p.join_src_txt, p.attd_pldg_at, p.pldg_gthr_id, p.crt_at, p.upd_at
FROM public.mem_onbd_prf p
CROSS JOIN (SELECT team_id FROM public.team_mst WHERE team_cd = 'gigang') g
WHERE EXISTS (
  SELECT 1 FROM public.team_mem_rel r
  WHERE r.mem_id = p.mem_id AND r.team_id = g.team_id AND r.vers = 0 AND r.del_yn = false
)
ON CONFLICT (team_id, mem_id) DO NOTHING;

-- mem_onbd_prf 의 관리자 조회 정책(mem_onbd_prf_select_team_admin)은 그대로 둔다 — 새 코드는 거기서
-- 사람 것(역·거리·페이스)만 읽는다. 옛 가입 정보 컬럼은 배포 뒤 지우면서 다른 팀 관리자 노출도 같이 끝난다.

-- 공개 함수 두 개(회원 카드·기강이야기 새 얼굴)의 가입 목적을 그 팀 것으로.
-- 20261109160000 과 같은 방식 — 고칠 문구만 정확히 바꾼다(정확히 1곳, 이미 바뀌었으면 건너뜀).
-- 다만 새 별칭(tj)을 쓰는 문구와 그 별칭을 만드는 문구가 한 함수에 같이 있어서, 하나씩 바꿔 매번
-- 다시 만들면 중간 본문이 "tj 가 없다"로 실패한다 — **함수별로 다 바꾼 뒤 한 번에** 다시 만든다.
DROP TABLE IF EXISTS pg_temp._onbd_patch;
CREATE TEMP TABLE _onbd_patch (ord int, fn text, old_txt text, new_txt text);
INSERT INTO _onbd_patch (ord, fn, old_txt, new_txt)
    SELECT * FROM (VALUES
      (1, 'get_public_member_card',
          $q$'join_purp_cds', to_jsonb(COALESCE(op.join_purp_cds, ARRAY[]::varchar[])),$q$,
          $q$'join_purp_cds', to_jsonb(COALESCE(tj.join_purp_cds, ARRAY[]::varchar[])),$q$),
      (2, 'get_public_member_card',
          $q$'join_purp_txt', op.join_purp_txt)$q$,
          $q$'join_purp_txt', tj.join_purp_txt)$q$),
      (3, 'get_public_member_card',
          $q$OR array_length(op.join_purp_cds, 1) > 0$q$,
          $q$OR array_length(tj.join_purp_cds, 1) > 0$q$),
      (4, 'get_public_member_card',
          $q$OR btrim(COALESCE(op.join_purp_txt, '')) <> ''$q$,
          $q$OR btrim(COALESCE(tj.join_purp_txt, '')) <> ''$q$),
      (5, 'get_public_member_card',
          $q$FROM public.mem_onbd_prf op$q$,
          $q$FROM public.mem_onbd_prf op LEFT JOIN public.team_mem_onbd_rel tj ON tj.team_id = p_team_id AND tj.mem_id = op.mem_id$q$),
      (6, 'get_team_story_feed',
          $q$'join_purp_cds',COALESCE(op.join_purp_cds,'{}'::text[]),$q$,
          $q$'join_purp_cds',COALESCE(tj.join_purp_cds,'{}'::text[]),$q$),
      (7, 'get_team_story_feed',
          $q$'join_purp_txt',op.join_purp_txt)$q$,
          $q$'join_purp_txt',tj.join_purp_txt)$q$),
      (8, 'get_team_story_feed',
          $q$FROM public.mem_onbd_prf op WHERE op.mem_id = n.mem_id)$q$,
          $q$FROM public.mem_onbd_prf op LEFT JOIN public.team_mem_onbd_rel tj ON tj.team_id = p_team_id AND tj.mem_id = op.mem_id WHERE op.mem_id = n.mem_id)$q$)
    ) AS t(ord, fn, old_txt, new_txt);

DO $patch$
DECLARE
  f      record;
  r      record;
  v_orig text;
  v_def  text;
  v_cnt  int;
BEGIN
  FOR f IN SELECT DISTINCT fn FROM _onbd_patch LOOP
    SELECT pg_get_functiondef(p.oid) INTO v_orig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = f.fn;

    IF v_orig IS NULL THEN
      RAISE EXCEPTION '함수 % 가 없습니다', f.fn;
    END IF;
    v_def := v_orig;

    FOR r IN SELECT * FROM _onbd_patch WHERE fn = f.fn ORDER BY ord LOOP
      IF position(r.new_txt IN v_def) > 0 THEN
        CONTINUE; -- 이미 적용됨
      END IF;
      v_cnt := (length(v_def) - length(replace(v_def, r.old_txt, ''))) / length(r.old_txt);
      IF v_cnt <> 1 THEN
        RAISE EXCEPTION '[%] % 의 고칠 문구가 % 곳에 있습니다(정확히 1곳이어야 함) — 본문이 예상과 다릅니다', r.ord, r.fn, v_cnt;
      END IF;
      v_def := replace(v_def, r.old_txt, r.new_txt);
    END LOOP;

    IF v_def <> v_orig THEN
      EXECUTE v_def;
    END IF;
  END LOOP;
END
$patch$;

DROP TABLE IF EXISTS pg_temp._onbd_patch;

-- ────────────────────────────────────────────────────────────────
-- 4) 셀프 가입 — 상태는 'active' 로만
-- ────────────────────────────────────────────────────────────────
-- 이전엔 역할(member)만 고정해 본인이 상태를 아무 값(예: 비활성·탈퇴)으로 넣을 수 있었다.
-- 가입 승인제를 쓰는 팀이 생기면 그때 이 정책과 가입 액션을 같이 바꾼다.
DROP POLICY IF EXISTS team_mem_rel_insert_self_onboarding ON public.team_mem_rel;
CREATE POLICY team_mem_rel_insert_self_onboarding ON public.team_mem_rel
  FOR INSERT TO authenticated
  WITH CHECK (
    mem_id = public.v2_rls_resolve_mem_id()
    AND vers = 0
    AND del_yn = false
    AND team_role_cd = 'member'
    AND mem_st_cd = 'active'
    AND EXISTS (
      SELECT 1 FROM public.mem_mst mm
      WHERE mm.mem_id = team_mem_rel.mem_id AND mm.vers = 0 AND mm.del_yn = false
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.team_mem_rel r
      WHERE r.team_id = team_mem_rel.team_id AND r.mem_id = team_mem_rel.mem_id
        AND r.vers = 0 AND r.del_yn = false
    )
  );
