import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { GIGANG_TEAM_ID } from "@/lib/constants/gigang-team";

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
        const admin = createAdminClient();
        const { data: mst } = await admin
          .from("mem_mst")
          .select("mem_id")
          .eq("vers", 0)
          .eq("del_yn", false)
          .or(
            `mem_id.eq.${user.id},oauth_kakao_id.eq.${user.id},oauth_google_id.eq.${user.id}`,
          )
          .maybeSingle();

        let hasTeamRel = false;
        if (mst?.mem_id) {
          const { data: rel } = await admin
            .from("team_mem_rel")
            .select("team_mem_id")
            .eq("mem_id", mst.mem_id)
            .eq("team_id", GIGANG_TEAM_ID)
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
      const response = NextResponse.redirect(location);
      response.cookies.set("oauth_next", "", { path: "/", maxAge: 0 });
      return response;
    }
    console.error("OAuth exchange error:", error.message);
    return NextResponse.redirect(
      `${origin}/auth/error?error=${encodeURIComponent(error.message)}`,
    );
  }

  return NextResponse.redirect(`${origin}/auth/error?error=OAuthCallbackError+no+code`);
}
