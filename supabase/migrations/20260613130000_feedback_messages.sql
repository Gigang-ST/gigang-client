-- feedback_messages: 사용자 의견 수집 테이블
CREATE TABLE IF NOT EXISTS public.feedback_messages (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES mem_mst(mem_id) ON DELETE CASCADE,
  body         text        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  status       text        NOT NULL DEFAULT 'open'
                           CHECK (status IN ('open', 'in_review', 'done')),
  admin_note   text        CHECK (char_length(admin_note) <= 2000),
  responded_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  upd_at       timestamptz NOT NULL DEFAULT now(),
  vers         integer     NOT NULL DEFAULT 0,
  del_yn       boolean     NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_feedback_messages_created
  ON public.feedback_messages (user_id, created_at DESC)
  WHERE del_yn = false;

CREATE TRIGGER feedback_messages_set_upd_at
  BEFORE UPDATE ON public.feedback_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.set_v2_upd_at();

ALTER TABLE public.feedback_messages ENABLE ROW LEVEL SECURITY;

-- 본인 행만 조회 (관리자 조회는 createUntypedAdminClient로 우회)
CREATE POLICY feedback_messages_select_own ON public.feedback_messages
  FOR SELECT TO authenticated
  USING (user_id = public.v2_rls_resolve_mem_id());

-- 본인 이름으로만 삽입
CREATE POLICY feedback_messages_insert_self ON public.feedback_messages
  FOR INSERT TO authenticated
  WITH CHECK (user_id = public.v2_rls_resolve_mem_id());
