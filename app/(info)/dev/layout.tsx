import { notFound } from "next/navigation";

import { isDevModeEnabled } from "@/lib/dev-mode";

/**
 * `/dev/*`는 시안 비교·이펙트 목업 등 개발 전용 지면이다. 운영에서 도달하면 안 되므로
 * 라우트 그룹 레이아웃에서 한 번에 가둔다 — 페이지마다 게이트를 붙이지 않기 위해서.
 * 개발 모드가 꺼져 있으면 404로 떨군다.
 */
export default function DevLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isDevModeEnabled()) notFound();
  return children;
}
