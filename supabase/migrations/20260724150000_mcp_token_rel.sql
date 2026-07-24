-- mcp_token_rel — 운영 MCP 개인 액세스 토큰(PAT) 저장소
--   기강 운영 MCP(app/api/mcp/[transport]/route.ts)의 Bearer 인증 원천.
--   토큰 원문은 절대 저장하지 않는다 — sha256(원문) 해시(token_hash)만 보관하고,
--   발급 화면(SG-03)에서 평문은 1회만 노출한다.
--
-- 설계 근거: docs/superpowers/specs/2026-07-24-gigang-ops-mcp-design.md §3.1
--   검증 흐름: token_hash 일치 & revoked_at is null & (expires_at is null or expires_at > now())
--   → team_mem_rel(vers=0, del_yn=false, mem_st_cd='active')로 팀 스코프 신원·권한 해석.
--
-- 보안: 이 테이블은 service_role 전용이다. RLS를 켜되 정책을 두지 않으므로
--   anon/authenticated 는 어떤 행도 볼 수 없고, service_role(서버 전용 관리자 클라이언트)만 접근한다.
--   토큰 해시는 자격증명이므로 클라이언트에 절대 노출되어선 안 된다.
SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS public.mcp_token_rel (
  token_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mem_id       uuid NOT NULL REFERENCES public.mem_mst (mem_id),
  team_id      uuid NOT NULL,
  token_hash   text NOT NULL UNIQUE,
  label        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  expires_at   timestamptz,
  revoked_at   timestamptz
);

COMMENT ON TABLE public.mcp_token_rel IS
  '운영 MCP 개인 액세스 토큰(PAT). token_hash=sha256(원문), 원문 미저장. service_role 전용(RLS on, 정책 없음).';
COMMENT ON COLUMN public.mcp_token_rel.token_hash IS 'sha256(원문 토큰) hex. 원문은 저장하지 않음';
COMMENT ON COLUMN public.mcp_token_rel.team_id IS '토큰 발급 시점의 팀. 모든 MCP 쿼리는 이 team_id로 스코프됨';
COMMENT ON COLUMN public.mcp_token_rel.expires_at IS 'null = 무기한';
COMMENT ON COLUMN public.mcp_token_rel.revoked_at IS '폐기 시각. not null 이면 검증 실패(401)';

-- 인증 핫패스: token_hash 조회. UNIQUE 제약이 btree 인덱스를 제공하므로 별도 인덱스 불필요.
-- 발급/폐기 UI(SG-03)의 "내 토큰 목록" 조회용 인덱스.
CREATE INDEX IF NOT EXISTS mcp_token_rel_mem_team_idx
  ON public.mcp_token_rel (mem_id, team_id);

-- service_role 전용: RLS 활성화 + 정책 없음 → anon/authenticated 전면 차단.
ALTER TABLE public.mcp_token_rel ENABLE ROW LEVEL SECURITY;
