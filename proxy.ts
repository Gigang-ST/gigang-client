import { updateSession } from "@/lib/supabase/proxy";
import { resolveTeamCdFromHost } from "@/lib/team-host";
import { NextResponse, type NextRequest } from "next/server";

/**
 * 등록되지 않은 주소로 들어온 화면 요청은 팀을 정할 수 없으니 여기서 끊는다(이유: `lib/team-host.ts`).
 * 문자열 비교뿐이라 DB·Vercel 계량 호출이 없고, 오히려 그 뒤의 Supabase 인증 확인까지 건너뛴다.
 *
 * `/api/*`는 막지 않는다 — Vercel Cron·웹훅·MCP는 팀을 주소가 아니라 작업 설정·토큰에서 읽고,
 * 어떤 주소로 불릴지 우리가 정하지 않는다. 주소로 팀을 읽는 API는 `getRequestTeamContext()`가
 * 대신 던져서 막는다.
 */
function unknownHostResponse() {
  return new NextResponse(
    `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="robots" content="noindex"><title>주소를 확인해 주세요</title></head><body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100svh;margin:0;padding:0 24px;text-align:center"><div><h1 style="font-size:20px;margin:0 0 8px">주소를 확인해 주세요</h1><p style="margin:0;opacity:.7;font-size:15px">등록되지 않은 주소예요. 주소에 오타가 없는지 확인해 주세요.</p></div></body></html>`,
    { status: 404, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export async function proxy(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/api/")) {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    if (!resolveTeamCdFromHost(host)) return unknownHostResponse();
  }
  return await updateSession(request);
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
