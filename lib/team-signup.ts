import { JOIN_PURP_CODES } from "@/lib/validations/member";

/**
 * 팀별 가입 설정 — 가입 단계·가입 목적 칩(#748). 신입 안내의 칩·「더 알아보기」는 운영진이 고치는 내용이라 여기가 아니라
 * 팀 설정(`newbie.*`, §lib/newbie-guide)이다.
 *
 * 신입 안내(`/newbie`)·로그인·가입 폼·가입 서버 액션이 **이 표 하나**를 같이 읽는다. 각자 들면 진행바는 5단계인데 미리보기는
 * 6단계로 갈리거나, 화면엔 없는 목적 코드를 서버가 받아 준다. 순수 데이터라 서버·브라우저 어디서든 읽는다.
 *
 * - **단계**는 팀 설정 `feature.running_profile`(러닝 프로필 사용)을 따른다 — 끈 팀은 「러닝 프로필」 단계가 없다. 같은 스위치를
 *   카드·프로필 수정·관리자 목록·약관·MCP 도 읽는다(팀이 안 쓰기로 한 기능은 어디서도 안 보인다, 2026-11-26 유저 결정).
 *   서버는 `getRequestTeamSignup()`(`lib/queries/team-signup.ts`)로 요청 팀 것을 읽는다.
 * - **가입 목적 칩**은 코드 표다 — 칩마다 라벨이 코드에 붙어 있어 새 칩은 배포가 따른다(「기강」 말장난 표 `TEAM_VOICE` 와 같은 판단).
 * **표에 없는 팀 = 지금 기강 동작**(로드러닝 목적 10개).
 */

/** 가입 단계 이름 — 진행바와 신입 안내의 단계 미리보기가 같은 이름을 쓴다 */
export const SIGNUP_STEP_LABELS = ["시작", "로그인", "기본 정보", "러닝 프로필", "가입 목적", "참석 약속"] as const;
export type SignupStepLabel = (typeof SIGNUP_STEP_LABELS)[number];

export type JoinPurpCode = (typeof JOIN_PURP_CODES)[number];

export type TeamSignup = {
  /** 이 팀 가입 단계(순서대로). 「러닝 프로필」이 없으면 기본 정보 다음이 바로 가입 목적이다 */
  steps: readonly SignupStepLabel[];
  /** 가입 목적 칩(보여 주는 순서대로) */
  joinPurposes: readonly JoinPurpCode[];
};

/** 로드러닝 크루 목적 — 2026-11-23 이전 공통 목록 그대로(순서 포함) */
const ROAD_PURPOSES = [
  "RUN_MATE",
  "COACH",
  "TRAINING",
  "NEW_SPORT",
  "RACE",
  "FRIENDS",
  "HABIT",
  "FIRST_FINISH",
  "PB",
  "HEALTH",
] as const satisfies readonly JoinPurpCode[];

/** 트레일러닝 크루 목적 — 산 메이트·트레일 입문·첫 트레일 완주 + 종목 무관한 공통 칩 */
const TRAIL_PURPOSES = [
  "MT_MATE",
  "TRAIL_START",
  "COACH",
  "RACE",
  "TRAIL_FINISH",
  "PB",
  "FRIENDS",
  "HABIT",
  "HEALTH",
] as const satisfies readonly JoinPurpCode[];

export const DEFAULT_TEAM_SIGNUP: TeamSignup = {
  steps: SIGNUP_STEP_LABELS,
  joinPurposes: ROAD_PURPOSES,
};

/** 팀별 가입 목적 칩 — 표에 없는 팀은 로드러닝 목록 */
const TEAM_JOIN_PURPOSES: Readonly<Record<string, readonly JoinPurpCode[]>> = {
  // 모비 — 트레일러닝 크루(2026-11-23 유저 결정)
  ulsan: TRAIL_PURPOSES,
};

/**
 * 팀 가입 설정. `runningProfile` = 팀 설정 `feature.running_profile`(모비는 끔 — 수도권 지하철역·로드 페이스·로드 기록이
 * 트레일 크루에 안 맞아서, 2026-11-23 유저 결정).
 */
export function getTeamSignup(teamCd: string, { runningProfile }: { runningProfile: boolean }): TeamSignup {
  return {
    steps: runningProfile ? SIGNUP_STEP_LABELS : SIGNUP_STEP_LABELS.filter((s) => s !== "러닝 프로필"),
    joinPurposes: TEAM_JOIN_PURPOSES[teamCd] ?? ROAD_PURPOSES,
  };
}

/** 이 팀 가입에 러닝 프로필 단계가 있나(= 팀이 러닝 프로필을 쓰나) — 없으면 가입 때 러닝 프로필(사람 것)을 쓰지도 지우지도 않는다 */
export function hasRunningProfileStep(signup: Pick<TeamSignup, "steps">): boolean {
  return signup.steps.includes("러닝 프로필");
}

/** 고른 목적이 전부 이 팀 칩인가 — 서버가 다시 본다(화면에 없는 코드를 직접 보내는 요청을 막는다) */
export function isTeamJoinPurposes(signup: Pick<TeamSignup, "joinPurposes">, codes: readonly string[]): boolean {
  return codes.every((c) => (signup.joinPurposes as readonly string[]).includes(c));
}
