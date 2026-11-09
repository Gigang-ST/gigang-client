import { redirect } from "next/navigation";

import { verifyAdmin } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createUntypedAdminClient } from "@/lib/supabase/admin";
import { cfgStatus } from "@/lib/team-cfg/form";
import { resolveTeamCfgValue, TEAM_CFG_REGISTRY, type TeamCfgCd } from "@/lib/team-cfg/registry";

import { TeamSettingsClient, type TeamSettingItem } from "./team-settings-client";

export const metadata = { title: "팀 설정" };

/**
 * 관리자 「팀 설정」 — 이 팀의 팀 설정(`team_cfg`)을 보고 고친다.
 *
 * 목록은 **DB 행이 아니라 코드의 설정 사전**(`lib/team-cfg/registry.ts`)에서 나온다. 사전에 키를 더하면 모든 팀의
 * 이 화면에 저절로 올라오고, 항목마다 "이 팀 설정 / 기본값 / 설정 안 함"이 보여 무엇을 바꿀 수 있는지 알 수 있다.
 * 비밀값(`input.kind = "secret"`)은 지금 값을 브라우저로 내보내지 않는다 — 설정됐는지만 보여 준다.
 */
export default async function TeamSettingsPage() {
  const admin = await verifyAdmin();
  if (!admin) redirect("/admin");

  const { teamId } = await getRequestTeamContext();
  const db = createUntypedAdminClient();

  const [{ data: rows, error }, { data: teams }] = await Promise.all([
    db.from("team_cfg").select("cfg_cd, cfg_val_json").eq("team_id", teamId).eq("vers", 0).eq("del_yn", false),
    db.from("team_mst").select("team_cd, team_nm").neq("team_id", teamId),
  ]);
  if (error) console.error("[team-settings] 설정 조회 실패", error.message);

  const raw = new Map(((rows ?? []) as { cfg_cd: string; cfg_val_json: unknown }[]).map((r) => [r.cfg_cd, r.cfg_val_json]));

  const items: TeamSettingItem[] = (Object.keys(TEAM_CFG_REGISTRY) as TeamCfgCd[]).map((cd) => {
    const def = TEAM_CFG_REGISTRY[cd];
    const isSet = raw.has(cd);
    const secret = def.input.kind === "secret";
    return {
      cd,
      label: def.label,
      description: def.description,
      group: def.group,
      input: def.input,
      status: cfgStatus(isSet, def.default),
      // 비밀값은 값을 싣지 않는다. 나머지는 지금 동작하는 값(정했으면 그 값, 아니면 기본값)
      value: secret ? null : resolveTeamCfgValue(cd, isSet ? raw.get(cd) : undefined),
    };
  });

  const otherTeams = ((teams ?? []) as { team_cd: string; team_nm: string }[]).map((t) => ({
    teamCd: t.team_cd,
    teamNm: t.team_nm,
  }));

  return <TeamSettingsClient items={items} otherTeams={otherTeams} />;
}
