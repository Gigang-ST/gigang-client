import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/lib/env";
import {
  BYPASS_COOKIE,
  BYPASS_PARAM,
  MAINTENANCE_PATH,
  isMaintenanceActive,
  preCheckMaintenance,
} from "@/lib/maintenance";
import { readMaintenanceConfig } from "@/lib/maintenance-config";
import { updateSession } from "@/lib/supabase/proxy";

/**
 * 점검 판정을 **`updateSession()` 앞에** 둔다.
 *
 * `updateSession()` 은 매 요청 `supabase.auth.getClaims()` 를 부르고, 토큰이 만료돼 있으면
 * 거기서 Supabase Auth 로 갱신을 시도한다. Supabase 가 아플 때 그게 타임아웃 나면서
 * **페이지를 그리기도 전에** 막힌다(2026-09-23 장애: `/auth/v1/token` 504 가 123건).
 * 점검 모드는 바로 그 구간을 건너뛰어야 의미가 있으므로 Supabase 를 부르기 전에 갈린다.
 */
export async function proxy(request: NextRequest) {
  const bypassSecret = env.MAINTENANCE_BYPASS_SECRET;

  const pre = preCheckMaintenance({
    pathname: request.nextUrl.pathname,
    bypassParam: request.nextUrl.searchParams.get(BYPASS_PARAM),
    bypassCookie: request.cookies.get(BYPASS_COOKIE)?.value ?? null,
    bypassSecret,
  });

  // API·점검 페이지·우회 쿠키 보유자는 Global Config 왕복조차 하지 않는다.
  if (pre === "check-config" && isMaintenanceActive(await readMaintenanceConfig())) {
    return NextResponse.rewrite(new URL(MAINTENANCE_PATH, request.url));
  }

  const response = await updateSession(request);

  // `?bypass=<비밀값>` 으로 한 번 들어오면 그 브라우저는 이후 쿠키로 통과한다.
  // 점검이 꺼져 있을 때 미리 받아둘 수도 있다 — 장애 중에 주소를 타이핑하지 않아도 되게.
  if (pre === "grant-bypass" && bypassSecret) {
    response.cookies.set(BYPASS_COOKIE, bypassSecret, {
      httpOnly: true,
      sameSite: "lax",
      secure: env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 12,
    });
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images - .svg, .png, .jpg, .jpeg, .gif, .webp
     * Feel free to modify this pattern to include more paths.
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
