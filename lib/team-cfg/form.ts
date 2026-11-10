import type { CfgGroup, CfgInput } from "./registry";

/**
 * 관리자 「팀 설정」 화면의 순수 규칙 — 묶음 순서·이름, 항목 상태, 입력값 정리.
 * 화면(클라이언트)과 저장 액션(서버)이 같은 규칙을 써야 해서 여기 한 곳에 둔다.
 * 회귀 테스트: `lib/team-cfg/__tests__/form.test.ts`.
 */

/**
 * 묶음 표시 순서와 이름 — **팀의 근간부터**. 기본 설정(창설일·슬로건·워드마크) → 운영진이 쓰는 것(공지방·템플릿) →
 * 회원이 직접 보는 안내(채널·비밀번호·계좌) → 켜고 끄는 기능(2026-11-10 유저 결정).
 * `brand` 묶음을 예전엔 「꾸미기」라 불렀는데, 창설일·슬로건은 꾸밈이 아니라 팀이 누구인지라 「기본 설정」으로 바꿨다.
 */
export const CFG_GROUPS: { group: CfgGroup; label: string }[] = [
  { group: "brand", label: "기본 설정" },
  { group: "operation", label: "운영" },
  { group: "member_info", label: "크루 안내" },
  { group: "feature", label: "기능" },
];

/**
 * 묶음 안 순서 — 중요한 것부터. 여기 없는 키(새로 더한 키)는 그 묶음 맨 뒤에 붙는다(빠지지 않는다).
 */
export const CFG_ORDER: readonly string[] = [
  "feature.dues",
  "feature.titles",
  "records.categories",
  "social.channels",
  "social.kakao_open_chat_password",
  "bank.team_account",
  "kakao.room_id",
  "gathering.default_sport",
  "gathering.regular_template",
  "brand.slogan",
  "brand.founded_dt",
  "brand.wordmark",
];

export function compareCfgOrder(a: string, b: string): number {
  const ia = CFG_ORDER.indexOf(a);
  const ib = CFG_ORDER.indexOf(b);
  return (ia === -1 ? Number.MAX_SAFE_INTEGER : ia) - (ib === -1 ? Number.MAX_SAFE_INTEGER : ib);
}

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

/**
 * 목록 한 줄에 보일 요약 — 누르기 전에 "지금 뭐가 들어 있나"를 말한다. 비밀값은 값 대신 설정 여부만.
 * 빈 값이면 "설정 안 함"(목록이 흐리게 그린다).
 */
export function summarizeCfg(input: CfgInput, isSet: boolean, value: unknown): string {
  switch (input.kind) {
    case "boolean":
      return value === true ? "켜짐" : "꺼짐";
    case "secret":
      return isSet ? "설정됨" : "설정 안 함";
    case "text":
      return typeof value === "string" && value.trim() ? value.trim() : "설정 안 함";
    case "bank": {
      const v = value as { bank?: string; number?: string } | null;
      return v?.bank ? `${v.bank} ${v.number ?? ""}`.trim() : "설정 안 함";
    }
    case "channels": {
      const n = Object.keys((value as Record<string, string> | null) ?? {}).length;
      return n > 0 ? `${n}개 연결` : "설정 안 함";
    }
    case "regular_template": {
      const v = value as { title?: string } | null;
      return v?.title?.trim() ? v.title.trim() : "설정 안 함";
    }
    case "team_links": {
      const rows = (value as { name: string }[] | null) ?? [];
      return rows.length > 0 ? rows.map((r) => r.name).join(", ") : "설정 안 함";
    }
    case "choices": {
      const picked = Array.isArray(value) ? (value as string[]) : [];
      // 순서를 고르는 칸이면 저장된 순서 그대로(그게 화면 순서다), 아니면 보기 순서로
      const labels = input.orderable
        ? picked.map((v) => input.options.find((o) => o.value === v)?.label).filter((l): l is string => Boolean(l))
        : input.options.filter((o) => picked.includes(o.value)).map((o) => o.label);
      return labels.length > 0 ? labels.join(" · ") : "설정 안 함";
    }
    case "choice":
      return input.options.find((o) => o.value === value)?.label ?? "설정 안 함";
  }
}

export const EMPTY_SUMMARY = "설정 안 함";

/**
 * 저장하려는 값이 **기본값과 같은가** — 같으면 값을 저장하지 않고 이 크루 설정을 지워 기본값으로 돌린다
 * (「기본값으로」를 누른 뒤 저장, 또는 칸을 다 비우고 저장). 기본값이 "없음"인 키는 빈 값이면 같다고 본다.
 */
export function isDefaultCfgValue(value: unknown, defaultValue: unknown): boolean {
  if (isEmptyValue(defaultValue)) return isEmptyValue(value);
  return JSON.stringify(value) === JSON.stringify(defaultValue);
}

