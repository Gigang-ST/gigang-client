-- [이력 이관 #713] prd 에만 기록돼 있던 마이그레이션(prd 버전·이름 동일).
-- prd 에는 이미 적용됐다 — 다시 적용하지 않는다. 웹 푸시 구독 테이블(멱등). 한 멤버가 여러 기기를 구독할 수 있다.
SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS public.push_sub_rel (
  sub_id      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     uuid        NOT NULL REFERENCES public.team_mst(team_id) ON DELETE CASCADE,
  mem_id      uuid        NOT NULL REFERENCES public.mem_mst(mem_id)  ON DELETE CASCADE,
  endpoint    text        NOT NULL,
  p256dh      text        NOT NULL,
  auth        text        NOT NULL,
  user_agent  text,
  crt_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS push_sub_rel_endpoint_uk ON public.push_sub_rel (endpoint);
CREATE INDEX IF NOT EXISTS push_sub_rel_mem_idx ON public.push_sub_rel (mem_id);

ALTER TABLE public.push_sub_rel ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_sub_rel_select ON public.push_sub_rel;
CREATE POLICY push_sub_rel_select ON public.push_sub_rel
  FOR SELECT USING (mem_id = v2_rls_resolve_mem_id());

DROP POLICY IF EXISTS push_sub_rel_delete ON public.push_sub_rel;
CREATE POLICY push_sub_rel_delete ON public.push_sub_rel
  FOR DELETE USING (mem_id = v2_rls_resolve_mem_id());
