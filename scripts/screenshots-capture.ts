/**
 * 주요 페이지 스크린샷을 촬영하여 지정된 폴더에 저장
 *
 * 사용법:
 *   pnpm run screenshots:before   — screenshots/before/ 에 저장
 *   pnpm run screenshots:after    — screenshots/after/ 에 저장 + diff 생성
 */
import { chromium } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";

const BASE_URL = "http://localhost:3000";
const AUTH_FILE = "screenshots/auth.json";
const SCREENSHOTS_DIR = "screenshots";

// 촬영할 페이지 목록
// requiresAuth: true인 페이지는 로그인 리다이렉트 감지
const PAGES = [
  { name: "home", path: "/", requiresAuth: true },
  { name: "races", path: "/races", requiresAuth: true },
  { name: "records", path: "/records", requiresAuth: false },
  { name: "profile", path: "/profile", requiresAuth: true },
  { name: "join", path: "/join", requiresAuth: false },
  { name: "settings", path: "/settings", requiresAuth: true },
  { name: "login", path: "/auth/login", requiresAuth: false },
];

async function capture(targetDir: string) {
  if (!fs.existsSync(AUTH_FILE)) {
    console.error("❌ auth.json이 없습니다. 먼저 pnpm run screenshots:login 을 실행하세요.");
    process.exit(1);
  }

  const outDir = path.join(SCREENSHOTS_DIR, targetDir);
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: AUTH_FILE,
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
  });

  // 세션 유효성 사전 검증
  console.log("🔍 세션 검증 중...");
  const checkPage = await context.newPage();
  await checkPage.goto(`${BASE_URL}/profile`, {
    waitUntil: "networkidle",
    timeout: 10000,
  });
  const checkUrl = checkPage.url();
  await checkPage.close();

  if (checkUrl.includes("/auth/login")) {
    console.error("\n❌ 세션이 만료되었습니다. pnpm run screenshots:login 을 다시 실행하세요.\n");
    await browser.close();
    process.exit(1);
  }
  console.log("✅ 세션 유효\n");

  console.log(`📸 스크린샷 촬영 시작 → ${outDir}/\n`);

  for (const { name, path: pagePath, requiresAuth } of PAGES) {
    const page = await context.newPage();
    try {
      await page.goto(`${BASE_URL}${pagePath}`, {
        waitUntil: "networkidle",
        timeout: 15000,
      });

      // CSS 로드 + 렌더링 완료 대기
      await page.waitForLoadState("domcontentloaded");
      await page.waitForFunction(() => {
        const styles = document.querySelectorAll('link[rel="stylesheet"], style');
        return styles.length > 0 && document.fonts.ready;
      }, { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(2000);

      // 인증 필요 페이지에서 로그인으로 리다이렉트되면 경고
      const currentUrl = page.url();
      if (requiresAuth && currentUrl.includes("/auth/login")) {
        console.log(`  ⚠️  ${name} — 로그인 리다이렉트됨 (세션 문제)`);
        await page.close();
        continue;
      }

      const filePath = path.join(outDir, `${name}.png`);
      await page.screenshot({ path: filePath, fullPage: true });
      console.log(`  ✅ ${name} → ${filePath}`);
    } catch (err) {
      console.log(`  ⚠️  ${name} — 스킵 (${(err as Error).message.slice(0, 60)})`);
    }
    await page.close();
  }

  await browser.close();
  console.log(`\n✅ 촬영 완료: ${outDir}/`);
}

// CLI argument: "before" or "after"
const target = process.argv[2] || "before";
if (target !== "before" && target !== "after") {
  console.error("사용법: tsx scripts/screenshots-capture.ts <before|after>");
  process.exit(1);
}

capture(target).catch(console.error);
