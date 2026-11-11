import { getRequestTeamContext } from "@/lib/queries/request-team";
import { getTeamCopy } from "@/lib/queries/team-copy";
import { teamLogoFor } from "@/lib/team-logo";

import { BottomTabBar } from "@/components/bottom-tab-bar";

/**
 * 하단 탭바 — 요청 때 그리는 판(`(main)` 레이아웃의 Suspense 안). 서버가 팀을 아니 가운데 로고 탭의 **화면낭독 이름(크루 이름)**
 * 과 **로고 마스크**를 채워 그린다. 기다리는 동안은 껍데기의 같은 탭바(이름 「홈」, 로고는 브라우저 주소로)가 서 있다.
 * 팀을 못 읽으면 껍데기 탭바 그대로. (이름만 try 안에서 읽고 그리기는 밖에서 한다 — try 안의 JSX 는 렌더 오류를 못 잡는다)
 */
export async function BottomTabBarGate() {
  let logoLabel: string | undefined;
  let logoMark: string | undefined;
  try {
    const [{ teamCd }, copy] = await Promise.all([getRequestTeamContext(), getTeamCopy()]);
    logoLabel = copy.crewName;
    logoMark = teamLogoFor(teamCd)?.mark;
  } catch {
    logoLabel = undefined;
    logoMark = undefined;
  }
  return <BottomTabBar logoLabel={logoLabel} logoMark={logoMark} />;
}
