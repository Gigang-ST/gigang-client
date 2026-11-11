import { resolveTeamCdFromHost } from "@/lib/team-host";

/**
 * 팀 로고 — **순수 데이터**(서버 코드도 읽는다 — 푸시·구조화 데이터). 브라우저 훅은 `lib/use-team-logo.ts` 로 따로 뒀다
 * (React 훅을 같이 두면 이 표를 쓰는 서버 코드가 빌드에서 막힌다).
 *
 * **화면 안** 로고(하단 탭바 가운데·홈 로딩 화면·로그인 화면)가 쓰는 그림. 브라우저에서도 읽는 작은 표라
 * 서버 전용 모듈(`lib/team-site.ts` — llms.txt 본문 등 큰 값이 있다)과 나눠 둔다. 구조화 데이터의 `logo` 도 이 표를 본다.
 *
 * 2026-11-11 전에는 세 자리가 `/logo.webp`·`/logo-mark.png` 고정이라 울산(모보브) 화면에도 기강 로고가 떴다.
 *
 * ## 왜 브라우저에서 고르나
 * 세 자리 모두 **미리 만들어 두는 껍데기(정적 셸)** 에 있다 — 빌드 때 한 번 그려 모든 주소에 같은 HTML 을 보낸다. 그 시점엔
 * 어느 팀 주소로 올지 몰라 서버가 로고를 못 고른다. 그래서 껍데기에선 로고 자리를 **비워 두고**, 브라우저가 페이지를 이어받는
 * 순간 주소(`location.host`)로 팀을 판정해 그린다(`useTeamLogo` — `lib/use-team-logo.ts`). 전체 로딩 시간은 그대로다 — 처음 열거나 새로고침할 때
 * 로고만 잠깐 늦게 나타난다(앱 안에서 탭을 옮길 땐 탭바가 그대로 남아 다시 안 그린다).
 * 기본값을 기강 로고로 두지 않는 이유: 그러면 울산에서 기강 로고가 잠깐 보였다가 바뀐다.
 *
 * 새 팀 = 이 표 한 줄 + `public/teams/<팀코드>/` 그림(`docs/new-team-checklist.md`).
 */

export type TeamLogo = {
  /** 로고 원본 — 검정 + 투명 배경(다크 모드는 화면이 `dark:invert` 로 뒤집는다) */
  logo: string;
  /** 탭바 마스크용 실루엣 — 투명 배경 위 모양(알파)만 쓰고 색은 탭 색(`bg-current`)으로 칠한다 */
  mark: string;
  /** 그림 설명(alt) — 크루 이름 */
  alt: string;
};

export const TEAM_LOGO: Readonly<Record<string, TeamLogo>> = {
  gigang: { logo: "/logo.webp", mark: "/logo-mark.png", alt: "기강" },
  // 임시 로고(TEAM MOVOF ULSAN 배지) — 진짜 로고가 오면 이 파일만 바꾼다. 원본이 검정 + 투명이라 마스크로도 그대로 쓴다
  ulsan: { logo: "/teams/ulsan/logo.png", mark: "/teams/ulsan/logo.png", alt: "모보브" },
};

export function teamLogoFor(teamCd: string): TeamLogo | null {
  return TEAM_LOGO[teamCd] ?? null;
}

/** 접속 주소 → 팀 로고. 표에 없는 팀·주소면 null(다른 팀 로고로 물러나지 않는다) */
export function teamLogoForHost(host: string | null | undefined): TeamLogo | null {
  const teamCd = resolveTeamCdFromHost(host);
  return teamCd ? teamLogoFor(teamCd) : null;
}
