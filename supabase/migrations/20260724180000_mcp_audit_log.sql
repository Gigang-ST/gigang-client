-- mcp_audit_log — 운영 MCP write 도구 감사 로그
--   기강 운영 MCP(app/api/mcp/[transport]/route.ts)의 쓰기 도구(send_push)가
--   성공적으로 발송할 때마다 정확히 1행을 남긴다(스펙 §8 / AC-18).
--   "누가(actor_mem_id) 어느 팀(team_id)에서 어떤 도구(tool_nm)를 어떤 파라미터로
--   실행해 어떤 결과(result_summary)를 냈는지"의 사후 추적 원장.
--
-- 설계 근거: docs/superpowers/specs/2026-07-24-gigang-ops-mcp-design.md §8
--
-- 보안: 이 테이블은 service_role 전용이다. RLS를 켜되 정책을 두지 않으므로
--   anon/authenticated 는 어떤 행도 볼 수 없고, service_role(서버 전용 관리자 클라이언트)만 접근한다.
--   params_json 에는 연락처·계좌 등 민감정보(phone_no·email_addr·bank_nm·bank_acct_no)를
--   절대 담지 않는다 — 발송 제목·본문·수신자 mem_id 목록만 기록(M-03 불변식과 정합).
SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS public.mcp_audit_log (
  audit_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_mem_id   uuid NOT NULL REFERENCES public.mem_mst (mem_id),
  team_id        uuid NOT NULL,
  tool_nm        text NOT NULL,
  params_json    jsonb,
  result_summary text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.mcp_audit_log IS
  '운영 MCP write 도구 감사 로그. send_push 성공 시 1행. service_role 전용(RLS on, 정책 없음). params_json 에 민감정보 미포함.';
COMMENT ON COLUMN public.mcp_audit_log.actor_mem_id IS '도구를 실행한 운영자 mem_id(토큰 소유자)';
COMMENT ON COLUMN public.mcp_audit_log.team_id IS '실행 시점 팀 스코프. 모든 MCP 도구는 이 team_id로 스코프됨';
COMMENT ON COLUMN public.mcp_audit_log.tool_nm IS '실행된 도구 이름(예: send_push)';
COMMENT ON COLUMN public.mcp_audit_log.params_json IS '실행 파라미터(민감정보 마스킹). send_push: title·message·수신자 mem_id 목록';

-- 팀별 최근 감사 이력 조회용.
CREATE INDEX IF NOT EXISTS mcp_audit_log_team_created_idx
  ON public.mcp_audit_log (team_id, created_at DESC);
-- 특정 운영자 활동 추적용.
CREATE INDEX IF NOT EXISTS mcp_audit_log_actor_idx
  ON public.mcp_audit_log (actor_mem_id);

-- service_role 전용: RLS 활성화 + 정책 없음 → anon/authenticated 전면 차단.
ALTER TABLE public.mcp_audit_log ENABLE ROW LEVEL SECURITY;
