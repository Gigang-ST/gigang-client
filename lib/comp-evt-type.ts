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

/** 철인3종 기본 종목(공통코드 `TRI_EVT_CD`) — 마라톤 코드와 겹치는 접두어 없는 값 */
const TRIATHLON_BARE_EVT_TYPES = new Set(["FULL", "HALF", "OLYMPIC", "SPRINT"]);

/**
 * 기강의 전당 랭킹이 쓰는 종목 코드.
 *
 * 철인 대회의 `FULL`·`HALF`·`OLYMPIC`·`SPRINT`를 `TRIATHLON_*`으로 바꾼다. 그대로 두면 철인
 * 풀·하프가 마라톤 풀·하프와 같은 코드라 랭킹에서 섞인다(#581). 그 밖의 값은 정규화만 한다.
 *
 * **정본은 RPC `get_public_team_race_rankings`의 `evt_cd` CASE**고, 이 함수는 그 거울이다 —
 * 저장 시 캐시무효화 판정(`save-race-record.ts`)이 RPC 결과와 같은 코드로 대조하려고 쓴다.
 * 한쪽을 고치면 다른 쪽도 고친다.
 */
export function toRankingEvtCd(sprtCd: string | null | undefined, evtType: string): string {
  const key = normalizeCompEvtTypeKey(evtType);
  if (sprtCd === "triathlon" && TRIATHLON_BARE_EVT_TYPES.has(key)) return `TRIATHLON_${key}`;
  return key;
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

/** 표준 종목의 공식 거리(km). `37K`처럼 숫자로 적힌 종목은 아래 정규식이 받는다. */
const COMP_EVT_KM: Record<string, number> = {
  FULL: 42.195,
  HALF: 21.0975,
};

/**
 * 종목 코드 → 거리(km). 모르면 `null`.
 *
 * 페이스를 계산하려면 거리가 있어야 하는데, 종목 코드는 표준값(FULL·HALF)과
 * 자유 입력(`37K`·`55K`)이 섞여 있다. 마라톤·하프는 소수점까지 정확히 잡아야
 * 페이스가 어긋나지 않는다(42km로 두면 풀코스에서 약 3초/km가 밀린다).
 *
 * **달리기 종목에만 쓴다.** 철인3종·사이클은 구간이 나뉘어 있어 총시간을 총거리로
 * 나눈 값이 아무 의미가 없다 — 호출부가 `sport`로 먼저 거른다.
 */
export function compEvtTypeKm(value: string | null | undefined): number | null {
  const key = normalizeCompEvtTypeKey(String(value ?? ""));
  if (!key) return null;
  if (COMP_EVT_KM[key]) return COMP_EVT_KM[key];
  // `10K` `37K` `55K` — 숫자+K 형태만 받는다(소수점 허용: `21.1K`)
  const m = /^(\d+(?:\.\d+)?)K$/.exec(key);
  return m ? Number(m[1]) : null;
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
