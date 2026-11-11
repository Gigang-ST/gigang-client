import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/queries/member";
import { getNotifications } from "@/lib/queries/notification";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { NotificationsClient } from "./notifications-client";

export const metadata = { title: "알림" };

export default async function NotificationsPage() {
  const { member } = await getCurrentMember();
  if (!member) redirect("/");

  const { teamId } = await getRequestTeamContext();
  const initialNotifications = await getNotifications(member.id, teamId, { limit: 20 });

  return (
    <NotificationsClient
      initialNotifications={initialNotifications}
      memberId={member.id}
    />
  );
}
