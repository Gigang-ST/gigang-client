import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/queries/member";
import { ProfileEditForm } from "@/components/profile/profile-edit-form";

export default async function ProfileEditPage() {
  const { user, member } = await getCurrentMember();

  if (!user) redirect("/auth/login");
  if (!member) redirect("/onboarding");

  return (
    <ProfileEditForm
      member={{
        id: member.id,
        full_name: member.full_name,
        gender: member.gender,
        birthday: member.birthday,
        phone: member.phone,
        email: member.email,
        avatar_url: member.avatar_url,
      }}
    />
  );
}
