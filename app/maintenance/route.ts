import { dayjs } from "@/lib/dayjs";
import { OG_SLOGAN } from "@/lib/gathering-og";
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
 * 않아야 빌드나 정적 자산이 이상한 상황에서도 이 화면만은 뜬다. 그래서 칭호 이펙트
 * (`title-effect-gold`)를 클래스로 가져다 쓰지 않고 **같은 수법만 옮겨 적었다** —
 * `background-clip: text` + 훑고 지나가는 그라데이션.
 *
 * **로고만은 예외로 파일을 참조한다**(`/android-icon-192x192.png`, 11KB). `proxy.ts` 의
 * matcher 가 이미지 확장자를 제외하고 있어 점검 중에도 정적으로 서빙되고, 혹 못 불러와도
 * `alt` 만 남고 화면은 그대로 뜬다 — 원본 SVG 는 64KB 라 인라인으로 넣기엔 무겁다.
 *
 * 슬로건은 `OG_SLOGAN` 을 가져다 쓴다. 홈 헤더 티커·일정탭·OG 카드와 같은 상수라,
 * 문구를 바꿀 때 여기만 옛말로 남는 일이 없다.
 */

// `export const dynamic` 은 쓰지 않는다 — 이 프로젝트는 cacheComponents 모드라
// 빌드가 거부한다. 그 모드에서 라우트 핸들러는 기본이 동적이고, 아래 `Cache-Control:
// no-store` 가 응답 캐시를 막는다. 덕분에 아래 로딩 문구도 요청마다 다시 뽑힌다.

/**
 * 로딩 문구 — 실제로 무슨 작업을 하는지와 **아무 상관 없다**. 옛 게임 로딩 화면의 그것이다.
 *
 * 점검 화면은 사용자가 아무것도 못 하는 자리라, 정보를 더 얹는 것보다 기다리는 1초가
 * 덜 지루한 편이 낫다. 진짜 정보(언제 끝나는지)는 바로 위 줄이 이미 말한다.
 *
 * **우리 화면에 실제로 있는 것들로만 쓴다** — 전광판·깅스타그램·칭호·전당처럼.
 * 달리기 일반 어휘("숨을 고르는")보다 이쪽이 낫다: 진짜로 뭔가 손보는 중인 것처럼 읽혀서
 * 점검 화면에 어울리고, 우리 것이라야 농담도 통한다. 실제로 그 작업을 하는 건 아니다.
 */
const LOADING_LINES = [
  "전광판에 불을 켜는 중이에요",
  "전광판 유리를 닦는 중이에요",
  "팀 심박수를 다시 재는 중이에요",
  "심전도 파형을 고르는 중이에요",
  "접속자들을 줄 세우는 중이에요",
  "깅스타그램 사진을 닦는 중이에요",
  "깅스타그램 격자를 다시 까는 중이에요",
  "릴스 순서를 맞추는 중이에요",
  "댓글을 정리하는 중이에요",
  "칭호를 등록하는 중이에요",
  "칭호 배지에 광을 내는 중이에요",
  "프레임 반짝임을 손보는 중이에요",
  "대표 칭호를 다시 다는 중이에요",
  "프로필 카드를 닦는 중이에요",
  "등번호를 새로 붙이는 중이에요",
  "응원 불씨를 모으는 중이에요",
  "러닝 프로필을 채우는 중이에요",
  "가까운 역을 찾는 중이에요",
  "기강의 전당을 정리하는 중이에요",
  "챔피언 띠를 다리는 중이에요",
  "메달 칩에 광을 내는 중이에요",
  "UTMB 지수를 불러오는 중이에요",
  "랭킹을 다시 매기는 중이에요",
  "개인 최고기록을 줄 세우는 중이에요",
  "페이스 추이 그래프를 그리는 중이에요",
  "기록증을 스캔하는 중이에요",
  "대회 기록을 등록하는 중이에요",
  "대회 일정을 확인하는 중이에요",
  "다음 모임을 고민하는 중이에요",
  "모임 장소를 정하는 중이에요",
  "참석 버튼을 닦는 중이에요",
  "출석부를 넘기는 중이에요",
  "대기열을 정리하는 중이에요",
  "달력을 한 장 넘기는 중이에요",
  "마일리지런 거리를 세는 중이에요",
  "마일리지 배율을 맞추는 중이에요",
  "활동량을 다시 세는 중이에요",
  "회비를 정산하는 중이에요",
  "입금 내역을 맞춰보는 중이에요",
  "알림을 배달하는 중이에요",
  "푸시 알림을 포장하는 중이에요",
  "안 읽은 알림을 세는 중이에요",
  "공지사항을 붙이는 중이에요",
  "업데이트 노트를 쓰는 중이에요",
  "건의함을 비우는 중이에요",
  "오픈채팅 비밀번호를 숨기는 중이에요",
  "단톡방을 진정시키는 중이에요",
  "새로운 멤버를 모집하는 중이에요",
  "새 얼굴을 소개하는 중이에요",
  "가입 신청서를 검토하는 중이에요",
] as const;

/** 한 화면에 돌릴 문구 수 / 한 줄이 머무는 시간(초) / 줄 높이(px) */
const TICKER_COUNT = 6;
const TICKER_STEP_SEC = 5;
const TICKER_LINE_PX = 22;

/** 목록에서 서로 다른 n개를 뽑는다(Fisher-Yates 부분 셔플). 매 요청마다 순서가 달라진다. */
function pickLines(n: number): string[] {
  const pool = [...LOADING_LINES];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(n, pool.length));
}

/**
 * 세로 티커의 keyframes 를 만든다 — **CSS 만으로 돌린다(자바스크립트 없음).**
 *
 * 줄 수가 매번 달라질 수 있어 keyframes 를 문자열로 생성한다. 각 줄은 구간의 80% 동안
 * 머물고 나머지 20% 동안 위로 미끄러진다. 마지막에 첫 줄 사본으로 넘어가 이음매가 안 보인다.
 */
function rollKeyframes(n: number, linePx: number): string {
  const step = 100 / n;
  const frames: string[] = [];
  for (let i = 0; i < n; i++) {
    const start = (i * step).toFixed(3);
    const end = (i * step + step * 0.8).toFixed(3);
    frames.push(`${start}%, ${end}% { transform: translateY(-${i * linePx}px); }`);
  }
  frames.push(`100% { transform: translateY(-${n * linePx}px); }`);
  return `@keyframes roll { ${frames.join(" ")} }`;
}

const ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ESCAPE[c]);

function render(untilLabel: string | null, lines: string[]): string {
  const sub = untilLabel
    ? `${escapeHtml(untilLabel)}까지 점검 예정이에요`
    : "곧 돌아올게요";
  const dots = '<span class="dots" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span>';
  // 맨 끝에 첫 줄을 한 번 더 붙인다 — 마지막에서 처음으로 넘어갈 때 튀지 않게.
  const items = [...lines, lines[0]]
    .map((l) => `<li>${escapeHtml(l)}${dots}</li>`)
    .join("");
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>점검 중 · 기강</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #ffffff;
    --fg: #0a0a0a;
    --muted: #71717a;
    /* 검정 글자를 은빛이 훑고 지나간다 — 칭호 이펙트와 같은 수법이되 금색 대신 먹색이다.
       양 끝이 진해서 어느 순간에도 글자가 지면에 남는다(흰 배경에 흰 글자가 되지 않게). */
    --sheen: linear-gradient(100deg,
      #0a0a0a 0%, #0a0a0a 32%,
      #8a8a8a 44%, #e6e6ea 50%, #8a8a8a 56%,
      #0a0a0a 68%, #0a0a0a 100%);
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100svh;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    padding: 24px; text-align: center;
    font-family: Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    background: var(--bg); color: var(--fg);
  }
  .logo { width: 96px; height: 96px; margin-bottom: 24px; }
  /* 제목("잠시 점검 중이에요")을 걷어냈다 — 아래 티커가 "…하는 중이에요"로 이미 같은 말을
     하고 있어, 제목까지 두면 한 화면에서 두 번 말하게 된다. 그래서 안내문이 제목 자리를
     대신하고 크기도 그만큼 키운다. */
  .sub { margin: 0 0 22px; font-size: 20px; font-weight: 700; letter-spacing: -0.01em; }

  /* 세로 티커. 한 줄 높이만 보이게 잘라내고 목록을 위로 밀어 올린다. */
  .ticker { height: ${TICKER_LINE_PX}px; overflow: hidden; margin: 0 0 30px; }
  .ticker ul {
    margin: 0; padding: 0; list-style: none;
    animation: roll ${(lines.length * TICKER_STEP_SEC).toFixed(0)}s ease-in-out infinite;
  }
  .ticker li {
    height: ${TICKER_LINE_PX}px; line-height: ${TICKER_LINE_PX}px;
    font-size: 13px; color: var(--muted); white-space: nowrap;
  }
  ${rollKeyframes(lines.length, TICKER_LINE_PX)}
  .dots i { font-style: normal; opacity: 0.2; animation: dot 1.4s ease-in-out infinite; }
  .dots i:nth-child(2) { animation-delay: 0.2s; }
  .dots i:nth-child(3) { animation-delay: 0.4s; }
  @keyframes dot { 0%, 60%, 100% { opacity: 0.2; } 30% { opacity: 1; } }

  .slogan {
    margin: 0; font-size: 14px; font-weight: 900; font-style: italic;
    text-transform: uppercase; letter-spacing: 0.12em;
    background: var(--sheen);
    background-size: 250% 100%;
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    animation: sheen 7s ease-in-out infinite;
  }
  @keyframes sheen {
    0% { background-position: -200% center; }
    100% { background-position: 300% center; }
  }

  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0a0a0a; --fg: #fafafa; --muted: #a1a1aa;
      --sheen: linear-gradient(100deg,
        #fafafa 0%, #fafafa 32%,
        #8a8a8a 44%, #ffffff 50%, #8a8a8a 56%,
        #fafafa 68%, #fafafa 100%);
    }
    /* 로고가 검정 선화라 다크에서 배경에 묻힌다. 흑백 반전으로 흰 선이 된다. */
    .logo { filter: invert(1); }
  }

  @media (prefers-reduced-motion: reduce) {
    /* 움직임을 줄이는 설정이면 첫 줄 하나만 세워 둔다 — 흐르지 않는다. */
    .ticker ul { animation: none; transform: none; }
    .dots i { animation: none; opacity: 1; }
    /* 애니메이션만 끄면 그라데이션이 엉뚱한 구간에 멈춘 채 남는다. 색을 도로 채워 준다. */
    .slogan {
      animation: none;
      background: none;
      -webkit-text-fill-color: var(--fg);
      color: var(--fg);
    }
  }
</style>
</head>
<body>
  <img class="logo" src="/android-icon-192x192.png" width="96" height="96" alt="기강" />
  <p class="sub">${sub}</p>
  <div class="ticker" aria-live="off"><ul>${items}</ul></div>
  <p class="slogan">${escapeHtml(OG_SLOGAN)}</p>
</body>
</html>`;
}

async function handler(): Promise<Response> {
  const config = await readMaintenanceConfig();
  const untilLabel = formatMaintenanceUntil(config?.until ?? null, dayjs().tz("Asia/Seoul"));
  const lines = pickLines(TICKER_COUNT);

  return new Response(render(untilLabel, lines), {
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
