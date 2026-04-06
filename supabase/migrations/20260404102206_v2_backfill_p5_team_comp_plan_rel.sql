-- v2 백필 P5 전용: (기본 팀, 대회) → public.team_comp_plan_rel
-- 적용 순서: 20260404102203(P3)·20260404102205 직후 권장, 20260404102309(P6) 이전
-- 기준: database-schema-v2-migration-map.md §3.3 A)
--
-- 정책: 기강 단일 팀 `team_id` 고정. `comp_mst` 정본이 있는 대회만 삽입(FK).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.team_mst
    WHERE team_cd = 'gigang'
      AND vers = 0
      AND del_yn = false
      AND team_id = 'c0ffee00-0000-4000-8000-000000000001'::uuid
  ) THEN
    RAISE EXCEPTION
      'team_mst gigang 정본이 없습니다. P0/20260404102200 먼저 적용하세요.';
  END IF;
END;
$$;

INSERT INTO public.team_comp_plan_rel (team_id, comp_id, vers, del_yn, crt_at, upd_at)
SELECT
  'c0ffee00-0000-4000-8000-000000000001'::uuid,
  c.id,
  0,
  false,
  c.created_at,
  coalesce(c.updated_at, c.created_at)
FROM public.competition c
INNER JOIN public.comp_mst m
  ON m.comp_id = c.id
 AND m.vers = 0
 AND m.del_yn = false
ON CONFLICT (team_id, comp_id, vers) DO NOTHING;

DO $$
DECLARE
  n_comp bigint;
  n_plan bigint;
BEGIN
  SELECT count(*) INTO n_comp FROM public.competition;
  SELECT count(*) INTO n_plan
  FROM public.team_comp_plan_rel
  WHERE team_id = 'c0ffee00-0000-4000-8000-000000000001'::uuid
    AND vers = 0
    AND del_yn = false;

  RAISE NOTICE 'v2_backfill_p5: competition_cnt=%, team_comp_plan_rel_gigang=%', n_comp, n_plan;
END;
$$;
