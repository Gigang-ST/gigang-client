/**
 * 한국어 조사 — 앞말의 받침에 맞춰 고른다. 회귀 테스트 `lib/__tests__/josa.test.ts`.
 *
 * 크루 이름이 팀마다 달라져서 생겼다(2026-11-10): 「기강」은 받침이 있고 「모보브」는 없어서,
 * 문구에 이름만 끼우면 「모보브은」「모보브이 모여 있는 곳」이 된다.
 *
 * - 마지막 글자가 **한글 음절**이면 종성으로 판정한다.
 * - **숫자**는 읽는 소리로 — 0 영·1 일·3 삼·6 육·7 칠·8 팔은 받침, 나머지는 없음(「5K는」「10K는」은 K라 없음).
 * - **영문**은 사전 없이 맞는 만큼만(#658 — 크루 이름·워드마크가 영문일 수 있다. 「GIGANG」「MOVOF」):
 *   - 세 글자 이하 대문자는 약어로 보고 **마지막 글자 이름**으로 — L(엘)·M(엠)·N(엔)·R(알)만 받침(「KRC는」「LRL은」).
 *   - 그 밖의 단어는 끝소리로 — `ng`(ㅇ)·`m`(ㅁ)·`n`(ㄴ)·`l`(ㄹ)로 끝나면 받침, 나머지는 없음
 *     (「GIGANG은」「Garmin은」「Trail로」 / 「MOVOF는」「Nike는」「Runner는」).
 *     k·p·t 처럼 받침도 되고 모음도 붙는 끝(「Park 파크」「Club 클럽」)은 갈리므로 없음 쪽으로 둔다.
 * - 그 밖의 글자(기호 등)는 받침 없음.
 * - 「으로/로」는 받침 ㄹ 이면 「로」(「서울로」).
 */

const HANGUL_START = 0xac00;
const HANGUL_END = 0xd7a3;
/** 종성 ㄹ 의 인덱스(종성 없음 = 0) */
const JONG_RIEUL = 8;

/** 받침 종류만 가리는 대표 종성 인덱스(한글 아닌 글자용) — 0 없음, ㄱ 1, ㄴ 4, ㄹ 8, ㅁ 16, ㅇ 21 */
const JONG = { none: 0, giyeok: 1, nieun: 4, rieul: JONG_RIEUL, mieum: 16, ieung: 21 } as const;

/** 숫자 읽는 소리의 받침 — 영·일·이·삼·사·오·육·칠·팔·구 */
const DIGIT_JONG = [
  JONG.ieung, JONG.rieul, JONG.none, JONG.mieum, JONG.none,
  JONG.none, JONG.giyeok, JONG.rieul, JONG.rieul, JONG.none,
] as const;

/** 약어 마지막 글자 이름의 받침 — 엘·엠·엔·알 */
const ACRONYM_JONG: Readonly<Record<string, number>> = { L: JONG.rieul, M: JONG.mieum, N: JONG.nieun, R: JONG.rieul };

function latinJongseong(word: string): number {
  const tail = /[A-Za-z]+$/.exec(word)?.[0] ?? "";
  if (tail.length <= 3 && tail === tail.toUpperCase()) return ACRONYM_JONG[tail.slice(-1)] ?? JONG.none;
  const lower = tail.toLowerCase();
  if (lower.endsWith("ng")) return JONG.ieung;
  const last = lower.slice(-1);
  if (last === "m") return JONG.mieum;
  if (last === "n") return JONG.nieun;
  if (last === "l") return JONG.rieul;
  return JONG.none;
}

function jongseongIndex(word: string): number | null {
  const trimmed = word.trim();
  const last = trimmed.slice(-1);
  if (!last) return null;
  const code = last.charCodeAt(0);
  if (code >= HANGUL_START && code <= HANGUL_END) return (code - HANGUL_START) % 28;
  if (/[0-9]/.test(last)) return DIGIT_JONG[Number(last)];
  if (/[A-Za-z]/.test(last)) return latinJongseong(trimmed);
  return null;
}

/** 마지막 글자에 받침이 있나 — 영문·숫자는 위 규칙으로, 그 밖의 글자는 false */
export function hasBatchim(word: string): boolean {
  const jong = jongseongIndex(word);
  return jong != null && jong > 0;
}

export type JosaPair = "은/는" | "이/가" | "을/를" | "과/와" | "이랑/랑" | "으로/로" | "이에요/예요" | "아/야";

/** 앞말에 맞는 조사만 */
export function josaOf(word: string, pair: JosaPair): string {
  const [withBatchim, without] = pair.split("/") as [string, string];
  if (pair === "으로/로") {
    const jong = jongseongIndex(word);
    return jong != null && jong > 0 && jong !== JONG_RIEUL ? withBatchim : without;
  }
  return hasBatchim(word) ? withBatchim : without;
}

/** 앞말 + 조사 — `josa("모보브", "은/는")` → `"모보브는"` */
export function josa(word: string, pair: JosaPair): string {
  return `${word}${josaOf(word, pair)}`;
}
