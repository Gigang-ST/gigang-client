import { redirect } from "next/navigation";

/**
 * 옛 거래 내역 화면. Triage Inbox(`/admin/dues/inbox`)로 기능이 흡수됐다.
 * 북마크·외부 링크 호환을 위해 stub으로 남겨둔다.
 */
export default function DuesTransactionsRedirectPage() {
  redirect("/admin/dues/inbox");
}
