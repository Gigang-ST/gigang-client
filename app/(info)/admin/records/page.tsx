import { redirect } from "next/navigation";

import { dayjs } from "@/lib/dayjs";
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
        .select("team_mem_id, mem_id, join_dt")
        .eq("team_id", teamId)
        .eq("mem_st_cd", "active")
        .eq("vers", 0)
        .eq("del_yn", false)
        .order("team_mem_id"),
    { label: "admin-records:team_mem_rel" },
  );
  const memIds = rels.map((r) => r.mem_id);
  const joinById = new Map(rels.map((r) => [r.mem_id, r.join_dt]));
  if (memIds.length === 0) return [];
  const mems = await fetchAllRows(
    () =>
      db
        .from("mem_mst")
        .select("mem_id, mem_nm, birth_dt, phone_no")
        .eq("vers", 0)
        .eq("del_yn", false)
        .in("mem_id", memIds)
        .order("mem_id"),
    { label: "admin-records:mem_mst" },
  );

  // 동명이인은 **이름만으로** 판정하고, 가를 값은 있는 것부터 붙인다 — 생년월일 → 가입일 →
  // 휴대폰 뒷자리. 생년월일 유무로 동명이인을 판정하면 둘 다 비어 있을 때 같은 이름 두 줄이
  // 떠서 다른 사람에게 기록이 들어간다. 구분 값은 동명이인에게만 붙인다(개인정보 최소 노출).
  const dupNames = duplicateNames(mems.map((m) => ({ name: m.mem_nm })));
  const hintOf = (m: (typeof mems)[number]): string => {
    if (m.birth_dt) return dayjs(m.birth_dt).format("YY.MM.DD");
    const joinDt = joinById.get(m.mem_id);
    if (joinDt) return `가입 ${dayjs(joinDt).format("YY.MM.DD")}`;
    const digits = (m.phone_no ?? "").replace(/\D/g, "");
    return digits.length >= 4 ? `휴대폰 ${digits.slice(-4)}` : m.mem_id.slice(0, 8);
  };
  return mems
    .map((m) => ({
      memId: m.mem_id,
      name: m.mem_nm,
      label: dupNames.has(m.mem_nm) ? `${m.mem_nm} (${hintOf(m)})` : m.mem_nm,
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
