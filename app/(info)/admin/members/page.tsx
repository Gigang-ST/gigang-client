import { PARTICIPATION_DATA_EPOCH } from "@/lib/constants/participation";
import { dayjs } from "@/lib/dayjs";
import { getCachedCmmCdRows } from "@/lib/queries/cmm-cd-cached";
import { getCurrentMember } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { getTeamCfg } from "@/lib/team-cfg/read";
import { AdminMembersClient } from "./admin-members-client";

/**
 * 참여 탭 「전체」 기간의 시작일 — 이 팀의 **첫 모임이 열린 달**, 단 모임 데이터 실질 시작일
 * (`PARTICIPATION_DATA_EPOCH`, 기강 기준 7월)보다 앞서지 않는다. 모임이 아직 없으면 팀이 만들어진 달.
 *
 * 예전엔 7월로 고정이라 늦게 시작한 팀(울산)에서 「전체 (7월~)」가 거짓말을 했다.
 * 조회가 실패하면 기존 시작일로 물러난다 — 라벨 하나 때문에 화면을 막지 않는다.
 */
async function getParticipationDataStart(
  supabase: Awaited<ReturnType<typeof getCurrentMember>>["supabase"],
  teamId: string,
): Promise<string> {
  const [{ data: firstGthr }, { data: team }] = await Promise.all([
    supabase
      .from("gthr_mst")
      .select("stt_at")
      .eq("team_id", teamId)
      .eq("del_yn", false)
      .order("stt_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase.from("team_mst").select("crt_at").eq("team_id", teamId).eq("vers", 0).maybeSingle(),
  ]);
  const startAt = firstGthr?.stt_at ?? team?.crt_at;
  if (!startAt) return PARTICIPATION_DATA_EPOCH;
  // timestamptz → KST 달의 1일
  const month = dayjs(startAt).tz("Asia/Seoul").startOf("month").format("YYYY-MM-DD");
  return month > PARTICIPATION_DATA_EPOCH ? month : PARTICIPATION_DATA_EPOCH;
}

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ member?: string | string[] }>;
}) {
  const { teamId } = await getRequestTeamContext();
  const { member: viewer, supabase } = await getCurrentMember();
  const { member } = await searchParams;
  const initialTeamMemId = Array.isArray(member) ? member[0] : member;
  // 회비를 안 쓰는 팀(울산)은 회비잔액 열·잔액 처리를 그리지 않는다
  // 칭호 기능을 끈 팀은 멤버 상세의 칭호 수여 칸을 그리지 않는다
  // 러닝 프로필을 안 쓰는 팀(모비)은 멤버 상세의 역·거리·페이스를 그리지 않는다(가입 정보만)
  const [duesEnabled, titlesEnabled, runningProfileEnabled, cmmCdRows, participationDataStart] = await Promise.all([
    getTeamCfg(teamId, "feature.dues"),
    getTeamCfg(teamId, "feature.titles"),
    getTeamCfg(teamId, "feature.running_profile"),
    // 대회 신청 줄의 스포츠 이름(「트라이애슬론 · FULL」) — 기록관리(#673)와 같은 표기
    getCachedCmmCdRows(),
    getParticipationDataStart(supabase, teamId),
  ]);
  return (
    <AdminMembersClient
      teamId={teamId}
      initialTeamMemId={initialTeamMemId}
      duesEnabled={duesEnabled}
      titlesEnabled={titlesEnabled}
      runningProfileEnabled={runningProfileEnabled}
      viewer={{ memId: viewer?.id ?? "", isOwner: viewer?.owner ?? false }}
      cmmCdRows={cmmCdRows}
      participationDataStart={participationDataStart}
    />
  );
}
