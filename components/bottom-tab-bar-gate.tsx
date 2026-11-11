import { getTeamCopy } from "@/lib/queries/team-copy";

import { BottomTabBar } from "@/components/bottom-tab-bar";

/**
 * 하단 탭바 — 가운데 로고 탭의 화면낭독 이름을 크루 이름으로 채워 그린다(`(main)` 레이아웃의 Suspense 안).
 * 기다리는 동안은 같은 탭바(이름 「홈」)가 껍데기에 서 있어 화면이 튀지 않는다. 팀을 못 읽으면 그 탭바 그대로.
 * (이름만 try 안에서 읽고 그리기는 밖에서 한다 — try 안의 JSX 는 렌더 오류를 못 잡는다)
 */
export async function BottomTabBarGate() {
  let logoLabel: string | undefined;
  try {
    logoLabel = (await getTeamCopy()).crewName;
  } catch {
    logoLabel = undefined;
  }
  return <BottomTabBar logoLabel={logoLabel} />;
}
