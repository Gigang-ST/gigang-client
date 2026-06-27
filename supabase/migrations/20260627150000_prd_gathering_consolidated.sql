-- ============================================================
-- ⚠️ PRD 전용 일회성 정합 마이그레이션 (이미 prd에 적용 완료, 2026-06-27)
--   - dev에는 이미 개별 모임 마이그(20260620100000~20260622220000)로 동일 객체가 존재하므로
--     이 파일을 dev/로컬 supabase db reset에 재적용하면 "already exists" 충돌이 난다.
--   - 신규 환경 초기화 시에는 이 파일을 건너뛰고 개별 모임 마이그를 사용할 것.
--   - 목적: 모임 기능이 누락돼 있던 prd를 dev 최종 상태로 따라잡히기 위한 통합본.
-- ============================================================
-- 모임(gathering) 기능 prd 통합 마이그레이션
-- dev 최종 상태를 prd에 재현. 하이록스 랭킹(add_hyrox_sport_and_splits_json)은 제외.
--
-- prd 현황(검증 완료):
--   - gthr_mst / gthr_attd_rel / 모임 RPC 전부 없음 → 신규 생성
--   - noti_mst CHECK 제약: dev와 동일(fdbk 포함) → 건드리지 않음
--   - get_public_team_competitions: dev와 동일 → 건드리지 않음
--   - get_public_team_sch_posts: prd가 이미 short_id 포함 → 건드리지 않음
--   - get_schedule_paged: prd엔 short_id·모임 UNION 없음 → 모임 포함 최종본으로 교체
--   - 의존성(v2_rls_*, generate_nanoid, team_mst) 전부 존재 확인
-- ============================================================

-- ── 1. gthr_mst 테이블 (최종 형태: sprt_cd, short_id 포함) ──
CREATE TABLE public.gthr_mst (
  gthr_id       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id       uuid        NOT NULL REFERENCES public.team_mst(team_id),
  gthr_type_enm text        NOT NULL CHECK (gthr_type_enm IN ('general', 'regular', 'event')),
  gthr_nm       text        NOT NULL,
  desc_txt      text,
  loc_txt       text,
  stt_at        timestamptz NOT NULL,
  end_at        timestamptz,
  max_prt_cnt   int,
  sprt_cd       text,
  short_id      text        NOT NULL DEFAULT generate_nanoid(),
  crt_by        uuid        NOT NULL REFERENCES public.mem_mst(mem_id),
  del_yn        boolean     NOT NULL DEFAULT false,
  crt_at        timestamptz NOT NULL DEFAULT now(),
  upd_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gthr_mst_short_id_key UNIQUE (short_id)
);

COMMENT ON TABLE  public.gthr_mst             IS '모임 마스터 (팀 멤버 누구나 개설)';
COMMENT ON COLUMN public.gthr_mst.sprt_cd     IS '모임 종목 (running, trail_run, hyrox 등 자유값, NULL=미지정)';
COMMENT ON COLUMN public.gthr_mst.short_id    IS '딥링크/공유용 짧은 ID';

CREATE INDEX ix_gthr_mst_team_stt_at ON public.gthr_mst(team_id, stt_at ASC) WHERE del_yn = false;
CREATE INDEX ix_gthr_mst_crt_by      ON public.gthr_mst(crt_by) WHERE del_yn = false;
CREATE INDEX ix_gthr_mst_short_id    ON public.gthr_mst(short_id);

ALTER TABLE public.gthr_mst ENABLE ROW LEVEL SECURITY;

CREATE POLICY gthr_mst_select ON public.gthr_mst
  FOR SELECT TO authenticated
  USING (del_yn = false AND public.v2_rls_auth_in_team(team_id));

CREATE POLICY gthr_mst_select_anon ON public.gthr_mst
  FOR SELECT TO anon
  USING (del_yn = false AND EXISTS (SELECT 1 FROM public.team_mst t WHERE t.team_id = gthr_mst.team_id));

CREATE POLICY gthr_mst_insert ON public.gthr_mst
  FOR INSERT TO authenticated
  WITH CHECK (crt_by = public.v2_rls_resolve_mem_id() AND del_yn = false AND public.v2_rls_auth_in_team(team_id));

CREATE POLICY gthr_mst_update ON public.gthr_mst
  FOR UPDATE TO authenticated
  USING (crt_by = public.v2_rls_resolve_mem_id() OR public.v2_rls_auth_team_owner_or_admin(team_id))
  WITH CHECK (crt_by = public.v2_rls_resolve_mem_id() OR public.v2_rls_auth_team_owner_or_admin(team_id));

-- ── 2. gthr_attd_rel 테이블 ──
CREATE TABLE public.gthr_attd_rel (
  attd_id  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  gthr_id  uuid        NOT NULL REFERENCES public.gthr_mst(gthr_id),
  mem_id   uuid        NOT NULL REFERENCES public.mem_mst(mem_id),
  crt_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gthr_id, mem_id)
);

CREATE INDEX ix_gthr_attd_rel_gthr ON public.gthr_attd_rel(gthr_id);
CREATE INDEX ix_gthr_attd_rel_mem  ON public.gthr_attd_rel(mem_id);

ALTER TABLE public.gthr_attd_rel ENABLE ROW LEVEL SECURITY;

CREATE POLICY gthr_attd_rel_select ON public.gthr_attd_rel
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.gthr_mst g WHERE g.gthr_id = gthr_attd_rel.gthr_id AND g.del_yn = false AND public.v2_rls_auth_in_team(g.team_id)));

CREATE POLICY gthr_attd_rel_select_anon ON public.gthr_attd_rel
  FOR SELECT TO anon
  USING (EXISTS (SELECT 1 FROM public.gthr_mst g JOIN public.team_mst t ON t.team_id = g.team_id WHERE g.gthr_id = gthr_attd_rel.gthr_id AND g.del_yn = false));

CREATE POLICY gthr_attd_rel_insert ON public.gthr_attd_rel
  FOR INSERT TO authenticated
  WITH CHECK (mem_id = public.v2_rls_resolve_mem_id() AND EXISTS (SELECT 1 FROM public.gthr_mst g WHERE g.gthr_id = gthr_attd_rel.gthr_id AND g.del_yn = false AND public.v2_rls_auth_in_team(g.team_id)));

CREATE POLICY gthr_attd_rel_delete ON public.gthr_attd_rel
  FOR DELETE TO authenticated
  USING (mem_id = public.v2_rls_resolve_mem_id());

-- ── 3. get_public_team_gatherings (최종본: sprt_cd + is_attending) ──
CREATE FUNCTION public.get_public_team_gatherings(
  p_team_id uuid, p_start date DEFAULT NULL::date, p_end date DEFAULT NULL::date, p_mem_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  gthr_id uuid, short_id text, gthr_nm text, gthr_type_enm text, sprt_cd text,
  stt_at timestamptz, end_at timestamptz, loc_txt text, desc_txt text,
  crt_by uuid, crt_by_nm text, attd_count bigint, cmnt_count bigint, is_attending boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
WITH attd_agg AS (
  SELECT gthr_id, COUNT(*) AS attd_count FROM public.gthr_attd_rel GROUP BY gthr_id
),
cmnt_agg AS (
  SELECT entity_id AS gthr_id, COUNT(*) AS cmnt_count FROM public.cmnt_mst
  WHERE entity_type = 'gathering' AND del_yn = false GROUP BY entity_id
),
my_attd AS (
  SELECT gthr_id FROM public.gthr_attd_rel WHERE mem_id = p_mem_id
)
SELECT g.gthr_id, g.short_id, g.gthr_nm, g.gthr_type_enm, g.sprt_cd,
  g.stt_at, g.end_at, g.loc_txt, g.desc_txt, g.crt_by,
  m.mem_nm AS crt_by_nm,
  COALESCE(aa.attd_count, 0) AS attd_count,
  COALESCE(ca.cmnt_count, 0) AS cmnt_count,
  CASE WHEN p_mem_id IS NULL THEN false ELSE ma.gthr_id IS NOT NULL END AS is_attending
FROM public.gthr_mst g
LEFT JOIN public.mem_mst m  ON m.mem_id   = g.crt_by
LEFT JOIN attd_agg aa       ON aa.gthr_id = g.gthr_id
LEFT JOIN cmnt_agg ca       ON ca.gthr_id = g.gthr_id
LEFT JOIN my_attd ma        ON ma.gthr_id = g.gthr_id
WHERE g.team_id = p_team_id AND g.del_yn = false
  AND (p_start IS NULL OR g.stt_at >= (p_start::timestamptz AT TIME ZONE 'Asia/Seoul'))
  AND (p_end   IS NULL OR g.stt_at <  ((p_end::timestamptz + interval '1 day') AT TIME ZONE 'Asia/Seoul'))
ORDER BY g.stt_at ASC;
$function$;

GRANT EXECUTE ON FUNCTION public.get_public_team_gatherings(uuid, date, date, uuid)
  TO anon, authenticated, service_role;

-- ── 4. get_gathering_detail (팀 스코프 버전) ──
CREATE FUNCTION public.get_gathering_detail(p_gthr_id uuid, p_team_id uuid)
RETURNS json
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT json_build_object(
    'max_prt_cnt', g.max_prt_cnt,
    'sprt_cd',     g.sprt_cd,
    'attendees',   COALESCE(
      (SELECT json_agg(json_build_object('mem_id', ar.mem_id, 'mem_nm', m.mem_nm, 'avatar_url', m.avatar_url) ORDER BY ar.crt_at ASC)
       FROM gthr_attd_rel ar LEFT JOIN mem_mst m ON m.mem_id = ar.mem_id WHERE ar.gthr_id = p_gthr_id),
      '[]'::json
    )
  )
  FROM gthr_mst g
  WHERE g.gthr_id = p_gthr_id AND g.team_id = p_team_id AND g.del_yn = false;
$function$;

GRANT EXECUTE ON FUNCTION public.get_gathering_detail(uuid, uuid) TO anon, authenticated, service_role;

-- ── 5. get_schedule_paged (모임 UNION + short_id 포함 최종본으로 교체) ──
-- prd 기존 버전은 short_id·모임이 없으므로 DROP 후 재생성
DROP FUNCTION IF EXISTS public.get_schedule_paged(uuid, text, date, uuid, int);

CREATE FUNCTION public.get_schedule_paged(
  p_team_id uuid, p_direction text, p_cursor_date date, p_mem_id uuid DEFAULT NULL::uuid, p_month_limit integer DEFAULT 2
)
RETURNS TABLE(
  item_type text, item_id uuid, item_nm text, post_type text, start_date date, end_date date,
  loc_nm text, url text, cont_txt text, evt_stt_at timestamptz, evt_end_at timestamptz,
  crt_by uuid, crt_by_nm text, reg_count bigint, cmnt_count bigint, short_id text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
WITH
my_regs AS (
  SELECT DISTINCT team_comp_id FROM public.comp_reg_rel WHERE mem_id = p_mem_id AND vers = 0 AND del_yn = false
),
my_attd AS (
  SELECT DISTINCT gthr_id FROM public.gthr_attd_rel WHERE mem_id = p_mem_id
),
sch_dates AS (
  SELECT (s.evt_stt_at AT TIME ZONE 'Asia/Seoul')::date AS event_date
  FROM public.sch_post_mst s WHERE s.team_id = p_team_id AND s.del_yn = false
    AND ((p_direction = 'prev' AND (s.evt_stt_at AT TIME ZONE 'Asia/Seoul')::date < p_cursor_date) OR
         (p_direction = 'next' AND (s.evt_stt_at AT TIME ZONE 'Asia/Seoul')::date > p_cursor_date))
),
comp_dates AS (
  SELECT DISTINCT c.stt_dt AS event_date
  FROM public.team_comp_plan_rel tcp
  JOIN public.comp_mst c ON c.comp_id = tcp.comp_id AND c.vers = 0 AND c.del_yn = false
  WHERE tcp.team_id = p_team_id AND tcp.vers = 0 AND tcp.del_yn = false
    AND ((p_direction = 'prev' AND c.stt_dt < p_cursor_date) OR (p_direction = 'next' AND c.stt_dt > p_cursor_date))
    AND (EXISTS (SELECT 1 FROM public.comp_reg_rel cr WHERE cr.team_comp_id = tcp.team_comp_id AND cr.vers = 0 AND cr.del_yn = false)
         OR EXISTS (SELECT 1 FROM my_regs mr WHERE mr.team_comp_id = tcp.team_comp_id))
),
gthr_dates AS (
  SELECT (g.stt_at AT TIME ZONE 'Asia/Seoul')::date AS event_date
  FROM public.gthr_mst g WHERE g.team_id = p_team_id AND g.del_yn = false
    AND ((p_direction = 'prev' AND (g.stt_at AT TIME ZONE 'Asia/Seoul')::date < p_cursor_date) OR
         (p_direction = 'next' AND (g.stt_at AT TIME ZONE 'Asia/Seoul')::date > p_cursor_date))
),
month_candidates AS (
  SELECT DISTINCT DATE_TRUNC('month', event_date)::date AS month_start
  FROM (SELECT event_date FROM sch_dates UNION SELECT event_date FROM comp_dates UNION SELECT event_date FROM gthr_dates) all_dates
),
target_months AS (
  (SELECT month_start FROM month_candidates WHERE p_direction = 'prev' ORDER BY month_start DESC LIMIT p_month_limit)
  UNION ALL
  (SELECT month_start FROM month_candidates WHERE p_direction = 'next' ORDER BY month_start ASC LIMIT p_month_limit)
),
date_range AS (
  SELECT MIN(month_start) AS range_start, (MAX(month_start) + interval '1 month' - interval '1 day')::date AS range_end FROM target_months
),
gthr_agg AS (
  SELECT g.gthr_id, COUNT(DISTINCT ar.attd_id) AS attd_count, COUNT(DISTINCT cm.cmnt_id) AS cmnt_count
  FROM public.gthr_mst g CROSS JOIN date_range
  LEFT JOIN public.gthr_attd_rel ar ON ar.gthr_id = g.gthr_id
  LEFT JOIN public.cmnt_mst cm ON cm.entity_type = 'gathering' AND cm.entity_id = g.gthr_id AND cm.del_yn = false
  WHERE g.team_id = p_team_id AND g.del_yn = false AND date_range.range_start IS NOT NULL
    AND g.stt_at >= (date_range.range_start::timestamptz AT TIME ZONE 'Asia/Seoul')
    AND g.stt_at <  ((date_range.range_end::timestamptz + interval '1 day') AT TIME ZONE 'Asia/Seoul')
  GROUP BY g.gthr_id
)
SELECT
  'sch_post'::text                                AS item_type,
  s.sch_post_id                                  AS item_id,
  s.sch_nm                                       AS item_nm,
  s.post_type                                    AS post_type,
  (s.evt_stt_at AT TIME ZONE 'Asia/Seoul')::date AS start_date,
  NULL::date                                     AS end_date,
  NULL::text                                     AS loc_nm,
  s.url                                          AS url,
  s.cont_txt                                     AS cont_txt,
  s.evt_stt_at                                   AS evt_stt_at,
  s.evt_end_at                                   AS evt_end_at,
  s.crt_by                                       AS crt_by,
  m.mem_nm                                       AS crt_by_nm,
  NULL::bigint                                   AS reg_count,
  COALESCE((SELECT count(*) FROM public.cmnt_mst cm WHERE cm.entity_type = 'sch_post' AND cm.entity_id = s.sch_post_id AND cm.del_yn = false), 0) AS cmnt_count,
  s.short_id                                     AS short_id
FROM public.sch_post_mst s CROSS JOIN date_range
LEFT JOIN public.mem_mst m ON m.mem_id = s.crt_by
WHERE s.team_id = p_team_id AND s.del_yn = false AND date_range.range_start IS NOT NULL
  AND (s.evt_stt_at AT TIME ZONE 'Asia/Seoul')::date BETWEEN date_range.range_start AND date_range.range_end
UNION ALL
SELECT
  CASE WHEN mr.team_comp_id IS NOT NULL THEN 'mine' ELSE 'comp' END, c.comp_id, c.comp_nm, NULL::text,
  c.stt_dt, c.end_dt, c.loc_nm, c.src_url, NULL::text, NULL::timestamptz, NULL::timestamptz, NULL::uuid, NULL::text,
  count(DISTINCT cr.comp_reg_id),
  COALESCE((SELECT count(*) FROM public.cmnt_mst cm WHERE cm.entity_type = 'comp' AND cm.entity_id = c.comp_id AND cm.del_yn = false), 0),
  NULL::text
FROM public.team_comp_plan_rel tcp
JOIN public.comp_mst c ON c.comp_id = tcp.comp_id AND c.vers = 0 AND c.del_yn = false
CROSS JOIN date_range
LEFT JOIN public.comp_reg_rel cr ON cr.team_comp_id = tcp.team_comp_id AND cr.vers = 0 AND cr.del_yn = false
LEFT JOIN my_regs mr ON mr.team_comp_id = tcp.team_comp_id
WHERE tcp.team_id = p_team_id AND tcp.vers = 0 AND tcp.del_yn = false AND date_range.range_start IS NOT NULL
  AND c.stt_dt BETWEEN date_range.range_start AND date_range.range_end
GROUP BY c.comp_id, c.comp_nm, c.stt_dt, c.end_dt, c.loc_nm, c.src_url, mr.team_comp_id
HAVING count(DISTINCT cr.comp_reg_id) > 0 OR mr.team_comp_id IS NOT NULL
UNION ALL
SELECT
  CASE WHEN ma.gthr_id IS NOT NULL THEN 'gathering_mine' ELSE 'gathering' END, g.gthr_id, g.gthr_nm, g.gthr_type_enm,
  (g.stt_at AT TIME ZONE 'Asia/Seoul')::date, NULL::date, g.loc_txt, NULL::text, g.desc_txt,
  g.stt_at, g.end_at, g.crt_by, m.mem_nm,
  COALESCE(ga.attd_count, 0), COALESCE(ga.cmnt_count, 0), g.short_id
FROM public.gthr_mst g CROSS JOIN date_range
LEFT JOIN public.mem_mst m ON m.mem_id = g.crt_by
LEFT JOIN my_attd ma ON ma.gthr_id = g.gthr_id
LEFT JOIN gthr_agg ga ON ga.gthr_id = g.gthr_id
WHERE g.team_id = p_team_id AND g.del_yn = false AND date_range.range_start IS NOT NULL
  AND g.stt_at >= (date_range.range_start::timestamptz AT TIME ZONE 'Asia/Seoul')
  AND g.stt_at <  ((date_range.range_end::timestamptz + interval '1 day') AT TIME ZONE 'Asia/Seoul')
ORDER BY start_date ASC;
$function$;

GRANT EXECUTE ON FUNCTION public.get_schedule_paged(uuid, text, date, uuid, int)
  TO anon, authenticated, service_role;

-- ── 6. noti_mst CHECK 제약: gthr 알림 타입 ──
-- prd엔 이미 gthr_new/upd/del/cmnt/reply/mention + fdbk 타입이 모두 있어 변경 불필요(검증 완료).
