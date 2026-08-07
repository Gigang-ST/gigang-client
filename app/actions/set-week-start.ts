"use server";

import { cookies } from "next/headers";

import { WEEK_START_COOKIE, WEEK_STARTS, parseWeekStart, type WeekStart } from "@/lib/week-start";

/** 1년 — 표시 취향이라 만료로 되돌아갈 이유가 없다. 기기별 설정이므로 갱신도 그 기기에서 한다. */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * 주 시작 요일을 쿠키에 저장한다.
 *
 * 쿠키를 쓰는 이유와 localStorage/DB를 안 쓴 이유는 `lib/week-start.ts` 주석에 있다.
 * 값 검증을 여기서 한 번 더 하는 건 서버 액션이 **클라이언트에서 직접 호출 가능한 엔드포인트**라
 * 버튼이 보내는 값만 온다고 믿을 수 없기 때문이다. 이상한 값이 쿠키에 앉으면 그 회원은
 * 매 요청마다 기본값으로 되돌아가 "설정이 안 먹는다"로 보인다.
 *
 * `httpOnly`는 쓰지 않는다 — 비밀이 아니고, 나중에 클라이언트가 읽어야 할 일이 생길 수 있다.
 */
export async function setWeekStart(value: WeekStart) {
  if (!WEEK_STARTS.includes(value)) {
    return { ok: false as const, message: "알 수 없는 시작 요일입니다." };
  }

  (await cookies()).set(WEEK_START_COOKIE, String(value), {
    path: "/",
    maxAge: MAX_AGE_SECONDS,
    sameSite: "lax",
  });

  return { ok: true as const, weekStart: parseWeekStart(String(value)) };
}
