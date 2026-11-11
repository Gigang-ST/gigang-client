/**
 * 한국어 조사 — 앞말의 받침에 맞춰 고른다. 회귀 테스트 `lib/__tests__/josa.test.ts`.
 *
 * 크루 이름이 팀마다 달라져서 생겼다(2026-11-10): 「기강」은 받침이 있고 「모보브」는 없어서,
 * 문구에 이름만 끼우면 「모보브은」「모보브이 모여 있는 곳」이 된다.
 *
 * - 마지막 글자가 **한글 음절**이면 종성으로 판정한다.
 * - 한글이 아니면(영문·숫자 — 「MOVOF」 등) 받침이 없는 것으로 본다. 영문 발음까지 맞추려면 사전이 필요한데,
 *   크루 이름은 한글로 받는 게 기본이라 그만큼은 하지 않는다.
 * - 「으로/로」는 받침 ㄹ 이면 「로」(「서울로」).
 */

const HANGUL_START = 0xac00;
const HANGUL_END = 0xd7a3;
/** 종성 ㄹ 의 인덱스(종성 없음 = 0) */
const JONG_RIEUL = 8;

function jongseongIndex(word: string): number | null {
  const last = word.trim().slice(-1);
  if (!last) return null;
  const code = last.charCodeAt(0);
  if (code < HANGUL_START || code > HANGUL_END) return null;
  return (code - HANGUL_START) % 28;
}

/** 마지막 글자에 받침이 있나 — 한글이 아니면 false */
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
