import { redirect } from "next/navigation";

// FAB 다이얼로그로 전환됨 — 직접 접근 시 홈으로 리다이렉트
export default function GatheringNewPage() {
  redirect("/");
}
