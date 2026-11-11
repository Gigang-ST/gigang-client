import { resolveTeamCdFromHost } from "@/lib/team-host";

/**
 * 팀 로고 — **화면 안** 로고(하단 탭바 가운데·홈 로딩 워터마크·로그인 화면)와 네이버 구조화 데이터 `logo` 가 쓰는 그림의 정본.
 * 순수 데이터라 서버·브라우저 어디서든 읽는다. 2026-11-11 전에는 `/logo.webp`·`/logo-mark.png` 고정이라 울산(모보브)에도 기강 로고였다.
 *
 * ## 자리마다 고르는 법
 * - **하단 탭바·홈 로딩 워터마크** — 미리 만들어 두는 껍데기(정적 셸)라 서버가 팀을 모른다. 그리기 전 스크립트
 *   (`teamHostBootScript`, `lib/team-host.ts`)가 `<html data-team>` 을 붙이고, 아래 `teamLogoCss` 가 그 팀 그림을 CSS 변수
 *   (`--team-logo` · `--team-logo-mark`)로 건다 → **첫 화면부터** 맞는 로고(비었다 튀어나오지 않는다). 화면은 변수만 쓴다.
 * - **로그인 화면** — 서버가 이미 팀을 읽고 그리므로(`app/auth/login/page.tsx`) `teamLogoFor()` 로 골라 넘긴다(미리 받기 `priority` 가 걸린다).
 *
 * 그림 설명(alt)은 여기 두지 않는다 — 팀 이름을 박으면 운영진이 크루 이름을 바꿔도 옛 이름이 남는다. 쓰는 쪽이 팀 설정의 크루 이름
 * (`getTeamCopy().crewName`)을 쓴다. 표에 없는 팀·주소면 아무 그림도 안 건다 — 다른 팀 로고로 물러나지 않는다.
 *
 * 새 팀 = 이 표 한 줄 + `public/teams/<팀코드>/` 그림(`docs/new-team-checklist.md`). 주소 → 팀 표는 `lib/team-host.ts` 하나다.
 */

export type TeamLogo = {
  /** 로고 원본 — 검정 + 투명 배경(다크 모드는 화면이 `dark:invert` 로 뒤집는다) */
  logo: string;
  /** 탭바 마스크용 실루엣 — 투명 배경 위 모양(알파)만 쓰고 색은 탭 색(`bg-current`)으로 칠한다 */
  mark: string;
};

export const TEAM_LOGO: Readonly<Record<string, TeamLogo>> = {
  gigang: { logo: "/logo.webp", mark: "/logo-mark.png" },
  // 임시 로고(TEAM MOVOF ULSAN 배지) — 진짜 로고가 오면 이 파일만 바꾼다. 원본이 검정 + 투명이라 마스크로도 그대로 쓴다
  ulsan: { logo: "/teams/ulsan/logo.png", mark: "/teams/ulsan/logo.png" },
};

export function teamLogoFor(teamCd: string): TeamLogo | null {
  return TEAM_LOGO[teamCd] ?? null;
}

/** 접속 주소 → 팀 로고. 표에 없는 팀·주소면 null */
export function teamLogoForHost(host: string | null | undefined): TeamLogo | null {
  const teamCd = resolveTeamCdFromHost(host);
  return teamCd ? teamLogoFor(teamCd) : null;
}

/**
 * 팀별 로고 CSS 변수 — 루트 레이아웃이 `<style>` 로 싣는다(팀과 무관한 고정 문자열이라 껍데기에 그대로 들어간다).
 * `html[data-team="ulsan"]{--team-logo:url(...);--team-logo-mark:url(...)}` 꼴. `data-team` 은 그리기 전 스크립트가 붙인다.
 * 변수가 없는(모르는 주소) 화면은 쓰는 쪽이 투명으로 물러난다(`var(--team-logo-mark, …)`).
 */
export const teamLogoCss = Object.entries(TEAM_LOGO)
  .map(([teamCd, l]) => `html[data-team="${teamCd}"]{--team-logo:url("${l.logo}");--team-logo-mark:url("${l.mark}")}`)
  .join("");
