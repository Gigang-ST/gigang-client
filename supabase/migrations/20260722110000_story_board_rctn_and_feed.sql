-- 기강 전광판(기강이야기) 1차
--   ① rctn_mst — 범용 리액션 테이블 (cmnt_mst의 entity_type/entity_id 패턴 답습)
--   ② get_team_story_feed — 4개 존(신규가입·최근기록·다가오는대회·이달의순위) + 리액션 집계
-- 설계서: docs/superpowers/specs/2026-07-15-기강이야기-전광판-design.md
SET lock_timeout = '3s';

-- ─────────────────────────────────────────────
-- ① 리액션 테이블
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rctn_mst (
  rctn_id     uuid primary key default gen_random_uuid(),
  team_id     uuid not null,
  entity_type text not null,
  entity_id   text not null,
  mem_id      uuid not null,
  rctn_cd     text not null,
  crt_at      timestamptz not null default now(),
  -- team_id 포함: entity_id가 팀 간 재사용될 수 있어(예: ranking 기간키) 팀별로 분리
  constraint rctn_mst_uniq unique (team_id, entity_type, entity_id, mem_id),
  constraint rctn_mst_rctn_cd_chk
    check (rctn_cd in ('welcome','fire','cheer','clap','lol','boo'))
);

COMMENT ON TABLE public.rctn_mst IS
  '전광판 리액션(범용). 1인 1리액션 upsert. 기강 포인트 적립 트리거를 붙이지 않는다(리액션은 적립 대상 아님).';

CREATE INDEX IF NOT EXISTS ix_rctn_mst_entity
  ON public.rctn_mst (team_id, entity_type, entity_id);

ALTER TABLE public.rctn_mst ENABLE ROW LEVEL SECURITY;

-- 전광판은 비로그인도 볼 수 있어야 하므로(랭킹 공개 정책과 동일) 카운트는 공개 read.
-- 쓰기는 프로젝트 표준 RLS 헬퍼로 본인·팀 소속을 검사한다(cmnt_mst와 동일 패턴).
DROP POLICY IF EXISTS rctn_mst_select ON public.rctn_mst;
CREATE POLICY rctn_mst_select ON public.rctn_mst
  FOR SELECT USING (true);

DROP POLICY IF EXISTS rctn_mst_insert ON public.rctn_mst;
CREATE POLICY rctn_mst_insert ON public.rctn_mst
  FOR INSERT WITH CHECK (
    mem_id = public.v2_rls_resolve_mem_id()
    AND public.v2_rls_auth_in_team(team_id)
  );

DROP POLICY IF EXISTS rctn_mst_update ON public.rctn_mst;
CREATE POLICY rctn_mst_update ON public.rctn_mst
  FOR UPDATE USING (mem_id = public.v2_rls_resolve_mem_id())
  WITH CHECK (
    mem_id = public.v2_rls_resolve_mem_id()
    AND public.v2_rls_auth_in_team(team_id)
  );

DROP POLICY IF EXISTS rctn_mst_delete ON public.rctn_mst;
CREATE POLICY rctn_mst_delete ON public.rctn_mst
  FOR DELETE USING (mem_id = public.v2_rls_resolve_mem_id());

-- ─────────────────────────────────────────────
-- ② 전광판 피드 RPC
--    기간 창은 dev 실측 기준으로 잡았다: 기록은 90일(30일로 자르면 속보 존이 상시 빔),
--    대회는 60일, 신규는 30일. 크루 규모상 이벤트가 드물어 창을 좁히면 빈 화면이 된다.
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_team_story_feed(
  p_team_id uuid,
  p_mem_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH today AS (SELECT (now() AT TIME ZONE 'Asia/Seoul')::date AS d),
newbies AS (
  SELECT tm.mem_id, mm.mem_nm, mm.avatar_url, tm.join_dt
  FROM public.team_mem_rel tm
  INNER JOIN public.mem_mst mm ON mm.mem_id = tm.mem_id AND mm.vers = 0 AND mm.del_yn = false, today
  WHERE tm.team_id = p_team_id AND tm.vers = 0 AND tm.del_yn = false
    AND tm.mem_st_cd = 'active' AND tm.join_dt >= today.d - 30
  ORDER BY tm.join_dt DESC LIMIT 6
),
recent_recs AS (
  SELECT rr.race_result_id, rr.mem_id, mm.mem_nm, mm.avatar_url,
         c.comp_sprt_cd AS sport, COALESCE(ce.comp_evt_type, '') AS evt,
         rr.rec_time_sec, rr.race_nm, rr.race_dt
  FROM public.rec_race_hist rr
  INNER JOIN public.team_mem_rel tm ON tm.mem_id = rr.mem_id AND tm.team_id = p_team_id
   AND tm.mem_st_cd = 'active' AND tm.vers = 0 AND tm.del_yn = false
  INNER JOIN public.mem_mst mm ON mm.mem_id = rr.mem_id AND mm.vers = 0 AND mm.del_yn = false
  INNER JOIN public.comp_mst c ON c.comp_id = rr.comp_id AND c.vers = 0 AND c.del_yn = false
  LEFT JOIN public.comp_evt_cfg ce ON ce.comp_evt_id = rr.comp_evt_id AND ce.vers = 0 AND ce.del_yn = false, today
  WHERE rr.vers = 0 AND rr.del_yn = false AND rr.race_dt >= today.d - 90
  ORDER BY rr.race_dt DESC, rr.upd_at DESC LIMIT 8
),
upcoming AS (
  SELECT c.comp_id, c.short_id, c.comp_nm, c.stt_dt,
         count(DISTINCT cr.mem_id) AS reg_cnt,
         jsonb_agg(DISTINCT jsonb_build_object('mem_id', mm.mem_id, 'mem_nm', mm.mem_nm, 'avatar_url', mm.avatar_url)) AS runners
  FROM public.team_comp_plan_rel tcp
  INNER JOIN public.comp_mst c ON c.comp_id = tcp.comp_id AND c.vers = 0 AND c.del_yn = false
  INNER JOIN public.comp_reg_rel cr ON cr.team_comp_id = tcp.team_comp_id AND cr.vers = 0 AND cr.del_yn = false
  INNER JOIN public.mem_mst mm ON mm.mem_id = cr.mem_id AND mm.vers = 0 AND mm.del_yn = false, today
  WHERE tcp.team_id = p_team_id AND tcp.vers = 0 AND tcp.del_yn = false
    AND c.stt_dt >= today.d AND c.stt_dt <= today.d + 60
  GROUP BY c.comp_id, c.short_id, c.comp_nm, c.stt_dt
  ORDER BY c.stt_dt ASC LIMIT 4
),
month_rank AS (
  SELECT mm.mem_id, mm.mem_nm, mm.avatar_url, count(*) AS attd_cnt,
         row_number() OVER (ORDER BY count(*) DESC, mm.mem_nm) AS rn
  FROM public.gthr_attd_rel ga
  INNER JOIN public.gthr_mst gm ON gm.gthr_id = ga.gthr_id AND gm.del_yn = false AND gm.team_id = p_team_id
  INNER JOIN public.mem_mst mm ON mm.mem_id = ga.mem_id AND mm.vers = 0 AND mm.del_yn = false
  INNER JOIN public.team_mem_rel tm ON tm.mem_id = ga.mem_id AND tm.team_id = p_team_id
   AND tm.mem_st_cd = 'active' AND tm.vers = 0 AND tm.del_yn = false
  WHERE gm.stt_at >= date_trunc('month', now() AT TIME ZONE 'Asia/Seoul') AND gm.stt_at < now()
  GROUP BY mm.mem_id, mm.mem_nm, mm.avatar_url
  ORDER BY attd_cnt DESC LIMIT 5
),
rctn AS (
  SELECT entity_type, entity_id, count(*) AS cnt,
         max(CASE WHEN p_mem_id IS NOT NULL AND mem_id = p_mem_id THEN rctn_cd END) AS my_rctn
  FROM public.rctn_mst WHERE team_id = p_team_id GROUP BY entity_type, entity_id
)
SELECT jsonb_build_object(
  'newbies', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'entity_type','newbie','entity_id',n.mem_id::text,'event_at',n.join_dt,
      'mem_id',n.mem_id,'mem_nm',n.mem_nm,'avatar_url',n.avatar_url,
      'rctn_cd','welcome','rctn_count',COALESCE(r.cnt,0),'my_rctn',r.my_rctn) ORDER BY n.join_dt DESC)
    FROM newbies n LEFT JOIN rctn r ON r.entity_type='newbie' AND r.entity_id=n.mem_id::text), '[]'::jsonb),
  'records', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'entity_type','record','entity_id',rc.race_result_id::text,'event_at',rc.race_dt,
      'mem_id',rc.mem_id,'mem_nm',rc.mem_nm,'avatar_url',rc.avatar_url,
      'sport',rc.sport,'evt',rc.evt,'rec_time_sec',rc.rec_time_sec,'race_nm',rc.race_nm,
      'rctn_cd','fire','rctn_count',COALESCE(r.cnt,0),'my_rctn',r.my_rctn) ORDER BY rc.race_dt DESC)
    FROM recent_recs rc LEFT JOIN rctn r ON r.entity_type='record' AND r.entity_id=rc.race_result_id::text), '[]'::jsonb),
  'races', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'entity_type','race','entity_id',u.comp_id::text,'event_at',u.stt_dt,
      'comp_id',u.comp_id,'short_id',u.short_id,'comp_nm',u.comp_nm,'stt_dt',u.stt_dt,
      'reg_cnt',u.reg_cnt,'runners',u.runners,
      'rctn_cd','cheer','rctn_count',COALESCE(r.cnt,0),'my_rctn',r.my_rctn) ORDER BY u.stt_dt ASC)
    FROM upcoming u LEFT JOIN rctn r ON r.entity_type='race' AND r.entity_id=u.comp_id::text), '[]'::jsonb),
  'month_rank', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'rank',mr.rn,'mem_id',mr.mem_id,'mem_nm',mr.mem_nm,'avatar_url',mr.avatar_url,'attd_cnt',mr.attd_cnt) ORDER BY mr.rn)
    FROM month_rank mr), '[]'::jsonb)
);
$function$;

COMMENT ON FUNCTION public.get_team_story_feed(uuid, uuid) IS
  '기강 전광판 피드 — 신규가입·최근기록·다가오는대회·이달의순위 + 리액션 카운트. p_mem_id가 있으면 내 리액션을 함께 내린다.';

REVOKE ALL ON FUNCTION public.get_team_story_feed(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_team_story_feed(uuid, uuid) TO anon, authenticated, service_role;
