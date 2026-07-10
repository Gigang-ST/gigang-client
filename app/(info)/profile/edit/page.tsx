import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/queries/member";
import { getNearStation } from "@/lib/queries/onboarding-profile";
import { ProfileEditForm } from "@/components/profile/profile-edit-form";

export default async function ProfileEditPage() {
  const { user, member } = await getCurrentMember();

  if (!user) redirect("/auth/login");
  if (!member) redirect("/onboarding");

  const nearStnNm = await getNearStation(member.id);

  return (
    // key를 매 진입(서버 렌더)마다 새로 부여해 폼을 새로 mount 시킨다.
    // Next App Router는 재진입 시 클라이언트 컴포넌트 인스턴스를 재사용하므로
    // (useState·RHF defaultValues 초기화가 다시 돌지 않음) 저장하지 않은 편집값이
    // 그대로 남는다. key가 바뀌면 React가 인스턴스를 버리고 항상 신선한 member로 초기화한다.
    <ProfileEditForm
      key={crypto.randomUUID()}
      member={{
        id: member.id,
        full_name: member.full_name,
        gender: member.gender,
        birthday: member.birthday,
        phone: member.phone,
        email: member.email,
        avatar_url: member.avatar_url,
      }}
      initialNearStnNm={nearStnNm}
    />
  );
}
