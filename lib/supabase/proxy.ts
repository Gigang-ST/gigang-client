import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";

/**
 * 모든 요청에서 실행되는 인증 미들웨어.
 * 세션 쿠키 검사 → Supabase 토큰 검증 → 비인증 유저 리다이렉트 순서로 동작한다.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  // 환경변수 미설정 시 인증 검사 생략 (skipValidation 모드에서 발생 가능)
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    return supabaseResponse;
  }

  // 비로그인 상태에서도 접근 가능한 공개 경로 목록
  const pathname = request.nextUrl.pathname;
  const publicPaths = ["/", "/rules", "/join", "/newbie", "/races", "/records", "/projects", "/terms", "/privacy", "/policy", "/settings"];
  const isPublic =
    publicPaths.includes(pathname) || pathname.startsWith("/auth");

  // 세션 쿠키가 아예 없으면 Supabase 서버 호출 없이 즉시 리다이렉트 (100~700ms 절약)
  // Supabase는 토큰이 크면 쿠키를 청크 분할함 (sb-*-auth-token.0, .1, ...)
  const hasSessionCookie = request.cookies.getAll().some(
    (c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"),
  );

  if (!hasSessionCookie && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    return NextResponse.redirect(url);
  }

  // 쿠키가 존재하면 Supabase 서버 클라이언트를 생성하여 토큰 유효성 검증
  // Fluid compute 환경에서는 매 요청마다 새 클라이언트를 생성해야 함
  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        // 토큰 갱신 시 요청/응답 양쪽 쿠키를 동기화하여 브라우저-서버 불일치 방지
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // createServerClient와 getClaims() 사이에 다른 코드를 넣지 말 것.
  // 세션 갱신 타이밍이 꼬여서 유저가 랜덤하게 로그아웃될 수 있음.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  // 쿠키는 있지만 토큰이 만료/무효한 경우 리다이렉트
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
