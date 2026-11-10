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

  const result = await listMcpTokens();
  const initialTokens = result.ok ? result.tokens : [];

  const { crewName } = await getTeamCopy();
  return <McpTokensClient initialTokens={initialTokens} crewName={crewName} />;
}
