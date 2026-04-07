import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { resolveTeamContextFromHost } from "@/lib/queries/request-team";

function readCookie(rawCookie: string | null, key: string) {
  if (!rawCookie) return null;
  const hit = rawCookie
    .split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${key}=`));
  if (!hit) return null;
  const value = hit.slice(key.length + 1);
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** OAuth 콜백 후 `oauth_next`를 항상 비워 이전 시도 경로가 재사용되지 않게 한다. */
function redirectClearingOAuthNext(url: string | URL) {
  const response = NextResponse.redirect(url);
  response.cookies.set("oauth_next", "", { path: "/", maxAge: 0 });
  return response;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const flow = searchParams.get("flow");
  const nextParam = searchParams.get("next");
  const cookieNext = readCookie(request.headers.get("cookie"), "oauth_next");
  const defaultNext = flow === "link" ? "/profile" : "/onboarding";
  const nextCandidate = nextParam ?? cookieNext;
  const next = nextCandidate?.startsWith("/") && !nextCandidate.startsWith("//")
    ? nextCandidate
    : defaultNext;

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      let resolvedNext = next;
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // 로그인 직후 비회원은 next 유실 여부와 무관하게 온보딩으로 고정
      if (flow !== "link" && user) {
        const forwarded = request.headers.get("x-forwarded-host");
        const hostFromUrl = new URL(request.url).host;
        const { teamId } = await resolveTeamContextFromHost(forwarded ?? hostFromUrl);

        const admin = createAdminClient();
        const { data: mst } = await admin
          .from("mem_mst")
          .select("mem_id")
          .eq("vers", 0)
          .eq("del_yn", false)
          .or(
            `oauth_kakao_id.eq.${user.id},oauth_google_id.eq.${user.id}`,
          )
          .maybeSingle();

        let hasTeamRel = false;
        if (mst?.mem_id) {
          const { data: rel } = await admin
            .from("team_mem_rel")
            .select("team_mem_id")
            .eq("mem_id", mst.mem_id)
            .eq("team_id", teamId)
            .eq("vers", 0)
            .eq("del_yn", false)
            .maybeSingle();
          hasTeamRel = Boolean(rel);
        }

        const isMember = Boolean(mst?.mem_id) && hasTeamRel;
        if (!isMember) {
          const afterOnboarding = resolvedNext === "/onboarding" ? "/" : resolvedNext;
          resolvedNext = `/onboarding?next=${encodeURIComponent(afterOnboarding)}`;
        }
      }

      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocalEnv = env.NODE_ENV === "development";
      const location = isLocalEnv
        ? `${origin}${resolvedNext}`
        : forwardedHost
          ? `https://${forwardedHost}${resolvedNext}`
          : `${origin}${resolvedNext}`;
      return redirectClearingOAuthNext(location);
    }
    console.error("OAuth exchange error:", error.message);
    return redirectClearingOAuthNext(
      `${origin}/auth/error?error=${encodeURIComponent(error.message)}`,
    );
  }

  return redirectClearingOAuthNext(
    `${origin}/auth/error?error=OAuthCallbackError+no+code`,
  );
}
