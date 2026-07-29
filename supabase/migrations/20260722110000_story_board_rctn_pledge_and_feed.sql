-- 기강 전광판(기강이야기) — squash
--   ① rctn_mst — 범용 리액션 테이블(cmnt_mst의 entity_type/entity_id 패턴 답습) + FK 2개 + rctn_cnt 카운트업 컬럼
--   ② pldg_mst — 멤버 각오(한 줄 다짐) 테이블
--   ③ bump_story_rctn — 리액션 원자적 증가 RPC(카운트업 전용, 취소 없음)
--   ④ get_team_story_feed — 신규가입·최근기록·다가오는대회·이달의참가왕·기강활동량랭킹·이번주통계·각오
--      + 리액션 집계(sum(rctn_cnt)) 최종본
--   ⑤ get_team_overview — 기강 기상대(최근 8주 주간 합계) 최종본
--
-- 이 파일은 세션 중 여러 차례 개정된 다음 원본들을 하나로 합친 것이다(개별 파일은 삭제):
--   20260722110000(rctn_mst 최초 + get_team_story_feed 초판)
--   20260722130000(get_team_story_feed v2: actv_rank·week_stat 추가)
--   20260723090000(pldg_mst 신설)
--   20260723090100(get_team_story_feed v5: pledges 존 추가)
--   20260723100000(rctn_mst FK 보강)
--   20260723100100(get_team_story_feed KST 경계 tz 수정)
--   20260723110000(rctn_mst rctn_cnt 카운트업 + bump_story_rctn 신설 + get_team_story_feed v3: 간단 카드 payload)
--   20260723120000(get_team_story_feed v4: 최근기록 기간창 제거 + race_dt 노출)
--   20260723130000(get_team_overview 신설)
--   20260723140000(get_team_story_feed v6 + get_team_overview: 마일리지런 활동 기록 카운트 병합)
-- 함수 본문·테이블 스키마·GRANT는 dev DB의 실제 정의(pg_get_functiondef, information_schema,
-- pg_constraint, pg_policies, pg_proc.proacl)를 정본으로 삼아 그대로 옮겼다.
-- (주의: bump_story_rctn은 애초 "service_role 전용" 의도로 작성됐으나 실제 dev DB에는
--  anon·authenticated에도 GRANT되어 있다 — 파일이 아니라 dev DB 실측을 따른다.)
-- 설계서: docs/superpowers/specs/2026-07-15-기강이야기-전광판-design.md,
--         docs/superpowers/specs/2026-07-23-전광판-응원-간단카드-활동량-design.md
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
  -- 1인 1행이되 rctn_cnt로 무한 카운트업(상한 99). 취소는 없다.
  rctn_cnt    integer not null default 1,
  -- team_id 포함: entity_id가 팀 간 재사용될 수 있어(예: ranking 기간키) 팀별로 분리
  constraint rctn_mst_uniq unique (team_id, entity_type, entity_id, mem_id),
  constraint rctn_mst_rctn_cd_chk
    check (rctn_cd in ('welcome','fire','cheer','clap','lol','boo')),
  constraint ck_rctn_mst_rctn_cnt check (rctn_cnt between 1 and 99),
  constraint rctn_mst_mem_id_fkey foreign key (mem_id) references public.mem_mst(mem_id),
  constraint rctn_mst_team_id_fkey foreign key (team_id) references public.team_mst(team_id)
);

COMMENT ON TABLE public.rctn_mst IS
  '전광판 리액션(범용). 1인 1행이되 rctn_cnt로 무한 카운트업(상한 99). 기강 포인트 적립 대상 아님.';
COMMENT ON COLUMN public.rctn_mst.rctn_cnt IS
  '이 멤버가 이 항목에 누른 횟수(1~99). 항목 총합은 sum(rctn_cnt). 취소는 없다 — 카운트업 전용';

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
-- ② 각오(pledge) 테이블
-- ─────────────────────────────────────────────
-- 설계 근거(네이밍):
--   · 독립 마스터 테이블(_mst)로 둔다 — cmnt_mst/rctn_mst처럼 다른 엔티티에 "붙는" 범용 부속물이
--     아니라, sch_post_mst/gthr_mst처럼 그 자체로 발행되는 콘텐츠이기 때문. entity_type/entity_id
--     범용 패턴은 "어떤 대상에 대한 코멘트"에 쓰는 패턴이고, 각오는 대상이 없다(자기 자신에 대한
--     선언). 그래서 cmnt_mst를 베끼지 않고 team_id+mem_id를 직접 FK로 둔다.
--   · 컬럼 접미사: team_id/mem_id(관계), pldg_txt(텍스트, cont_txt·intro_txt와 동일 접미사),
--     del_yn/crt_at/upd_at(표준 감사 컬럼). vers는 두지 않는다 — del_yn 소프트 삭제 + crt_at
--     정렬로 충분하고, 최근 마스터 테이블들(cmnt_mst, rctn_mst, gthr_mst, sch_post_mst)도
--     vers 없이 del_yn만 쓰는 쪽이 대세라 그 결을 따른다.
CREATE TABLE IF NOT EXISTS public.pldg_mst (
  pldg_id     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     uuid        NOT NULL REFERENCES public.team_mst(team_id),
  mem_id      uuid        NOT NULL REFERENCES public.mem_mst(mem_id),
  pldg_txt    text        NOT NULL,
  del_yn      boolean     NOT NULL DEFAULT false,
  crt_at      timestamptz NOT NULL DEFAULT now(),
  upd_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_pldg_mst_pldg_txt_len
    CHECK (char_length(pldg_txt) BETWEEN 1 AND 40)
);

COMMENT ON TABLE  public.pldg_mst           IS
  '멤버 각오(한 줄 다짐). 만료 없이 누적, 전광판(/story)에 최근순 노출. 리액션 대상 아님(현재 스콥).';
COMMENT ON COLUMN public.pldg_mst.pldg_txt  IS '각오 본문 — 최대 40자(CHECK로 강제, 서버 액션에서도 이중 검증)';
COMMENT ON COLUMN public.pldg_mst.del_yn    IS 'soft delete — 작성자 본인 삭제용(현재 서버 액션 스콥 밖, 정책만 마련)';

-- 최근순 목록 조회(팀별) — get_team_story_feed가 team_id+del_yn 필터 후 crt_at DESC LIMIT N으로 긁는다.
CREATE INDEX IF NOT EXISTS ix_pldg_mst_team_recent
  ON public.pldg_mst (team_id, crt_at DESC)
  WHERE del_yn = false;

-- 멤버별 조회(마이페이지 등 향후 확장 대비) — 현재 스콥엔 없지만 FK 컬럼 인덱스는 관례상 함께 둔다.
CREATE INDEX IF NOT EXISTS ix_pldg_mst_mem
  ON public.pldg_mst (mem_id)
  WHERE del_yn = false;

ALTER TABLE public.pldg_mst ENABLE ROW LEVEL SECURITY;

-- SELECT: 전광판이 비로그인도 노출되므로(랭킹·리액션 카운트와 동일 정책) 공개 read.
DROP POLICY IF EXISTS pldg_mst_select ON public.pldg_mst;
CREATE POLICY pldg_mst_select ON public.pldg_mst
  FOR SELECT USING (del_yn = false);

-- INSERT: 로그인 + 본인 mem_id + 본인이 소속된 팀만. "활동 멤버"(mem_st_cd='active') 제약은
-- v2_rls_auth_in_team()이 검사하지 않으므로(소속 여부만 검사) 서버 액션에서 withActive로 별도 강제한다
-- (cmnt_mst_insert도 동일하게 RLS는 소속만, active 여부는 애플리케이션 레이어 — 기존 패턴 그대로).
DROP POLICY IF EXISTS pldg_mst_insert ON public.pldg_mst;
CREATE POLICY pldg_mst_insert ON public.pldg_mst
  FOR INSERT WITH CHECK (
    mem_id = public.v2_rls_resolve_mem_id()
    AND public.v2_rls_auth_in_team(team_id)
    AND del_yn = false
  );

-- UPDATE: 본인 각오만 수정/soft-delete 가능(팀장/관리자 삭제는 이번 스콥에 없음 — 필요 시 cmnt_mst_update처럼 확장).
DROP POLICY IF EXISTS pldg_mst_update ON public.pldg_mst;
CREATE POLICY pldg_mst_update ON public.pldg_mst
  FOR UPDATE USING (mem_id = public.v2_rls_resolve_mem_id())
  WITH CHECK (
    mem_id = public.v2_rls_resolve_mem_id()
    AND public.v2_rls_auth_in_team(team_id)
  );

-- ─────────────────────────────────────────────
-- ③ 리액션 원자적 증가 RPC
-- ─────────────────────────────────────────────
-- 읽고-쓰기 왕복으로 증가시키면 동시 연타에서 증분이 유실된다.
-- ON CONFLICT DO UPDATE 한 문장으로 처리하고, 상한은 LEAST로 잘라 CHECK 위반 대신
-- 조용히 멈추게 한다(연타 중 에러 토스트가 뜨는 게 더 나쁘다).
CREATE OR REPLACE FUNCTION public.bump_story_rctn(
  p_team_id     uuid,
  p_entity_type text,
  p_entity_id   text,
  p_mem_id      uuid,
  p_rctn_cd     text,
  p_delta       integer
)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  INSERT INTO public.rctn_mst (team_id, entity_type, entity_id, mem_id, rctn_cd, rctn_cnt)
  VALUES (p_team_id, p_entity_type, p_entity_id, p_mem_id, p_rctn_cd,
          LEAST(GREATEST(p_delta, 1), 99))
  ON CONFLICT (team_id, entity_type, entity_id, mem_id)
  DO UPDATE SET rctn_cnt = LEAST(public.rctn_mst.rctn_cnt + EXCLUDED.rctn_cnt, 99),
                rctn_cd  = EXCLUDED.rctn_cd
  RETURNING rctn_cnt;
$function$;

COMMENT ON FUNCTION public.bump_story_rctn(uuid, text, text, uuid, text, integer) IS
  '전광판 리액션 카운트업. 갱신 후 이 멤버의 누적 횟수를 반환한다. 상한 99에서 포화(에러 아님).';

REVOKE ALL ON FUNCTION public.bump_story_rctn(uuid, text, text, uuid, text, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.bump_story_rctn(uuid, text, text, uuid, text, integer) TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────
-- ④ 전광판 피드 RPC 최종본
-- ─────────────────────────────────────────────
-- newbies: 최근 30일 신규가입 + 간단 프로필 카드 payload(칭호·프레임·한마디·러닝 프로필).
-- recent_recs: 기간 필터 없음(최신순 10건) — 활동이 뜸한 시기에도 지면이 비지 않게 한다.
-- upcoming: 60일 내 예정 대회.
-- month_rank: 이달의 참가왕(모임 참석 횟수, KST 월 경계).
-- actv_rank: 기강 활동량 랭킹 — 이번 달(aply_dt 기준, KST) 합산. 매달 1일에 0부터 다시 시작.
--   `aply_dt <= 오늘` 필터는 필수: 대회 포인트는 개최일에 귀속되므로, 없으면 미래 대회를
--   신청한 사람이 랭킹에 미리 잡힌다.
-- week_stat: 이번 주(KST 월요일 시작 ~ now) 모임 수/연인원 참석/기록 수.
--   기록 수는 대회 기록(crt_at 기준) + 마일리지런 활동(act_dt 기준) 합산.
-- pledges: 각오 최근 8건(기간 무제한, crt_at DESC).
-- rctn: sum(rctn_cnt)로 총합, my_cnt로 내 누적 횟수(상한 표시용) 별도 제공.
-- 주/월 경계는 KST 벽시계로 자른 뒤 timestamptz로 되돌려 timestamptz 컬럼과 정확히 비교한다
-- (세션 TimeZone이 UTC라 벽시계 값을 그대로 쓰면 9시간 밀린다).
-- 반환 키에 point/pt 문자열을 쓰지 않는다(기강 포인트는 히든 운영).
CREATE OR REPLACE FUNCTION public.get_team_story_feed(p_team_id uuid, p_mem_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH today AS (SELECT (now() AT TIME ZONE 'Asia/Seoul')::date AS d),
week_start AS (
  SELECT (date_trunc('week', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul') AS w
),
newbies AS (
  SELECT tm.mem_id, tm.team_mem_id, mm.mem_nm, mm.avatar_url, tm.join_dt,
         COALESCE(tm.selected_badge_effect, 'none')   AS badge_effect,
         COALESCE(tm.selected_frame_cd, 'frame-none') AS frame_cd,
         tm.intro_txt
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
  LEFT JOIN public.comp_evt_cfg ce ON ce.comp_evt_id = rr.comp_evt_id AND ce.vers = 0 AND ce.del_yn = false
  WHERE rr.vers = 0 AND rr.del_yn = false
  ORDER BY rr.race_dt DESC, rr.upd_at DESC LIMIT 10
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
  WHERE gm.stt_at >= (date_trunc('month', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul')
    AND gm.stt_at < now()
  GROUP BY mm.mem_id, mm.mem_nm, mm.avatar_url
  ORDER BY attd_cnt DESC LIMIT 5
),
actv_rank AS (
  SELECT mm.mem_id, mm.mem_nm, mm.avatar_url, sum(pt.pt_amt)::integer AS actv_score,
         row_number() OVER (ORDER BY sum(pt.pt_amt) DESC, mm.mem_nm) AS rn
  FROM public.pt_txn_hist pt
  INNER JOIN public.team_mem_rel tm ON tm.mem_id = pt.mem_id AND tm.team_id = p_team_id
   AND tm.mem_st_cd = 'active' AND tm.vers = 0 AND tm.del_yn = false
  INNER JOIN public.mem_mst mm ON mm.mem_id = pt.mem_id AND mm.vers = 0 AND mm.del_yn = false, today
  WHERE pt.team_id = p_team_id
    AND pt.aply_dt >= date_trunc('month', today.d)::date
    AND pt.aply_dt <= today.d
  GROUP BY mm.mem_id, mm.mem_nm, mm.avatar_url
  HAVING sum(pt.pt_amt) > 0
  ORDER BY actv_score DESC LIMIT 10
),
week_gthr AS (
  SELECT gm.gthr_id
  FROM public.gthr_mst gm, week_start
  WHERE gm.team_id = p_team_id AND gm.del_yn = false
    AND gm.stt_at >= week_start.w AND gm.stt_at < now()
),
week_attd AS (
  SELECT ga.mem_id
  FROM public.gthr_attd_rel ga
  INNER JOIN week_gthr wg ON wg.gthr_id = ga.gthr_id
),
week_recs AS (
  -- 대회 기록: crt_at(기록 입력 시각) 기준
  SELECT rr.race_result_id::text AS rec_id
  FROM public.rec_race_hist rr
  INNER JOIN public.team_mem_rel tm ON tm.mem_id = rr.mem_id AND tm.team_id = p_team_id
   AND tm.mem_st_cd = 'active' AND tm.vers = 0 AND tm.del_yn = false, week_start
  WHERE rr.vers = 0 AND rr.del_yn = false AND rr.crt_at >= week_start.w
  UNION ALL
  -- 마일리지런 활동: act_dt(활동일, KST 자정 변환) 기준 — "기록"의 정의를 대회 밖으로 확장
  SELECT eth.act_id::text AS rec_id
  FROM public.evt_mlg_act_hist eth
  INNER JOIN public.evt_team_prt_rel etpr ON etpr.prt_id = eth.prt_id
  INNER JOIN public.evt_team_mst etm ON etm.evt_id = etpr.evt_id AND etm.team_id = p_team_id
  INNER JOIN public.team_mem_rel tm ON tm.mem_id = etpr.mem_id AND tm.team_id = p_team_id
   AND tm.mem_st_cd = 'active' AND tm.vers = 0 AND tm.del_yn = false, week_start
  WHERE (eth.act_dt AT TIME ZONE 'Asia/Seoul') >= week_start.w
),
week_stat AS (
  SELECT (SELECT count(*) FROM week_gthr) AS gthr_cnt,
         (SELECT count(*) FROM week_attd) AS attd_cnt,
         (SELECT count(*) FROM week_recs) AS rec_cnt
),
recent_pledges AS (
  SELECT p.pldg_id, p.mem_id, mm.mem_nm, mm.avatar_url, p.pldg_txt, p.crt_at
  FROM public.pldg_mst p
  INNER JOIN public.mem_mst mm ON mm.mem_id = p.mem_id AND mm.vers = 0 AND mm.del_yn = false
  WHERE p.team_id = p_team_id AND p.del_yn = false
  ORDER BY p.crt_at DESC LIMIT 8
),
rctn AS (
  SELECT entity_type, entity_id, sum(rctn_cnt)::integer AS cnt,
         max(CASE WHEN p_mem_id IS NOT NULL AND mem_id = p_mem_id THEN rctn_cd END) AS my_rctn,
         COALESCE(max(CASE WHEN p_mem_id IS NOT NULL AND mem_id = p_mem_id THEN rctn_cnt END), 0)::integer AS my_cnt
  FROM public.rctn_mst WHERE team_id = p_team_id GROUP BY entity_type, entity_id
)
SELECT jsonb_build_object(
  'newbies', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'entity_type','newbie','entity_id',n.mem_id::text,'event_at',n.join_dt,
      'mem_id',n.mem_id,'mem_nm',n.mem_nm,'avatar_url',n.avatar_url,
      'badge_effect',n.badge_effect,'frame_cd',n.frame_cd,'intro_txt',n.intro_txt,
      'primary_title',(SELECT jsonb_build_object(
                         'ttl_nm',t.ttl_nm,'ttl_desc',t.ttl_desc,'desc_visibility',t.desc_visibility)
                       FROM public.mem_ttl_rel mt
                       INNER JOIN public.ttl_mst t
                         ON t.ttl_id = mt.ttl_id AND t.vers = 0 AND t.del_yn = false AND t.use_yn = true
                       WHERE mt.team_mem_id = n.team_mem_id AND mt.vers = 0 AND mt.del_yn = false
                         AND (mt.exp_at IS NULL OR mt.exp_at > now()) AND mt.is_prmy_yn
                       LIMIT 1),
      'running_profile',(SELECT jsonb_build_object(
                           'avg_pace_cd',op.avg_pace_cd,'avg_run_dist_km',op.avg_run_dist_km,
                           'near_stn_nm',op.near_stn_nm,
                           'join_purp_cds',COALESCE(op.join_purp_cds,'{}'::text[]),
                           'join_purp_txt',op.join_purp_txt)
                         FROM public.mem_onbd_prf op WHERE op.mem_id = n.mem_id),
      'rctn_cd','welcome','rctn_count',COALESCE(r.cnt,0),'my_rctn',r.my_rctn,
      'my_cnt',COALESCE(r.my_cnt,0)) ORDER BY n.join_dt DESC)
    FROM newbies n LEFT JOIN rctn r ON r.entity_type='newbie' AND r.entity_id=n.mem_id::text), '[]'::jsonb),
  'records', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'entity_type','record','entity_id',rc.race_result_id::text,'event_at',rc.race_dt,
      'mem_id',rc.mem_id,'mem_nm',rc.mem_nm,'avatar_url',rc.avatar_url,
      'sport',rc.sport,'evt',rc.evt,'rec_time_sec',rc.rec_time_sec,'race_nm',rc.race_nm,
      'race_dt',rc.race_dt,
      'rctn_cd','fire','rctn_count',COALESCE(r.cnt,0),'my_rctn',r.my_rctn,
      'my_cnt',COALESCE(r.my_cnt,0)) ORDER BY rc.race_dt DESC)
    FROM recent_recs rc LEFT JOIN rctn r ON r.entity_type='record' AND r.entity_id=rc.race_result_id::text), '[]'::jsonb),
  'races', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'entity_type','race','entity_id',u.comp_id::text,'event_at',u.stt_dt,
      'comp_id',u.comp_id,'short_id',u.short_id,'comp_nm',u.comp_nm,'stt_dt',u.stt_dt,
      'reg_cnt',u.reg_cnt,'runners',u.runners,
      'rctn_cd','cheer','rctn_count',COALESCE(r.cnt,0),'my_rctn',r.my_rctn,
      'my_cnt',COALESCE(r.my_cnt,0)) ORDER BY u.stt_dt ASC)
    FROM upcoming u LEFT JOIN rctn r ON r.entity_type='race' AND r.entity_id=u.comp_id::text), '[]'::jsonb),
  'month_rank', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'rank',mr.rn,'mem_id',mr.mem_id,'mem_nm',mr.mem_nm,'avatar_url',mr.avatar_url,'attd_cnt',mr.attd_cnt) ORDER BY mr.rn)
    FROM month_rank mr), '[]'::jsonb),
  'actv_rank', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'rank',ar.rn,'mem_id',ar.mem_id,'mem_nm',ar.mem_nm,'avatar_url',ar.avatar_url,'actv_score',ar.actv_score) ORDER BY ar.rn)
    FROM actv_rank ar), '[]'::jsonb),
  'week_stat', (SELECT jsonb_build_object(
      'gthr_cnt', ws.gthr_cnt, 'attd_cnt', ws.attd_cnt, 'rec_cnt', ws.rec_cnt)
    FROM week_stat ws),
  'pledges', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'pldg_id',p.pldg_id,'mem_id',p.mem_id,'mem_nm',p.mem_nm,'avatar_url',p.avatar_url,
      'pldg_txt',p.pldg_txt,'crt_at',p.crt_at) ORDER BY p.crt_at DESC)
    FROM recent_pledges p), '[]'::jsonb)
);
$function$;

COMMENT ON FUNCTION public.get_team_story_feed(uuid, uuid) IS
  '전광판(/story) 피드 v6 — week_stat.rec_cnt에 마일리지런 활동(evt_mlg_act_hist, act_dt 기준)을 대회 기록과 합산. 그 외 로직은 v5(pledges 포함)와 동일.';

REVOKE ALL ON FUNCTION public.get_team_story_feed(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_team_story_feed(uuid, uuid) TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────
-- ⑤ 기강 기상대 — 크루 전체 분위기를 한 상자에 담기 위한 오버뷰 RPC
-- ─────────────────────────────────────────────
-- get_team_story_feed에 얹지 않고 함수를 나눈 이유: 관심사가 다르고(개별 소식 vs 크루 총량)
-- 캐시 수명도 다르다. 피드 함수는 이미 CTE가 열 개를 넘어 더 붙이면 읽기 어려워진다.
--
-- 반환:
--   mem_cnt — 활동 회원 수
--   weeks   — 최근 8주(월요일 시작, KST) 주간 합계. 마지막 원소가 이번 주(지금까지)다.
--             프론트가 마지막 값을 직전 4주 평균과 비교해 "기강 날씨"를 판정한다.
--   rec_cnt는 대회 기록(crt_at 기준) + 마일리지런 활동(act_dt 기준) 합산.
CREATE OR REPLACE FUNCTION public.get_team_overview(p_team_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH weeks AS (
  -- 서울 벽시계로 주 경계를 자른 뒤 timestamptz로 되돌려야 timestamptz 컬럼과 정확히 비교된다
  -- (세션 TimeZone이 UTC라 벽시계 값을 그대로 쓰면 9시간 밀린다).
  SELECT gs::date                                        AS w_start,
         (gs AT TIME ZONE 'Asia/Seoul')                  AS w_from,
         -- 이번 주는 아직 안 끝났다. 미래 일정이 이번 주 수치를 부풀리지 않게 now()로 자른다.
         LEAST((gs + interval '1 week') AT TIME ZONE 'Asia/Seoul', now()) AS w_to
  FROM generate_series(
    date_trunc('week', now() AT TIME ZONE 'Asia/Seoul') - interval '7 weeks',
    date_trunc('week', now() AT TIME ZONE 'Asia/Seoul'),
    interval '1 week'
  ) AS gs
),
mem_cnt AS (
  SELECT count(*)::integer AS c
  FROM public.team_mem_rel tm
  INNER JOIN public.mem_mst mm ON mm.mem_id = tm.mem_id AND mm.vers = 0 AND mm.del_yn = false
  WHERE tm.team_id = p_team_id AND tm.vers = 0 AND tm.del_yn = false
    AND tm.mem_st_cd = 'active'
),
wk AS (
  SELECT
    w.w_start,
    (SELECT count(*) FROM public.gthr_mst gm
      WHERE gm.team_id = p_team_id AND gm.del_yn = false
        AND gm.stt_at >= w.w_from AND gm.stt_at < w.w_to)::integer AS gthr_cnt,
    (SELECT count(*) FROM public.gthr_attd_rel ga
      INNER JOIN public.gthr_mst gm ON gm.gthr_id = ga.gthr_id
       AND gm.del_yn = false AND gm.team_id = p_team_id
      WHERE gm.stt_at >= w.w_from AND gm.stt_at < w.w_to)::integer AS attd_cnt,
    (
      -- 대회 기록: crt_at 기준
      (SELECT count(*) FROM public.rec_race_hist rr
        INNER JOIN public.team_mem_rel tm ON tm.mem_id = rr.mem_id AND tm.team_id = p_team_id
         AND tm.mem_st_cd = 'active' AND tm.vers = 0 AND tm.del_yn = false
        WHERE rr.vers = 0 AND rr.del_yn = false
          AND rr.crt_at >= w.w_from AND rr.crt_at < w.w_to)
      +
      -- 마일리지런 활동: act_dt(활동일, KST 자정 변환) 기준으로 같은 주 경계와 비교
      (SELECT count(*) FROM public.evt_mlg_act_hist eth
        INNER JOIN public.evt_team_prt_rel etpr ON etpr.prt_id = eth.prt_id
        INNER JOIN public.evt_team_mst etm ON etm.evt_id = etpr.evt_id AND etm.team_id = p_team_id
        INNER JOIN public.team_mem_rel tm ON tm.mem_id = etpr.mem_id AND tm.team_id = p_team_id
         AND tm.mem_st_cd = 'active' AND tm.vers = 0 AND tm.del_yn = false
        WHERE (eth.act_dt AT TIME ZONE 'Asia/Seoul') >= w.w_from
          AND (eth.act_dt AT TIME ZONE 'Asia/Seoul') < w.w_to)
    )::integer AS rec_cnt
  FROM weeks w
)
SELECT jsonb_build_object(
  'mem_cnt', (SELECT c FROM mem_cnt),
  'weeks', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'w_start',  wk.w_start,
      'gthr_cnt', wk.gthr_cnt,
      'attd_cnt', wk.attd_cnt,
      'rec_cnt',  wk.rec_cnt
    ) ORDER BY wk.w_start) FROM wk), '[]'::jsonb)
);
$function$;

COMMENT ON FUNCTION public.get_team_overview(uuid) IS
  '기강 기상대 — 활동 회원 수 + 최근 8주(월요일 시작, KST) 주간 합계(모임/참석 연인원/기록). rec_cnt는 대회 기록(crt_at 기준) + 마일리지런 활동(act_dt 기준) 합산. 마지막 원소가 이번 주(now()까지). 전광판 상단 오버뷰 박스 전용.';

REVOKE ALL ON FUNCTION public.get_team_overview(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_team_overview(uuid) TO anon, authenticated, service_role;
