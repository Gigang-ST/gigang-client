import { redirect } from "next/navigation";

export default function DuesMembersRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  void searchParams;
  redirect("/admin/dues/transactions?tab=balance");
}
