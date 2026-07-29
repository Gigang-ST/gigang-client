import { hasUnreadBoardPosts } from "@/lib/queries/board";
import { getCurrentMember } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { SettingsClient } from "@/components/settings/settings-client";

export default async function SettingsPage() {
  const { member, supabase } = await getCurrentMember();
  const { teamId } = await getRequestTeamContext();
  const isAdmin = member?.admin ?? false;

  // 공지·업데이트 안읽음 — 게시판 아이콘을 걷어내면서 그 안읽음 dot이 이 화면으로 왔다.
  // 우상단(햄버거)엔 배지를 안 달고, 여기 각 메뉴 옆에만 점을 찍는다("뭘 봐야 하는지"를
  // 대상 옆에서 가리키게).
  //
  // 회비 미납 dot도 같은 이유로 여기 왔다 — 프로필탭의 바로가기 4버튼이 사라지면서
  // 그 점이 갈 곳이 없어졌다. **잔액 스냅샷을 읽기만 한다**(회비 계산 로직은 손대지 않음).
  const [boardUnread, { data: balSnap }] = await Promise.all([
    hasUnreadBoardPosts(member?.id, teamId),
    member
      ? supabase
          .from("fee_mem_bal_snap")
          .select("bal_amt")
          .eq("team_id", teamId)
          .eq("mem_id", member.id)
          .eq("vers", 0)
          .eq("del_yn", false)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return (
    <SettingsClient
      isAdmin={isAdmin}
      boardUnread={boardUnread}
      duesUnpaid={(balSnap?.bal_amt ?? 0) < 0}
    />
  );
}
