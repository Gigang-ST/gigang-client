import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/queries/member";
import { BankInfoForm } from "@/components/profile/bank-info-form";

export default async function BankInfoPage() {
  const { user, member } = await getCurrentMember();

  if (!user) redirect("/auth/login");
  if (!member) redirect("/onboarding");

  return (
    <BankInfoForm
      member={{
        id: member.id,
        full_name: member.full_name,
        bank_name: member.bank_name ?? "",
        bank_account: member.bank_account ?? "",
      }}
    />
  );
}
