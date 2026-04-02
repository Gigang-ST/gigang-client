import { getCurrentMember } from "@/lib/queries/member";
import { SettingsContent } from "@/components/settings/settings-content";

export default async function SettingsPage() {
  const { member } = await getCurrentMember();
  return <SettingsContent isAdmin={member?.admin ?? false} />;
}
