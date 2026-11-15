import { redirect } from "next/navigation";

import { listMcpTokens } from "@/app/actions/mcp-token";
import { getCurrentMember } from "@/lib/queries/member";

import { McpTokensClient } from "./mcp-tokens-client";
import { getTeamCopy } from "@/lib/queries/team-copy";

export const metadata = { title: "MCP 토큰" };

export default async function McpTokensPage() {
  const { user, member } = await getCurrentMember();

  if (!user) redirect("/auth/login?next=/mcp-tokens");
  if (!member) redirect("/onboarding?next=/mcp-tokens");

  // 토큰 목록과 팀 문구(안내문의 크루 이름)를 함께 읽는다
  const [result, copy] = await Promise.all([listMcpTokens(), getTeamCopy()]);
  const initialTokens = result.ok ? result.tokens : [];

  return <McpTokensClient initialTokens={initialTokens} crewName={copy.crewName} />;
}
