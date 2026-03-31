#!/usr/bin/env node
/**
 * Supabase API로 인증 후 agent-browser 세션에 쿠키를 주입합니다.
 *
 * 사용법:
 *   node scripts/visual-diff-auth.mjs <site-url>
 *
 * 필요 환경변수:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
 *   E2E_TEST_EMAIL
 *   E2E_TEST_PASSWORD
 */
import { execFileSync } from "node:child_process";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const EMAIL = process.env.E2E_TEST_EMAIL;
const PASSWORD = process.env.E2E_TEST_PASSWORD;
const SITE_URL = process.argv[2];

if (!SUPABASE_URL || !SUPABASE_KEY || !EMAIL || !PASSWORD || !SITE_URL) {
  console.error(
    "필수 환경변수 또는 site-url 누락\n" +
      "  NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,\n" +
      "  E2E_TEST_EMAIL, E2E_TEST_PASSWORD + <site-url> 인자",
  );
  process.exit(1);
}

// 1) Supabase Auth API로 토큰 획득
const res = await fetch(
  `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  },
);
const session = await res.json();
if (!res.ok) {
  console.error(
    "로그인 실패:",
    session.msg ?? session.error_description ?? JSON.stringify(session),
  );
  process.exit(1);
}
console.log(`  토큰 획득 완료 (${EMAIL})`);

// 2) @supabase/ssr 쿠키 형식으로 인코딩
const projectRef = new URL(SUPABASE_URL).hostname.split(".")[0];
const cookieBase = `sb-${projectRef}-auth-token`;

const sessionData = JSON.stringify({
  access_token: session.access_token,
  refresh_token: session.refresh_token,
  expires_in: session.expires_in,
  expires_at: Math.floor(Date.now() / 1000) + session.expires_in,
  token_type: "bearer",
  user: session.user,
});

const encoded =
  "base64-" +
  Buffer.from(sessionData)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

// 3) 3180바이트 단위로 청크 분할
const CHUNK_SIZE = 3180;
const chunks = [];
for (let i = 0; i < encoded.length; i += CHUNK_SIZE) {
  chunks.push(encoded.slice(i, i + CHUNK_SIZE));
}

// 4) agent-browser cookies set으로 쿠키 주입 (execFileSync로 shell injection 방지)
const ab = (...args) =>
  execFileSync("agent-browser", args, { stdio: "inherit" });

const expires = Math.floor(Date.now() / 1000) + session.expires_in;

for (let i = 0; i < chunks.length; i++) {
  const name = chunks.length === 1 ? cookieBase : `${cookieBase}.${i}`;
  ab(
    "cookies", "set", name, chunks[i],
    "--url", SITE_URL, "--path", "/", "--sameSite", "Lax", "--expires", String(expires),
  );
}

// 5) 사이트 열어서 세션 확인
ab("open", SITE_URL);
ab("wait", "--load", "networkidle");

console.log(
  `  쿠키 주입 완료 (${chunks.length}개 청크, ${cookieBase})`,
);
