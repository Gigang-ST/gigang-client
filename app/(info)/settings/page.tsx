import { getCurrentMember } from "@/lib/queries/member";
import { SettingsClient } from "@/components/settings/settings-client";

export default async function SettingsPage() {
  const { member } = await getCurrentMember();
  const isAdmin = member?.admin ?? false;

  return <SettingsClient isAdmin={isAdmin} />;
}
