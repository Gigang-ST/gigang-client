/**
 * 대회 종목(comp_evt_type) UI·검증 공통 유틸.
 * DB `comp_evt_cfg.comp_evt_type` 은 대문자·ASCII 중심 문자열을 전제로 한다.
 */

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
