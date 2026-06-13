-- feedback_messages: 사용자 의견 수집 테이블
CREATE TABLE IF NOT EXISTS public.feedback_messages (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES mem_mst(mem_id) ON DELETE CASCADE,
  body         text        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  status       text        NOT NULL DEFAULT 'open'
                           CHECK (status IN ('open', 'in_review', 'done')),
  admin_note   text        CHECK (char_length(admin_note) <= 2000),
  responded_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feedback_messages_created_idx
  ON public.feedback_messages (created_at DESC);

ALTER TABLE public.feedback_messages ENABLE ROW LEVEL SECURITY;

-- 본인 행만 조회 (관리자 조회는 createUntypedAdminClient로 우회)
CREATE POLICY feedback_self_select ON public.feedback_messages
  FOR SELECT TO authenticated
  USING (user_id = public.v2_rls_resolve_mem_id());

-- 본인 이름으로만 삽입
CREATE POLICY feedback_self_insert ON public.feedback_messages
  FOR INSERT TO authenticated
  WITH CHECK (user_id = public.v2_rls_resolve_mem_id());
