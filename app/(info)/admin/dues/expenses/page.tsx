import { redirect } from "next/navigation";

/**
 * 옛 지출 내역 화면. 잔액 원장(`/admin/dues`)으로 기능이 흡수됐다.
 * 북마크·외부 링크 호환을 위해 stub으로 남겨둔다.
 */
export default function DuesExpensesRedirectPage() {
  redirect("/admin/dues");
}
