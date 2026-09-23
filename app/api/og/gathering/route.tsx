import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";
import { NextResponse, type NextRequest } from "next/server";

import { buildGatheringOgText, getGatheringOgSport, OG_COLORS, OG_SLOGAN } from "@/lib/gathering-og";
import { getCachedGatheringOg } from "@/lib/queries/gathering-og";
import { getRequestTeamContext } from "@/lib/queries/request-team";

/**
 * 모임 OG 이미지 — `/api/og/gathering?g=<short_id|uuid>&v=<upd_at>`.
 *
 * `opengraph-image.tsx` 파일 컨벤션은 `searchParams`를 못 받아서 라우트 핸들러다.
 * 레이아웃은 `docs/design/2026-09-21-모임-og-카드-시안.html`의 C안 — 왼쪽 종목색 날짜 블록,
 * 오른쪽 제목·시각·장소. 카톡 썸네일은 실제로 246px 폭이라 작은 글씨는 안 읽히고, 이 이미지의
 * 역할은 "무슨 벙인지 0.2초에 감 잡게" 하는 것까지다 — 정보는 og:title/description이 나른다.
 *
 * Satori 제약(스타일 실수 방지): flexbox만(grid 없음) · 자식이 둘 이상인 div는 `display:flex`
 * 필수 · `oklch()` 불가(hex만) · 줄 자르기는 `display:block` + `lineClamp` · 폰트는 ttf/otf/woff
 * (woff2 불가 — 그래서 `app/fonts/og/`에 서브셋을 따로 둔다).
 */

const SIZE = { width: 1200, height: 630 } as const;

/**
 * 폰트는 요청과 무관하니 한 번만 읽어 인스턴스 안에서 돌려쓴다(Fluid compute가 인스턴스를
 * 재사용한다). `process.cwd()` + 리터럴 경로는 output file tracing이 따라가는 형태다.
 *
 * Pretendard는 KS X 1001 한글 2,350자 + 라틴·문장부호 서브셋(무게당 ~410KB), Oswald는
 * 라틴만(23KB). 생성 스크립트·범위는 `app/fonts/og/README.md`.
 */
const FONT_DIR = join(process.cwd(), "app", "fonts", "og");
type ImageResponseFonts = NonNullable<ConstructorParameters<typeof ImageResponse>[1]>["fonts"];
let fontsPromise: Promise<ImageResponseFonts> | null = null;

function loadFonts() {
  fontsPromise ??= Promise.all([
    readFile(join(FONT_DIR, "pretendard-bold.subset.otf")),
    readFile(join(FONT_DIR, "pretendard-extrabold.subset.otf")),
    readFile(join(FONT_DIR, "oswald-500.subset.ttf")),
    readFile(join(FONT_DIR, "oswald-700.subset.ttf")),
  ]).then(([pBold, pXBold, oMed, oBold]) => [
    { name: "Pretendard", data: pBold, weight: 700, style: "normal" },
    { name: "Pretendard", data: pXBold, weight: 800, style: "normal" },
    { name: "Oswald", data: oMed, weight: 500, style: "normal" },
    { name: "Oswald", data: oBold, weight: 700, style: "normal" },
  ]);
  return fontsPromise;
}

/** 모임이 없거나(삭제·오타) 그리기에 실패하면 사이트 기본 OG로 물러난다 — 카드에 이미지 칸이 비는 것보단 낫다 */
function fallback(req: NextRequest) {
  return NextResponse.redirect(new URL("/opengraph-image.png", req.url), {
    status: 302,
    headers: { "Cache-Control": "public, max-age=60, s-maxage=300" },
  });
}

type CardProps = {
  text: ReturnType<typeof buildGatheringOgText>;
  sport: ReturnType<typeof getGatheringOgSport>;
};

/** 1200×630 카드 본체. try/catch 밖에서 element로 만들어 둔다(react-hooks/error-boundaries). */
function GatheringCard({ text, sport }: CardProps) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        backgroundColor: OG_COLORS.background,
        color: OG_COLORS.foreground,
        fontFamily: "Pretendard",
      }}
    >
      {/* ── 날짜 블록 — board(검정). 종목은 오른쪽 칩이 말한다 ── */}
      <div
        style={{
          width: 372,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: OG_COLORS.board,
          color: OG_COLORS.boardForeground,
        }}
      >
        <div
          style={{
            fontFamily: "Oswald",
            fontWeight: 500,
            fontSize: 30,
            letterSpacing: "0.24em",
            opacity: 0.85,
          }}
        >
          {text.month}
        </div>
        <div
          style={{
            fontFamily: "Oswald",
            fontWeight: 700,
            fontSize: 186,
            lineHeight: 0.92,
            marginTop: 4,
          }}
        >
          {text.day}
        </div>
        <div
          style={{
            fontWeight: 700,
            fontSize: 30,
            letterSpacing: "0.06em",
            opacity: 0.9,
            marginTop: 12,
          }}
        >
          {text.weekday}
        </div>
      </div>

      {/* ── 본문 ── */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          padding: "56px 68px 64px",
        }}
      >
        {/* 슬로건 — 홈 헤더와 같은 어법(black · italic · uppercase). 이탤릭 폰트가 없어 skew로 기울인다 */}
        <div
          style={{
            fontWeight: 800,
            fontSize: 22,
            letterSpacing: "-0.03em",
            textTransform: "uppercase",
            transform: "skewX(-10deg)",
            color: OG_COLORS.foreground,
            marginBottom: 22,
          }}
        >
          {OG_SLOGAN}
        </div>
        <div
          style={{
            display: "flex",
            alignSelf: "flex-start",
            fontWeight: 700,
            fontSize: 21,
            padding: "9px 20px",
            borderRadius: 99,
            backgroundColor: sport.bg,
            color: sport.fg,
            marginBottom: 22,
          }}
        >
          {sport.label}
        </div>
        <div
          style={{
            display: "block",
            lineClamp: 3,
            fontWeight: 800,
            fontSize: 66,
            lineHeight: 1.17,
            letterSpacing: "-0.035em",
          }}
        >
          {text.title}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, fontWeight: 700, fontSize: 32 }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
            <span>{text.timeLabel}</span>
          </div>
          {text.location && (
            <div style={{ display: "flex", alignItems: "center", gap: 16, fontWeight: 700, fontSize: 32 }}>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0116 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <span
                style={{
                  display: "block",
                  lineClamp: 1,
                  maxWidth: 640,
                }}
              >
                {text.location}
              </span>
            </div>
          )}
        </div>
        <div
          style={{
            fontFamily: "Oswald",
            fontWeight: 500,
            fontSize: 20,
            letterSpacing: "0.24em",
            color: OG_COLORS.mutedForeground,
            marginTop: 34,
          }}
        >
          GIGANG
        </div>
      </div>
    </div>
  );
}

export async function GET(req: NextRequest) {
  const ref = req.nextUrl.searchParams.get("g");
  if (!ref) return fallback(req);

  const { teamId } = await getRequestTeamContext();
  const src = await getCachedGatheringOg(ref, teamId);
  if (!src) return fallback(req);

  const element = (
    <GatheringCard text={buildGatheringOgText(src)} sport={getGatheringOgSport(src.sprt_cd)} />
  );

  try {
    const fonts = await loadFonts();
    return new ImageResponse(element, {
      ...SIZE,
      fonts,
      headers: {
        // `v`(upd_at)가 URL에 박혀 있어 내용이 바뀌면 URL도 바뀐다 — 길게 캐시해도 된다.
        "Cache-Control": "public, max-age=86400, s-maxage=31536000, immutable",
      },
    });
  } catch (e) {
    console.error("[og/gathering] 이미지 생성 실패", e instanceof Error ? e.message : e);
    return fallback(req);
  }
}
