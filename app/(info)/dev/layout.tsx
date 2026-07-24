import { notFound } from "next/navigation";

import { isDevModeEnabled } from "@/lib/dev-mode";

/**
 * `/dev/*`는 시안 비교·이펙트 목업 등 개발 전용 지면이다. 운영에서 도달하면 안 되므로
 * 라우트 그룹 레이아웃에서 한 번에 가둔다 — 페이지마다 게이트를 붙이지 않기 위해서.
 * 개발 모드가 꺼져 있으면 404로 떨군다.
 *
 * force-dynamic 필수: isDevModeEnabled()는 cookies()/headers() 등 동적 API를 쓰지 않아
 * cacheComponents 아래에서는 빌드 타임에 정적으로 프리렌더된다. 그러면 그 시점의
 * true/false가 정적 HTML(또는 정적 404)로 굳어져, 배포 후 환경변수를 바꿔도 재배포
 * 전까지 절대 안 바뀐다 — 개발계에서 링크는 보이는데 실제 페이지는 영구 404인 버그로 나타남.
 */
export const dynamic = "force-dynamic";

export default function DevLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isDevModeEnabled()) notFound();
  return children;
}
