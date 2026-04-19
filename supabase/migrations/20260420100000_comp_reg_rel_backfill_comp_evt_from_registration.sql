-- comp_reg_rel.comp_evt_id 보강: 레거시 competition_registration.event_type + 대회(comp_id) 기준 comp_evt_cfg 매칭
-- public.competition_registration 은 20260406233000 에서 DROP 될 수 있음 — 없으면 전체 스킵.
-- 응원/봉사 등 event_type 이 NULL 인 행은 comp_evt_id 를 건드리지 않는다.

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'competition_registration'
  ) THEN
    RAISE NOTICE 'comp_reg_rel_evt_backfill: public.competition_registration 없음 — 스킵';
    RETURN;
  END IF;

  -- 1) 대회별 종목 마스터가 없으면 comp_evt_cfg 에 한 줄 추가(소프트삭제 행은 ON CONFLICT 로 복구)
  INSERT INTO public.comp_evt_cfg (comp_id, comp_evt_type, vers, del_yn)
  SELECT DISTINCT
    tcp.comp_id,
    upper(btrim(leg.event_type)),
    0,
    false
  FROM public.comp_reg_rel cr
  INNER JOIN public.team_comp_plan_rel tcp
    ON tcp.team_comp_id = cr.team_comp_id
   AND tcp.vers = 0
   AND tcp.del_yn = false
  INNER JOIN public.competition_registration leg
    ON leg.id = cr.comp_reg_id
  WHERE cr.vers = 0
    AND cr.del_yn = false
    AND cr.prt_role_cd = 'participant'
    AND cr.comp_evt_id IS NULL
    AND leg.event_type IS NOT NULL
    AND btrim(leg.event_type) <> ''
    AND NOT EXISTS (
      SELECT 1
      FROM public.comp_evt_cfg e
      WHERE e.comp_id = tcp.comp_id
        AND e.vers = 0
        AND e.del_yn = false
        AND upper(btrim(e.comp_evt_type)) = upper(btrim(leg.event_type))
    )
  ON CONFLICT (comp_id, comp_evt_type, vers) DO UPDATE
    SET del_yn = false,
        upd_at = now();

  -- 2) 참가자 행에 comp_evt_id 연결 (UPDATE … FROM 에서 대상 별칭은 JOIN ON 에 직접 쓸 수 없음)
  UPDATE public.comp_reg_rel cr
  SET
    comp_evt_id = e.comp_evt_id,
    upd_at = now()
  FROM public.team_comp_plan_rel tcp,
       public.competition_registration leg,
       public.comp_evt_cfg e
  WHERE tcp.team_comp_id = cr.team_comp_id
    AND tcp.vers = 0
    AND tcp.del_yn = false
    AND leg.id = cr.comp_reg_id
    AND e.comp_id = tcp.comp_id
    AND e.vers = 0
    AND e.del_yn = false
    AND upper(btrim(e.comp_evt_type)) = upper(btrim(leg.event_type))
    AND cr.vers = 0
    AND cr.del_yn = false
    AND cr.prt_role_cd = 'participant'
    AND cr.comp_evt_id IS NULL
    AND leg.event_type IS NOT NULL
    AND btrim(leg.event_type) <> '';

  RAISE NOTICE 'comp_reg_rel_evt_backfill: 완료';
END;
$migration$;
