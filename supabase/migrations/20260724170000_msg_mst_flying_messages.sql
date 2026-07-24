-- 종이비행기 한마디 — 24시간 뒤 사라지는 한 줄 메시지(인스타 스토리 결)
--
-- **각오(pldg_mst)와 별개다.** 지금까지 비행기는 각오를 실어 날랐지만, 각오는 "1인 1개 ·
-- 만료 없음"이라 하루살이 규칙과 맞지 않는다(각오를 24시간마다 다시 쓰게 만들 이유가 없다).
-- 그래서 비행기가 실을 내용만 이 테이블로 떼어낸다:
--   각오  = 팻말 · 1인 1개 · 만료 없음 · pldg_mst  (그대로 둔다)
--   한마디 = 비행기 · 1인 N개 · 24시간 · msg_mst   (여기서 신설)
--
-- 만료는 **행을 지우지 않는다.** 화면에서 빼는 것과 데이터를 없애는 건 다른 일이라(del_yn
-- 소프트삭제와 같은 판단), 조회 시점에 crt_at으로 거를 뿐이다. 지난 한마디는 그대로 쌓인다.
--
-- 착륙장은 만들지 않는다 — 24시간이면 알아서 사라지니 "내려앉아 쌓이는 자리"가 필요 없다.
-- 그래서 float_at 같은 편성 컬럼도 두지 않는다(pldg_mst와 다른 점).

SET lock_timeout = '3s';

-- ─────────────────────────────────────────────
-- ① msg_mst — 비행기 한마디
-- ─────────────────────────────────────────────
-- 스키마·제약·RLS는 pldg_mst의 실제 dev 정의를 본떴다(같은 성격의 한 줄 글이라 규칙을
-- 새로 발명할 이유가 없다). 다른 점은 딱 둘: 1인 N개 허용, 그리고 24시간 만료.
CREATE TABLE IF NOT EXISTS public.msg_mst (
  msg_id  uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  mem_id  uuid not null,
  msg_txt text not null,
  del_yn  boolean not null default false,
  crt_at  timestamptz not null default now(),
  upd_at  timestamptz not null default now(),
  constraint ck_msg_mst_msg_txt_len check (char_length(msg_txt) >= 1 AND char_length(msg_txt) <= 40),
  constraint msg_mst_mem_id_fkey foreign key (mem_id) references public.mem_mst(mem_id),
  constraint msg_mst_team_id_fkey foreign key (team_id) references public.team_mst(team_id)
);

COMMENT ON TABLE public.msg_mst IS
  '종이비행기 한마디 — 작성 후 24시간만 지면에 뜨는 한 줄 메시지. 1인 여러 개 가능. 각오(pldg_mst)와 별개 데이터: 각오는 팻말·1인 1개·만료 없음. 만료분은 행을 지우지 않고 조회에서만 거른다(이력 보존).';
COMMENT ON COLUMN public.msg_mst.crt_at IS
  '작성 시각. 24시간 만료의 기준점 — 배너 카운트다운(24:00:00→0)도 이 값에서 계산한다.';

-- 조회 형태 그대로: team별 crt_at 최신순 + 살아있는 것만
CREATE INDEX IF NOT EXISTS ix_msg_mst_team_recent
  ON public.msg_mst (team_id, crt_at DESC)
  WHERE del_yn = false;

-- 내 한마디 찾기(수정·삭제)
CREATE INDEX IF NOT EXISTS ix_msg_mst_mem
  ON public.msg_mst (mem_id);

-- ─────────────────────────────────────────────
-- ② RLS — pldg_mst와 동일한 3정책
-- ─────────────────────────────────────────────
ALTER TABLE public.msg_mst ENABLE ROW LEVEL SECURITY;

-- 전광판은 비로그인도 본다(공개 지면) — 살아있는 행이면 누구나 SELECT
DROP POLICY IF EXISTS msg_mst_select ON public.msg_mst;
CREATE POLICY msg_mst_select ON public.msg_mst
  FOR SELECT USING (del_yn = false);

-- 쓰기는 본인 명의 + 그 팀 소속만. (활동 여부는 서버 액션의 withActive가 한 겹 더 본다 —
-- pldg_mst와 같은 경계다: RLS는 팀 소속까지, 활동 상태는 애플리케이션이.)
DROP POLICY IF EXISTS msg_mst_insert ON public.msg_mst;
CREATE POLICY msg_mst_insert ON public.msg_mst
  FOR INSERT WITH CHECK (
    mem_id = v2_rls_resolve_mem_id()
    AND v2_rls_auth_in_team(team_id)
    AND del_yn = false
  );

DROP POLICY IF EXISTS msg_mst_update ON public.msg_mst;
CREATE POLICY msg_mst_update ON public.msg_mst
  FOR UPDATE USING (mem_id = v2_rls_resolve_mem_id())
  WITH CHECK (mem_id = v2_rls_resolve_mem_id() AND v2_rls_auth_in_team(team_id));

-- ─────────────────────────────────────────────
-- ③ Realtime publication 등록
-- ─────────────────────────────────────────────
-- 누가 한마디를 날리면 열린 모든 화면의 하늘에 즉시 뜬다(pldg_mst·cmnt_mst와 같은 패턴).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public' AND tablename = 'msg_mst'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.msg_mst;
  END IF;
END
$$;

-- ─────────────────────────────────────────────
-- ④ get_team_messages — 24시간 이내만, crt_at 최신순
-- ─────────────────────────────────────────────
-- 클라이언트도 1초 타이머로 만료된 배너를 치우지만(페이지를 열어둔 채 만료 시각을 넘길 수
-- 있으므로), 서버가 먼저 걸러야 조회 상한이 만료분으로 채워지지 않는다. 둘 다 필요한 이유다.
--
-- pldg_mst와 달리 DISTINCT ON (mem_id)을 쓰지 않는다 — 한마디는 1인 N개가 규칙이라
-- 같은 사람이 여러 개 띄울 수 있어야 한다.
CREATE OR REPLACE FUNCTION public.get_team_messages(p_team_id uuid, p_limit integer DEFAULT 20)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'msg_id',     q.msg_id,
    'mem_id',     q.mem_id,
    'mem_nm',     q.mem_nm,
    'avatar_url', q.avatar_url,
    'msg_txt',    q.msg_txt,
    'crt_at',     q.crt_at
  ) ORDER BY q.crt_at DESC), '[]'::jsonb)
  FROM (
    SELECT m.msg_id, m.mem_id, mm.mem_nm, mm.avatar_url, m.msg_txt, m.crt_at
    FROM public.msg_mst m
    INNER JOIN public.mem_mst mm
      ON mm.mem_id = m.mem_id AND mm.vers = 0 AND mm.del_yn = false
    WHERE m.team_id = p_team_id
      AND m.del_yn = false
      -- 24시간 만료. now()는 STABLE이라 문 단위로 고정되고, timestamptz 비교라 시간대 안전하다
      AND m.crt_at > now() - interval '24 hours'
    ORDER BY m.crt_at DESC
    LIMIT GREATEST(p_limit, 1)
  ) q;
$function$;

COMMENT ON FUNCTION public.get_team_messages(uuid, integer) IS
  '종이비행기 한마디 — 작성 후 24시간 이내만, crt_at 최신순. 1인 N개(각오와 달리 사람당 1건으로 좁히지 않는다). 만료분은 행을 지우지 않고 조회에서만 거른다. 비로그인도 조회 가능(전광판 공개 정책).';

REVOKE ALL ON FUNCTION public.get_team_messages(uuid, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.get_team_messages(uuid, integer) TO anon, authenticated, service_role;
