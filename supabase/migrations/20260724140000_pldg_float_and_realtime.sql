-- 각오 하늘 공유 — 떠 있는 비행기를 모두가 함께 본다(실시간)
--   ① pldg_mst.float_at — "언제 하늘에 떠올랐나". 새 각오·이륙한 각오가 이 값으로 앞에 선다
--   ② supabase_realtime 등록 — 누가 띄우면 열린 모든 화면이 즉시 반영(알림·댓글과 같은 패턴)
--   ③ get_team_pledges — 각오 전용 조회 RPC(사람당 1건, float_at 최신순).
--      get_team_story_feed(이미 CTE 10개+)를 건드리지 않으려고 분리한다 — 띄우기가 그 큰
--      피드 캐시를 무효화하지 않게(연타돼도 각오 슬라이스만 갱신). record_flex와 같은 결.

-- ─────────────────────────────────────────────
-- ① float_at
-- ─────────────────────────────────────────────
ALTER TABLE public.pldg_mst
  ADD COLUMN IF NOT EXISTS float_at timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN public.pldg_mst.float_at IS
  '하늘에 떠오른 시각. 작성 시 crt_at과 같고, 착륙장에서 다시 띄우면 now()로 갱신된다. 하늘 정렬·"떠있은 시간" 표시의 근거.';

-- 기존 행은 작성 시각을 그대로 떠오른 시각으로 본다(백필)
UPDATE public.pldg_mst SET float_at = crt_at WHERE float_at IS NULL OR float_at = now();

-- 하늘 정렬용 — team별 float_at 최신순으로 긁는다
CREATE INDEX IF NOT EXISTS ix_pldg_mst_team_float
  ON public.pldg_mst (team_id, float_at DESC)
  WHERE del_yn = false;

-- ─────────────────────────────────────────────
-- ② Realtime publication 등록
-- ─────────────────────────────────────────────
-- 이미 등록돼 있으면(재실행) 무시. cmnt_mst/noti_mst와 동일하게 supabase_realtime에 얹는다.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public' AND tablename = 'pldg_mst'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pldg_mst;
  END IF;
END
$$;

-- ─────────────────────────────────────────────
-- ③ get_team_pledges — 각오 전용 조회
-- ─────────────────────────────────────────────
-- 사람당 1건(최신 float_at)으로 좁혀 반환한다 — createPledge가 이전 각오를 소프트삭제해
-- 보통 1건이지만, 정리가 밀려 두 건이 살아 있어도 하늘/착륙장에 한 번만 서게 DB가 보장한다.
CREATE OR REPLACE FUNCTION public.get_team_pledges(p_team_id uuid, p_limit integer DEFAULT 20)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'pldg_id',    q.pldg_id,
    'mem_id',     q.mem_id,
    'mem_nm',     q.mem_nm,
    'avatar_url', q.avatar_url,
    'pldg_txt',   q.pldg_txt,
    'crt_at',     q.crt_at,
    'float_at',   q.float_at
  ) ORDER BY q.float_at DESC, q.crt_at DESC), '[]'::jsonb)
  FROM (
    SELECT DISTINCT ON (p.mem_id)
           p.pldg_id, p.mem_id, mm.mem_nm, mm.avatar_url, p.pldg_txt, p.crt_at, p.float_at
    FROM public.pldg_mst p
    INNER JOIN public.mem_mst mm
      ON mm.mem_id = p.mem_id AND mm.vers = 0 AND mm.del_yn = false
    WHERE p.team_id = p_team_id AND p.del_yn = false
    ORDER BY p.mem_id, p.float_at DESC, p.crt_at DESC
    LIMIT GREATEST(p_limit, 1)
  ) q;
$function$;

COMMENT ON FUNCTION public.get_team_pledges(uuid, integer) IS
  '전광판 각오 — 사람당 1건(최신 float_at), float_at 최신순. 비로그인도 조회 가능(전광판 공개 정책).';

REVOKE ALL ON FUNCTION public.get_team_pledges(uuid, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.get_team_pledges(uuid, integer) TO anon, authenticated, service_role;
