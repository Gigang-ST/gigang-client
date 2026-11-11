import { getTeamCopy } from "@/lib/queries/team-copy";

import { BottomTabBar } from "@/components/bottom-tab-bar";

/**
 * 하단 탭바 — 요청 때 그리는 판(`(main)` 레이아웃의 Suspense 안). 가운데 로고 탭의 **화면낭독 이름**을 크루 이름으로 채운다.
 * 로고 그림은 여기서 안 다룬다 — 그리기 전 스크립트 + CSS 변수가 껍데기 탭바부터 이미 그 팀 로고로 그린다(§components/bottom-tab-bar).
 * 기다리는 동안은 껍데기의 같은 탭바(이름 「홈」)가 서 있다. 팀 문구를 못 읽으면 그 탭바 그대로.
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
