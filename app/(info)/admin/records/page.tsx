import { redirect } from "next/navigation";

import { duplicateNames } from "@/lib/dues/homonyms";
import { getCachedCmmCdRows } from "@/lib/queries/cmm-cd-cached";
import { getCurrentMember } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

import type { MemberStatus } from "@/components/races/types";

import { RecordsClient, type RecordMemberOption } from "./records-client";

/**
 * 기록 등록에 고를 수 있는 회원 — 이 팀의 **활동 중(active)** 회원만, 이름순.
 * 비활성·탈퇴는 고를 수 없다(`adminSaveRaceRecord` 가 서버에서도 같은 기준으로 막는다).
 * 팀 전체라 시간이 갈수록 늘므로 끝까지 읽는다.
 */
async function getRecordMemberOptions(teamId: string): Promise<RecordMemberOption[]> {
  const db = createAdminClient();
  const rels = await fetchAllRows(
    () =>
      db
        .from("team_mem_rel")
        .select("team_mem_id, mem_id")
        .eq("team_id", teamId)
        .eq("mem_st_cd", "active")
        .eq("vers", 0)
        .eq("del_yn", false)
        .order("team_mem_id"),
    { label: "admin-records:team_mem_rel" },
  );
  const memIds = rels.map((r) => r.mem_id);
  if (memIds.length === 0) return [];
  const mems = await fetchAllRows(
    () =>
      db
        .from("mem_mst")
        .select("mem_id, mem_nm, birth_dt")
        .eq("vers", 0)
        .eq("del_yn", false)
        .in("mem_id", memIds)
        .order("mem_id"),
    { label: "admin-records:mem_mst" },
  );

  // 생년월일은 동명이인 구분에만 쓴다 — 동명이인일 때만 내려보낸다(회비 인박스와 같은 규칙)
  const dupNames = duplicateNames(mems.map((m) => ({ name: m.mem_nm })));
  return mems
    .map((m) => ({
      memId: m.mem_id,
      name: m.mem_nm,
      birthDt: dupNames.has(m.mem_nm) ? m.birth_dt : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

export default async function RecordsPage() {
  const { user, member } = await getCurrentMember();
  if (!user || !member) redirect("/auth/login");

  const { teamId } = await getRequestTeamContext();
  const [members, cmmCdRows] = await Promise.all([
    getRecordMemberOptions(teamId),
    getCachedCmmCdRows(),
  ]);

  // 「대회 추가」는 관리자 본인 이름으로 대회를 만든다 — 기록 주인이 아니라 지금 누르는 사람
  const registrantStatus: MemberStatus = {
    status: "ready",
    userId: user.id,
    memberId: member.id,
    fullName: member.full_name,
    email: user.email ?? null,
    admin: member.admin,
  };

  return (
    <RecordsClient
      teamId={teamId}
      members={members}
      cmmCdRows={cmmCdRows}
      registrantStatus={registrantStatus}
    />
  );
}
