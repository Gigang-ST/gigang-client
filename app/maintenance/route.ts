import { dayjs } from "@/lib/dayjs";
import { formatMaintenanceUntil } from "@/lib/maintenance";
import { readMaintenanceConfig } from "@/lib/maintenance-config";

/**
 * 점검 화면. `proxy.ts` 가 여기로 rewrite 한다.
 *
 * **페이지(`page.tsx`)가 아니라 Route Handler인 이유는 상태 코드다.** `NextResponse.rewrite`
 * 는 상태를 못 바꾸므로 페이지로 두면 200 이 나가고, 카톡 링크 미리보기·검색 크롤러가
 * "점검중"을 진짜 내용으로 캐시한다. 여기서는 **503 + Retry-After** 를 정확히 줄 수 있다.
 *
 * HTML 을 인라인으로 쓰는 것도 같은 이유다 — 앱 CSS 번들·폰트·디자인 시스템에 의존하지
 * 않아야 빌드나 정적 자산이 이상한 상황에서도 이 화면만은 뜬다.
 */

// `export const dynamic` 은 쓰지 않는다 — 이 프로젝트는 cacheComponents 모드라
// 빌드가 거부한다. 그 모드에서 라우트 핸들러는 기본이 동적이고, 아래 `Cache-Control:
// no-store` 가 응답 캐시를 막는다.

const ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ESCAPE[c]);

function render(untilLabel: string | null): string {
  const sub = untilLabel
    ? `${escapeHtml(untilLabel)}까지 점검 예정이에요`
    : "곧 돌아올게요";
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>점검 중 · 기강</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100svh;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 12px; padding: 24px; text-align: center;
    font-family: Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    background: #ffffff; color: #0a0a0a;
  }
  h1 { margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.01em; }
  p  { margin: 0; font-size: 15px; color: #71717a; }
  .mark { font-size: 12px; font-weight: 600; letter-spacing: 0.18em; color: #a1a1aa; margin-bottom: 8px; }
  @media (prefers-color-scheme: dark) {
    body { background: #0a0a0a; color: #fafafa; }
    p { color: #a1a1aa; }
    .mark { color: #52525b; }
  }
</style>
</head>
<body>
  <div class="mark">GIGANG</div>
  <h1>잠시 점검 중이에요</h1>
  <p>${sub}</p>
</body>
</html>`;
}

async function handler(): Promise<Response> {
  const config = await readMaintenanceConfig();
  const untilLabel = formatMaintenanceUntil(config?.until ?? null, dayjs().tz("Asia/Seoul"));

  return new Response(render(untilLabel), {
    status: 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      // 크롤러·브라우저에 "10분 뒤 다시 와라" — 삭제된 페이지로 오해하지 않게.
      "Retry-After": "600",
    },
  });
}

// 점검 중엔 서버 액션(POST)도 이리로 온다 — GET 만 두면 405 가 나가 화면이 안 뜬다.
export { handler as GET, handler as POST };
