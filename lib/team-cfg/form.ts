import type { CfgGroup } from "./registry";

/**
 * 관리자 「팀 설정」 화면의 순수 규칙 — 묶음 순서·이름, 항목 상태, 입력값 정리.
 * 화면(클라이언트)과 저장 액션(서버)이 같은 규칙을 써야 해서 여기 한 곳에 둔다.
 * 회귀 테스트: `lib/team-cfg/__tests__/form.test.ts`.
 */

/** 묶음 표시 순서와 이름 — 자주 만지는 것(기능)이 위, 거의 안 만지는 것(비밀값)이 아래 */
export const CFG_GROUPS: { group: CfgGroup; label: string }[] = [
  { group: "feature", label: "기능" },
  { group: "brand", label: "크루 표기" },
  { group: "channel", label: "채널·계좌" },
  { group: "content", label: "템플릿·안내" },
  { group: "secret", label: "비밀값" },
];

/**
 * 항목 상태.
 * - `set`     : 이 팀이 직접 정한 값이 있다.
 * - `default` : 안 정했고, 기본 동작(예: 회비 켬)으로 돈다.
 * - `empty`   : 안 정했고, 기본값이 "없음"이라 화면에 안 나온다(카톡방·계좌·워드마크 등 — 다른 팀 값이 새지 않게).
 */
export type CfgStatus = "set" | "default" | "empty";

/** 기본값이 "없음"인가 — null·빈 문자열·빈 목록·빈 객체 */
export function isEmptyValue(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim().length === 0;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v as object).length === 0;
  return false;
}

export function cfgStatus(isSet: boolean, defaultValue: unknown): CfgStatus {
  if (isSet) return "set";
  return isEmptyValue(defaultValue) ? "empty" : "default";
}

export const CFG_STATUS_LABEL: Record<CfgStatus, string> = {
  set: "이 팀 설정",
  default: "기본값",
  empty: "설정 안 함",
};

/** 채널 입력 — 빈 칸은 키째 뺀다(빈 문자열을 넣으면 URL 검사에 걸리고, "없는 채널"이 아니라 "빈 주소"가 된다) */
export function normalizeChannels(input: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input)) {
    const t = v.trim();
    if (t) out[k] = t;
  }
  return out;
}

/** 다른 팀 가입 안내 — 팀 코드나 이름이 빈 줄은 뺀다 */
export function normalizeTeamLinks(rows: { team_cd: string; name: string }[]): { team_cd: string; name: string }[] {
  return rows
    .map((r) => ({ team_cd: r.team_cd.trim(), name: r.name.trim() }))
    .filter((r) => r.team_cd && r.name);
}
