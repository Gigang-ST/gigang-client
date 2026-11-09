import { after, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { resolveTeamContextFromHost } from "@/lib/queries/request-team";
import { evaluateAndGrantTitles } from "@/lib/titles/engine";

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
        const teamCtx = resolveTeamContextFromHost(forwarded ?? hostFromUrl);
        // 등록되지 않은 주소면 어느 팀 회원인지 판정할 수 없다 — 기강으로 폴백하지 않는다
        // (페이지 경로라 proxy가 먼저 404로 끊지만, 그걸 지나온 경우의 방어선).
        if (!teamCtx) {
          return redirectClearingOAuthNext(
            `${origin}/auth/error?error=${encodeURIComponent("등록되지 않은 주소입니다")}`,
          );
        }
        const { teamId } = teamCtx;

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

        let teamMemId: string | null = null;
        if (mst?.mem_id) {
          const { data: rel } = await admin
            .from("team_mem_rel")
            .select("team_mem_id")
            .eq("mem_id", mst.mem_id)
            .eq("team_id", teamId)
            .eq("vers", 0)
            .eq("del_yn", false)
            .maybeSingle();
          teamMemId = rel?.team_mem_id ?? null;
        }

        const isMember = Boolean(mst?.mem_id) && Boolean(teamMemId);
        if (!isMember) {
          const afterOnboarding = resolvedNext === "/onboarding" ? "/" : resolvedNext;
          resolvedNext = `/onboarding?next=${encodeURIComponent(afterOnboarding)}`;
        } else if (teamMemId) {
          // 로그인 시점 칭호 평가 (1년차, 고인물, 화석, 런린이 등 시간 기반) — 응답 완료 후 실행
          const tid = teamId;
          const tmid = teamMemId;
          after(() =>
            evaluateAndGrantTitles({ trigger: "attendance", teamId: tid, teamMemId: tmid })
              .catch((e) => console.error("[title-engine] 로그인 attendance 평가 실패", e))
          );
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

  // 계정 연동(linkIdentity) 실패 — 그 계정이 이미 다른 회원으로 쓰이는 등. Supabase 가 code 없이
  // error·error_description 을 붙여 돌려보낸다. 일반 오류 화면 대신 계정 연동 화면에서 안내한다.
  if (flow === "link") {
    console.error("[auth/callback] 계정 연동 실패", searchParams.get("error"), searchParams.get("error_description"));
    const forwardedHost = request.headers.get("x-forwarded-host");
    const base = env.NODE_ENV === "development" || !forwardedHost ? origin : `https://${forwardedHost}`;
    return redirectClearingOAuthNext(`${base}/settings/accounts?link_error=1`);
  }

  return redirectClearingOAuthNext(
    `${origin}/auth/error?error=OAuthCallbackError+no+code`,
  );
}
