/**
 * Supabase API로 직접 로그인 후 세션 쿠키를 Playwright에 주입
 *
 * 사용법:
 *   pnpm run screenshots:login          — 자동 로그인 (API 직접 호출)
 *   pnpm run screenshots:login manual   — 수동 로그인 (브라우저 열기)
 *
 * UI 폼을 사용하지 않으므로 로컬 이메일 로그인 UI가 없어도 동작합니다.
 */
import { loadEnvConfig } from "@next/env";
import { chromium } from "@playwright/test";
import * as fs from "node:fs";
import * as readline from "node:readline";

loadEnvConfig(process.cwd());

const BASE_URL = "http://localhost:3000";
const AUTH_FILE = "screenshots/auth.json";
const isManual = process.argv[2] === "manual";

async function autoLogin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;

  if (!supabaseUrl || !supabaseKey) {
    console.error("❌ NEXT_PUBLIC_SUPABASE_URL 또는 PUBLISHABLE_KEY가 없습니다.");
    process.exit(1);
  }
  if (!email || !password) {
    console.error("❌ E2E_TEST_EMAIL 또는 E2E_TEST_PASSWORD가 없습니다.");
    process.exit(1);
  }

  fs.mkdirSync("screenshots", { recursive: true });

  console.log(`\n🔐 API로 직접 로그인 중... (${email})`);

  // Supabase Auth API로 토큰 획득
  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseKey,
    },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const err = await res.json();
    console.error(`❌ 로그인 실패: ${err.msg || err.error_description || JSON.stringify(err)}`);
    process.exit(1);
  }

  const session = await res.json();
  console.log("✅ 토큰 획득 완료");

  // Playwright 브라우저에 세션 쿠키 주입
  const browser = await chromium.launch({ headless: true });

  // Supabase SSR은 쿠키에 세션을 저장함
  // @supabase/ssr의 쿠키 형식에 맞춰 설정
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  const cookieBase = `sb-${projectRef}-auth-token`;

  // 세션 데이터를 base64로 인코딩하여 쿠키에 저장
  const sessionData = JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + session.expires_in,
    expires_in: session.expires_in,
    token_type: "bearer",
    user: session.user,
  });

  // @supabase/ssr 형식: base64- 접두사 + Base64URL 인코딩
  const base64url = Buffer.from(sessionData)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const encoded = `base64-${base64url}`;
  const CHUNK_SIZE = 3180;
  const chunks = [];
  for (let i = 0; i < encoded.length; i += CHUNK_SIZE) {
    chunks.push(encoded.slice(i, i + CHUNK_SIZE));
  }

  const cookies = chunks.map((chunk, i) => ({
    name: chunks.length === 1 ? cookieBase : `${cookieBase}.${i}`,
    value: chunk,
    domain: "localhost",
    path: "/",
    httpOnly: false,
    secure: false,
    sameSite: "Lax" as const,
    expires: Math.floor(Date.now() / 1000) + session.expires_in,
  }));

  const context = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
  });

  await context.addCookies(cookies);

  // 세션 검증
  console.log("🔍 세션 검증 중...");
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/profile`, {
    waitUntil: "networkidle",
    timeout: 10000,
  });

  if (page.url().includes("/auth/login")) {
    console.error("\n❌ 세션 주입 실패 — /profile 접근 시 로그인으로 리다이렉트됨");
    await browser.close();
    process.exit(1);
  }

  await context.storageState({ path: AUTH_FILE });
  console.log(`\n✅ 세션 저장 완료 → ${AUTH_FILE}`);
  console.log(`   쿠키 ${cookies.length}개 (${cookieBase})\n`);

  await browser.close();
}

async function manualLogin() {
  fs.mkdirSync("screenshots", { recursive: true });

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/auth/login`);

  console.log("\n========================================");
  console.log("  브라우저에서 로그인을 완료해주세요.");
  console.log("  로그인 후 메인 페이지가 보이면");
  console.log("  여기서 Enter를 누르세요.");
  console.log("========================================\n");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise<void>((resolve) => {
    rl.question("", () => { rl.close(); resolve(); });
  });

  console.log("🔍 세션 검증 중...");
  await page.goto(`${BASE_URL}/profile`, { waitUntil: "networkidle", timeout: 10000 });

  if (page.url().includes("/auth/login")) {
    console.error("\n❌ 세션이 유효하지 않습니다.\n");
    await browser.close();
    process.exit(1);
  }

  await context.storageState({ path: AUTH_FILE });
  console.log(`\n✅ 세션 저장 완료 → ${AUTH_FILE}\n`);

  await browser.close();
}

(isManual ? manualLogin : autoLogin)().catch(console.error);
