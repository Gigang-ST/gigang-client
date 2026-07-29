import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export { secondsToTime } from "./dayjs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * UUID 형태인가 — **던지지 않는 판정**.
 *
 * `validateUUID`는 던지므로 "잘못된 입력이면 조용히 빈 결과"로 끝내야 하는 경로(사용자가
 * 주소창에 넣은 쿼리 파라미터 등)에서는 쓸 수 없다. 정규식이 세 번째로 복제되지 않게
 * 두 함수가 같은 상수를 공유한다.
 */
export function isUUID(id: string): boolean {
  return UUID_RE.test(id);
}

export function validateUUID(id: string): void {
  if (!isUUID(id)) throw new Error("Invalid user ID");
}
