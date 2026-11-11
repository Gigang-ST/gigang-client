"use client";

import { useSyncExternalStore } from "react";

import { teamLogoForHost, type TeamLogo } from "@/lib/team-logo";

const noopSubscribe = () => () => {};

/**
 * 지금 브라우저 주소의 팀 로고(`lib/team-logo.ts`). **서버(미리 만든 껍데기)에선 null** — 그 자리를 비워 두고, 하이드레이션
 * 직후 브라우저에서 채운다. `useSyncExternalStore` 의 서버 값(null)과 브라우저 값이 갈려도 React 가 하이드레이션 뒤 다시
 * 그려 경고가 안 난다. 표의 같은 객체를 돌려주므로 매번 새 값으로 보이지 않는다(무한 렌더 없음).
 *
 * 로고 표와 파일을 나눈 이유: 표는 서버 코드(푸시 발송·구조화 데이터)도 읽는데, React 훅이 같은 파일에 있으면 빌드가 막힌다.
 */
export function useTeamLogo(): TeamLogo | null {
  return useSyncExternalStore(
    noopSubscribe,
    () => teamLogoForHost(window.location.host),
    () => null,
  );
}
