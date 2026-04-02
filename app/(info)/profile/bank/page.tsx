import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/queries/member";
import { BankInfoForm } from "@/components/profile/bank-info-form";
import { BANK_OPTIONS } from "@/lib/constants";

export default async function BankInfoPage() {
  const { user, member } = await getCurrentMember();
  if (!user) redirect("/auth/login");
  if (!member) redirect("/onboarding");

  const savedBank = member.bank_name ?? "";
  const isCustomBank =
    savedBank !== "" &&
    !BANK_OPTIONS.includes(savedBank as (typeof BANK_OPTIONS)[number]);

  return (
    <BankInfoForm
      member={{
        id: member.id,
        fullName: member.full_name ?? "",
        bankName: isCustomBank ? "custom" : savedBank,
        bankNameCustom: isCustomBank ? savedBank : "",
        bankAccount: member.bank_account ?? "",
      }}
    />
  );
}
