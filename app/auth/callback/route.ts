import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

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
      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocalEnv = env.NODE_ENV === "development";
      const location = isLocalEnv
        ? `${origin}${next}`
        : forwardedHost
          ? `https://${forwardedHost}${next}`
          : `${origin}${next}`;
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
