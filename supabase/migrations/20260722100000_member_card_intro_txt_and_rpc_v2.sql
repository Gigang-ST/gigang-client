-- 멤버 프로필 카드(쇼케이스) 1차
--   ① team_mem_rel.intro_txt (한마디, 60자) 신설
--   ② 상태이력 함수 2개에 intro_txt 운반 추가 (컬럼 추가 시 동반 갱신 필수 — 설계서 §4.1 경고)
--   ③ get_public_member_card(p_mem_id, p_team_id) v2 정의
-- 설계서: docs/superpowers/specs/2026-07-22-멤버-프로필-카드-design.md
SET lock_timeout = '3s';

-- ─────────────────────────────────────────────
-- ① 한마디 컬럼
-- ─────────────────────────────────────────────
ALTER TABLE public.team_mem_rel
  ADD COLUMN IF NOT EXISTS intro_txt text;

ALTER TABLE public.team_mem_rel
  DROP CONSTRAINT IF EXISTS team_mem_rel_intro_txt_len;

ALTER TABLE public.team_mem_rel
  ADD CONSTRAINT team_mem_rel_intro_txt_len
  CHECK (intro_txt IS NULL OR char_length(intro_txt) <= 60) NOT VALID;

COMMENT ON COLUMN public.team_mem_rel.intro_txt IS
  '한마디(자기소개) — 최대 60자. 프로필 카드에 인용체로 노출.';

-- ─────────────────────────────────────────────
-- ② 상태이력 함수 2개 — 스냅샷 컬럼 목록에 intro_txt 추가
--    (실 DB 본문 기준. 리포의 20260715121000/122000 파일은 card_featured 참조가 남은 stale 버전이라 베이스로 쓰지 않는다)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.apply_team_mem_rel_change(
  p_team_mem_id uuid,
  p_changes jsonb,
  p_eff_at timestamp with time zone DEFAULT now()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_cur public.team_mem_rel%rowtype;
  v_next_vers int;
begin
  select * into v_cur
  from public.team_mem_rel
  where team_mem_id = p_team_mem_id and vers = 0
  for update;

  if not found then
    raise exception '정본(vers=0) team_mem_rel 없음: %', p_team_mem_id;
  end if;

  if (select auth.uid()) is not null
     and not public.v2_rls_auth_team_owner_or_admin(v_cur.team_id) then
    raise exception '권한 없음: team_mem_rel 변경은 대상 팀 관리자만 가능';
  end if;

  select coalesce(max(vers), 0) + 1 into v_next_vers
  from public.team_mem_rel
  where team_id = v_cur.team_id and mem_id = v_cur.mem_id;

  insert into public.team_mem_rel (
    team_mem_id, team_id, mem_id, team_role_cd, mem_st_cd, join_dt, leave_dt,
    vers, del_yn, crt_at, upd_at, selected_badge_effect, selected_frame_cd,
    inact_rsn_txt, eff_at, intro_txt
  ) values (
    gen_random_uuid(), v_cur.team_id, v_cur.mem_id, v_cur.team_role_cd, v_cur.mem_st_cd,
    v_cur.join_dt, v_cur.leave_dt, v_next_vers, v_cur.del_yn, v_cur.crt_at, now(),
    v_cur.selected_badge_effect, v_cur.selected_frame_cd, v_cur.inact_rsn_txt,
    v_cur.eff_at, v_cur.intro_txt
  );

  update public.team_mem_rel set
    mem_st_cd     = coalesce(p_changes->>'mem_st_cd', mem_st_cd),
    team_role_cd  = coalesce(p_changes->>'team_role_cd', team_role_cd),
    inact_rsn_txt = case when p_changes ? 'inact_rsn_txt' then p_changes->>'inact_rsn_txt' else inact_rsn_txt end,
    del_yn        = coalesce((p_changes->>'del_yn')::boolean, del_yn),
    join_dt       = case when p_changes ? 'join_dt'  then (p_changes->>'join_dt')::date  else join_dt  end,
    leave_dt      = case when p_changes ? 'leave_dt' then (p_changes->>'leave_dt')::date else leave_dt end,
    eff_at        = p_eff_at,
    upd_at        = now()
  where team_mem_id = p_team_mem_id and vers = 0;
end;
$function$;

CREATE OR REPLACE FUNCTION public.apply_team_mem_rel_delete(
  p_team_mem_id uuid,
  p_eff_at timestamp with time zone DEFAULT now()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_cur public.team_mem_rel%rowtype;
  v_next_vers int;
begin
  select * into v_cur
  from public.team_mem_rel
  where team_mem_id = p_team_mem_id and vers = 0
  for update;

  if not found then
    raise exception '정본(vers=0) team_mem_rel 없음: %', p_team_mem_id;
  end if;

  if (select auth.uid()) is not null
     and not public.v2_rls_auth_team_owner_or_admin(v_cur.team_id) then
    raise exception '권한 없음: team_mem_rel 삭제는 대상 팀 관리자만 가능';
  end if;

  select coalesce(max(vers), 0) + 1 into v_next_vers
  from public.team_mem_rel
  where team_id = v_cur.team_id and mem_id = v_cur.mem_id;

  insert into public.team_mem_rel (
    team_mem_id, team_id, mem_id, team_role_cd, mem_st_cd, join_dt, leave_dt,
    vers, del_yn, crt_at, upd_at, selected_badge_effect, selected_frame_cd,
    inact_rsn_txt, eff_at, intro_txt
  ) values (
    gen_random_uuid(), v_cur.team_id, v_cur.mem_id, v_cur.team_role_cd, v_cur.mem_st_cd,
    v_cur.join_dt, v_cur.leave_dt, v_next_vers, v_cur.del_yn, v_cur.crt_at, now(),
    v_cur.selected_badge_effect, v_cur.selected_frame_cd, v_cur.inact_rsn_txt,
    v_cur.eff_at, v_cur.intro_txt
  );

  update public.team_mem_rel
    set vers = v_next_vers + 1, del_yn = true, eff_at = p_eff_at, upd_at = now()
  where team_mem_id = p_team_mem_id and vers = 0;
end;
$function$;

-- ─────────────────────────────────────────────
-- ③ get_public_member_card v2
--    반환 null = 카드 없음(팀 소속 아님 / 탈퇴·비활성 / 삭제). left·inactive 사유는 구분하지 않는다.
-- ─────────────────────────────────────────────
--    기록 슬레이트: 로드 FULL/HALF/10K + 철인 + 사이클만 노출한다.
--    트레일·울트라는 거리 코드가 수십 종(50K/100K/33K/5PEAKS 등)이라 나열하면 지저분해져서
--    기록 줄 대신 UTMB 인덱스 한 줄로 갈음한다. 값 없는 종목은 행 자체가 생기지 않는다.
DROP FUNCTION IF EXISTS public.get_public_member_card(uuid, uuid);

CREATE FUNCTION public.get_public_member_card(p_mem_id uuid, p_team_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH me AS (
  SELECT tm.team_mem_id, tm.mem_id, tm.team_id, tm.join_dt,
         tm.selected_badge_effect, tm.selected_frame_cd, tm.intro_txt,
         mm.mem_nm, mm.avatar_url
  FROM public.team_mem_rel tm
  INNER JOIN public.mem_mst mm
    ON mm.mem_id = tm.mem_id AND mm.vers = 0 AND mm.del_yn = false
  WHERE tm.mem_id   = p_mem_id
    AND tm.team_id  = p_team_id
    AND tm.mem_st_cd = 'active'
    AND tm.vers     = 0
    AND tm.del_yn   = false
),
back_no AS (
  SELECT rn FROM (
    SELECT tm.mem_id,
           rank() OVER (ORDER BY tm.join_dt NULLS LAST, tm.mem_id) AS rn
    FROM public.team_mem_rel tm
    WHERE tm.team_id = p_team_id AND tm.vers = 0
  ) t
  WHERE t.mem_id = p_mem_id
),
slate AS (
  SELECT * FROM (VALUES
    ('road_run','FULL', 1),
    ('road_run','HALF', 2),
    ('road_run','10K',  3)
  ) AS s(sport, evt, ord)
),
best_road AS (
  SELECT DISTINCT ON (s.ord)
         s.ord, c.comp_sprt_cd AS sport, ce.comp_evt_type AS evt,
         rr.rec_time_sec, rr.race_nm, rr.race_dt
  FROM public.rec_race_hist rr
  INNER JOIN public.comp_mst c
    ON c.comp_id = rr.comp_id AND c.vers = 0 AND c.del_yn = false
  INNER JOIN public.comp_evt_cfg ce
    ON ce.comp_evt_id = rr.comp_evt_id AND ce.vers = 0 AND ce.del_yn = false
  INNER JOIN slate s
    ON s.sport = c.comp_sprt_cd AND s.evt = upper(ce.comp_evt_type)
  WHERE rr.mem_id = p_mem_id AND rr.vers = 0 AND rr.del_yn = false
  ORDER BY s.ord, rr.rec_time_sec ASC
),
best_other AS (
  SELECT DISTINCT ON (c.comp_sprt_cd)
         CASE c.comp_sprt_cd WHEN 'triathlon' THEN 10 ELSE 11 END AS ord,
         c.comp_sprt_cd AS sport,
         COALESCE(ce.comp_evt_type, '') AS evt,
         rr.rec_time_sec, rr.race_nm, rr.race_dt
  FROM public.rec_race_hist rr
  INNER JOIN public.comp_mst c
    ON c.comp_id = rr.comp_id AND c.vers = 0 AND c.del_yn = false
   AND c.comp_sprt_cd IN ('triathlon','cycling')
  LEFT JOIN public.comp_evt_cfg ce
    ON ce.comp_evt_id = rr.comp_evt_id AND ce.vers = 0 AND ce.del_yn = false
  WHERE rr.mem_id = p_mem_id AND rr.vers = 0 AND rr.del_yn = false
  ORDER BY c.comp_sprt_cd, rr.rec_time_sec ASC
),
best AS (
  SELECT ord, sport, evt, rec_time_sec, race_nm, race_dt FROM best_road
  UNION ALL
  SELECT ord, sport, evt, rec_time_sec, race_nm, race_dt FROM best_other
),
titles AS (
  SELECT t.ttl_nm, t.ttl_desc, t.desc_visibility, t.rarity_level, t.ttl_ctgr_cd,
         mt.is_prmy_yn, mt.grnt_at
  FROM public.mem_ttl_rel mt
  INNER JOIN public.ttl_mst t
    ON t.ttl_id = mt.ttl_id AND t.vers = 0 AND t.del_yn = false AND t.use_yn = true
  INNER JOIN me ON me.team_mem_id = mt.team_mem_id
  WHERE mt.vers = 0 AND mt.del_yn = false
    AND (mt.exp_at IS NULL OR mt.exp_at > now())
),
upcoming AS (
  SELECT c.comp_id, c.short_id, c.comp_nm, c.stt_dt
  FROM public.comp_reg_rel cr
  INNER JOIN public.team_comp_plan_rel tcp
    ON tcp.team_comp_id = cr.team_comp_id AND tcp.vers = 0 AND tcp.del_yn = false
   AND tcp.team_id = p_team_id
  INNER JOIN public.comp_mst c
    ON c.comp_id = tcp.comp_id AND c.vers = 0 AND c.del_yn = false
  WHERE cr.mem_id = p_mem_id AND cr.vers = 0 AND cr.del_yn = false
    AND c.stt_dt >= (now() AT TIME ZONE 'Asia/Seoul')::date
  ORDER BY c.stt_dt ASC
  LIMIT 1
),
-- 최근 활동일 — 모임 참석·대회 기록 중 가장 최근. 활동 컨디션(표정) 판정용
last_actv AS (
  SELECT max(d) AS last_dt FROM (
    SELECT max(gm.stt_at AT TIME ZONE 'Asia/Seoul')::date AS d
    FROM public.gthr_attd_rel ga
    INNER JOIN public.gthr_mst gm
      ON gm.gthr_id = ga.gthr_id AND gm.del_yn = false AND gm.team_id = p_team_id
    WHERE ga.mem_id = p_mem_id AND gm.stt_at < now()
    UNION ALL
    SELECT max(rr.race_dt) FROM public.rec_race_hist rr
    WHERE rr.mem_id = p_mem_id AND rr.vers = 0 AND rr.del_yn = false
  ) x
),
stats AS (
  SELECT
    (SELECT count(*) FROM public.gthr_attd_rel ga
       INNER JOIN public.gthr_mst gm
         ON gm.gthr_id = ga.gthr_id AND gm.del_yn = false AND gm.team_id = p_team_id
      WHERE ga.mem_id = p_mem_id
        AND gm.stt_at < now())                                  AS gthr_attd_cnt,
    (SELECT count(*) FROM public.comp_reg_rel cr
       INNER JOIN public.team_comp_plan_rel tcp
         ON tcp.team_comp_id = cr.team_comp_id AND tcp.vers = 0 AND tcp.del_yn = false
        AND tcp.team_id = p_team_id
       INNER JOIN public.comp_mst c
         ON c.comp_id = tcp.comp_id AND c.vers = 0 AND c.del_yn = false
      WHERE cr.mem_id = p_mem_id AND cr.vers = 0 AND cr.del_yn = false
        AND COALESCE(c.end_dt, c.stt_dt) < (now() AT TIME ZONE 'Asia/Seoul')::date) AS comp_reg_cnt,
    (SELECT COALESCE(sum(pt.pt_amt), 0) FROM public.pt_txn_hist pt
      WHERE pt.mem_id = p_mem_id AND pt.team_id = p_team_id)     AS activity_score,
    -- 최근 90일 활동 건수 — 표정 단계 판정의 주 지표
    (SELECT count(*) FROM public.gthr_attd_rel ga
       INNER JOIN public.gthr_mst gm
         ON gm.gthr_id = ga.gthr_id AND gm.del_yn = false AND gm.team_id = p_team_id
      WHERE ga.mem_id = p_mem_id
        AND gm.stt_at < now()
        AND gm.stt_at >= now() - interval '90 days')             AS recent_gthr_cnt,
    (SELECT count(*) FROM public.rec_race_hist rr
      WHERE rr.mem_id = p_mem_id AND rr.vers = 0 AND rr.del_yn = false
        AND rr.race_dt >= (now() AT TIME ZONE 'Asia/Seoul')::date - 90) AS recent_race_cnt
)
SELECT jsonb_build_object(
  'mem_nm',        me.mem_nm,
  'avatar_url',    me.avatar_url,
  'badge_effect',  COALESCE(me.selected_badge_effect, 'none'),
  'frame_cd',      COALESCE(me.selected_frame_cd, 'frame-none'),
  'intro_txt',     me.intro_txt,
  'join_dt',       me.join_dt,
  'back_no',       (SELECT rn FROM back_no),
  'utmb_index',    (SELECT up.utmb_idx FROM public.mem_utmb_prf up
                     WHERE up.mem_id = p_mem_id AND up.vers = 0 AND up.del_yn = false
                     LIMIT 1),
  'upcoming_race', (SELECT jsonb_build_object(
                             'comp_id', u.comp_id,
                             'short_id', u.short_id,
                             'comp_nm', u.comp_nm,
                             'stt_dt', u.stt_dt)
                      FROM upcoming u),
  'running_profile', (SELECT jsonb_build_object(
                               'avg_pace_cd', op.avg_pace_cd,
                               'avg_run_dist_km', op.avg_run_dist_km)
                        FROM public.mem_onbd_prf op
                       WHERE op.mem_id = p_mem_id
                         AND (op.avg_pace_cd IS NOT NULL OR op.avg_run_dist_km IS NOT NULL)),
  'last_actv_dt',  (SELECT last_dt FROM last_actv),
  'primary_title', (SELECT jsonb_build_object(
                             'ttl_nm', t.ttl_nm,
                             'ttl_desc', t.ttl_desc,
                             'desc_visibility', t.desc_visibility)
                      FROM titles t WHERE t.is_prmy_yn LIMIT 1),
  'titles',        COALESCE((
                     SELECT jsonb_agg(jsonb_build_object(
                              'ttl_nm', t.ttl_nm,
                              'ttl_desc', t.ttl_desc,
                              'desc_visibility', t.desc_visibility,
                              'rarity_level', t.rarity_level,
                              'ttl_ctgr_cd', t.ttl_ctgr_cd)
                            ORDER BY t.grnt_at DESC NULLS LAST, t.rarity_level DESC)
                     FROM titles t), '[]'::jsonb),
  'best_records',  COALESCE((
                     SELECT jsonb_agg(jsonb_build_object(
                              'sport', b.sport,
                              'evt', b.evt,
                              'rec_time_sec', b.rec_time_sec,
                              'race_nm', b.race_nm,
                              'race_dt', b.race_dt)
                            ORDER BY b.ord)
                     FROM best b), '[]'::jsonb),
  'stats',         (SELECT jsonb_build_object(
                             'gthr_attd_cnt', s.gthr_attd_cnt,
                             'comp_reg_cnt',  s.comp_reg_cnt,
                             'activity_score', s.activity_score,
                             'recent_actv_cnt', s.recent_gthr_cnt + s.recent_race_cnt)
                      FROM stats s)
)
FROM me;
$function$;

COMMENT ON FUNCTION public.get_public_member_card(uuid, uuid) IS
  '멤버 프로필 카드(쇼케이스) 공개 프로젝션. 기록은 로드 FULL/HALF/10K + 철인 + 사이클 슬레이트만(트레일·울트라는 UTMB 인덱스로 갈음). 반환 null = 카드 없음.';

-- 랭킹이 이미 공개이므로 카드도 비로그인 조회 허용 (설계서 §7)
REVOKE ALL ON FUNCTION public.get_public_member_card(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_public_member_card(uuid, uuid) TO anon, authenticated, service_role;
