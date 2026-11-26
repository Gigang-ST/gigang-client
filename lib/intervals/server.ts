import { env } from "@/lib/env";

/**
 * intervals.icu 연결에 쓰는 암호화 비밀(#760). 미설정이면 null — 연결·동기화만 꺼진다(앱은 뜬다).
 * 값은 어디에도 찍지 않는다.
 */
export function getIntervalsSecret(): string | null {
  return env.INTERVALS_KEY_SECRET ?? null;
}
