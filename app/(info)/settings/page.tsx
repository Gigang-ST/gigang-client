import { hasUnreadBoardPosts } from "@/lib/queries/board";
import { getCurrentMember } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { SettingsClient } from "@/components/settings/settings-client";

export default async function SettingsPage() {
  const { member } = await getCurrentMember();
  const { teamId } = await getRequestTeamContext();
  const isAdmin = member?.admin ?? false;

  // 공지·업데이트 안읽음 — 게시판 아이콘을 걷어내면서 그 안읽음 dot이 이 화면으로 왔다.
  // 우상단(햄버거)엔 배지를 안 달고, 여기 각 메뉴 옆에만 점을 찍는다("뭘 봐야 하는지"를
  // 대상 옆에서 가리키게).
  const boardUnread = await hasUnreadBoardPosts(member?.id, teamId);

  return <SettingsClient isAdmin={isAdmin} boardUnread={boardUnread} />;
}
