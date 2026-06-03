import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/queries/member";
import { getNotifications } from "@/lib/queries/notification";
import { NotificationsClient } from "./notifications-client";

export const metadata = { title: "알림" };

export default async function NotificationsPage() {
  const { member } = await getCurrentMember();
  if (!member) redirect("/");

  const initialNotifications = await getNotifications(member.id, { limit: 20 });

  return (
    <NotificationsClient
      initialNotifications={initialNotifications}
      memberId={member.id}
    />
  );
}
