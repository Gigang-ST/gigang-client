/**
 * 대회 종목(comp_evt_type) UI·검증 공통 유틸.
 * DB `comp_evt_cfg.comp_evt_type` 은 대문자·ASCII 중심 문자열을 전제로 한다.
 */

/** 기타(직접 입력) 칩/폼용 구분값 (DB에 저장하지 않음) */
export const COMP_EVT_TYPE_OTHER = "__OTHER__";

/** 종목 비교·중복 제거용 키 (대소문자·앞뒤 공백 무시) */
export function normalizeCompEvtTypeKey(value: string): string {
  return value.trim().toUpperCase();
}

/** 한글(한글 자모·음절) 포함 여부 — 기록 등록 등에서 입력 차단에 사용 */
const HANGUL_RE = /[\u3131-\u3163\uac00-\ud7a3]/;

export function compEvtTypeContainsHangul(value: string): boolean {
  return HANGUL_RE.test(value);
}

/**
 * 기타(직접 입력) 종목: 대문자 + 허용 문자만 남긴다.
 * 허용: 영문 대문자·숫자·공백·하이픈·밑줄 (예: ROAD RACE, 35K_DUO)
 */
export function sanitizeAsciiUpperCompEvtTypeInput(raw: string): string {
  const upper = raw.toUpperCase();
  return upper.replace(HANGUL_RE, "").replace(/[^A-Z0-9 \-_]/g, "");
}

/**
 * 종목 코드 → 화면 라벨.
 *
 * DB `comp_evt_type`은 두 부류다: 표준 코드(FULL·HALF·OLYMPIC·TRIATHLON_HALF·GRANFONDO 등)와
 * 이미 사람이 읽는 거리 코드(37K·50K·100K·12K 등). 후자는 그대로가 곧 라벨이라 손대지 않고,
 * 전자만 한글로 바꾼다. 알 수 없는 값은 원문 그대로(정규화만) 돌려준다 — 임의 거리 코드도
 * 화면에 뜨게. 빈 값은 `null`(호출부가 "종목 미정" 등으로 처리).
 */
const COMP_EVT_LABEL: Record<string, string> = {
  FULL: "풀코스",
  HALF: "하프",
  OLYMPIC: "올림픽",
  TRIATHLON_OLYMPIC: "철인 올림픽",
  TRIATHLON_HALF: "철인 하프",
  TRIATHLON_FULL: "철인",
  GRANFONDO: "그란폰도",
  MEDIOFONDO: "메디오폰도",
  TRAIL: "트레일",
};

export function compEvtTypeLabel(value: string | null | undefined): string | null {
  const key = normalizeCompEvtTypeKey(String(value ?? ""));
  if (!key) return null;
  return COMP_EVT_LABEL[key] ?? key;
}

/**
 * `comp_evt_cfg`에 나온 종목을 먼저 두고, 스포츠 기본 종목 중 아직 없는 것만 뒤에 붙인다.
 * (동일 종목은 정규화 키 기준 한 번만 노출)
 */
export function buildEventTypeOptionList(
  configuredTypes: string[] | null | undefined,
  sportDefaultTypes: readonly string[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of configuredTypes ?? []) {
    const k = normalizeCompEvtTypeKey(String(raw));
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }

  for (const raw of sportDefaultTypes) {
    const k = normalizeCompEvtTypeKey(String(raw));
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }

  return out;
}
