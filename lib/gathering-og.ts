import type { Metadata } from "next";

import { siteContent } from "@/config";
import { dayjs, formatKST } from "@/lib/dayjs";
import { gthrSprtLabels, type GthrSprtType } from "@/lib/validations/gathering";

/**
 * 모임 딥링크(`/schedule?gthr=`)의 OG 카드 — 표시 규칙.
 *
 * 카톡에 링크를 붙이면 지금까지는 모든 모임이 같은 미리보기(루트 metadata + 정적 PNG)를
 * 냈다. 여기가 모임별 제목·설명·이미지의 **문구·색을 정하는 정본**이고,
 * `app/(main)/schedule/page.tsx`의 `generateMetadata`와 `app/api/og/gathering/route.tsx`가
 * 둘 다 이 파일을 쓴다 — 텍스트와 이미지가 서로 다른 말을 하지 않게.
 *
 * 설계 기록: `docs/design/2026-09-21-모임별-og-카드.md` (시안 C안 — 종목색 날짜 블록).
 *
 * **D-day는 싣지 않는다.** 카카오가 URL별로 스크랩 결과를 오래 캐시해서, 스크랩 시점의
 * `D-3`이 당일에도 그대로 보인다. 날짜·요일이면 충분하고 틀리지 않는다.
 */

export type GatheringOgSource = {
  gthr_id: string;
  short_id: string | null;
  gthr_nm: string;
  loc_txt: string | null;
  stt_at: string;
  sprt_cd: string | null;
  upd_at: string | null;
};

/**
 * `app/globals.css` 토큰을 sRGB hex로 굳힌 값 — Satori/resvg는 `oklch()`를 못 읽는다.
 * 토큰이 바뀌면 여기도 같이 바꾼다(변환: oklch → linear sRGB → gamma).
 */
export const OG_COLORS = {
  background: "#ffffff",
  foreground: "#0a0a0a",
  primary: "#3c82f6",
  mutedForeground: "#737373",
  board: "#111419",
} as const;

export type OgSportBlock = { label: string; bg: string; fg: string };

/**
 * 모임 종목(`gthr_mst.sprt_cd`) → 날짜 블록 색.
 * 대회 종목 토큰(`--sport-*`)을 빌려 쓴다 — 수영은 철인 계열 청록, 하이록스는 울트라 주황.
 * 밝은 색(트레일·하이록스) 위엔 흰 글자가 안 읽혀(대비 2.2:1) board 색 글자를 올린다.
 */
const SPORT_BLOCK: Record<GthrSprtType, Omit<OgSportBlock, "label">> = {
  running: { bg: "#e2644d", fg: "#ffffff" }, // --sport-road-run
  trail_run: { bg: "#dca83e", fg: OG_COLORS.board }, // --sport-trail-run
  cycling: { bg: "#0b3946", fg: "#ffffff" }, // --sport-cycling
  swimming: { bg: "#017b6a", fg: "#ffffff" }, // --sport-triathlon
  hyrox: { bg: "#f4891b", fg: OG_COLORS.board }, // --sport-ultra
};

const DEFAULT_BLOCK: OgSportBlock = { label: "모임", bg: OG_COLORS.primary, fg: "#ffffff" };

export function getGatheringOgSport(sprtCd: string | null | undefined): OgSportBlock {
  if (!sprtCd || !(sprtCd in SPORT_BLOCK)) return DEFAULT_BLOCK;
  const key = sprtCd as GthrSprtType;
  return { label: gthrSprtLabels[key], ...SPORT_BLOCK[key] };
}

const MONTH_ABBR = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export type GatheringOgText = {
  /** 모임 제목 그대로 */
  title: string;
  /** `9월 24일 (수) 오후 8:00 · 뚝섬유원지역 3번 출구` — og:description */
  description: string;
  /** `9월 24일 (수) 오후 8:00` */
  whenLabel: string;
  /** `오후 8:00` — 이미지 시각 줄 */
  timeLabel: string;
  /** `SEP` — 날짜 블록 상단(영문 약어, Oswald) */
  month: string;
  /** `24` */
  day: string;
  /** `수요일` */
  weekday: string;
  location: string | null;
};

/**
 * 시각은 전부 `formatKST` — `stt_at`은 timestamptz라 서버(UTC)에서 `dayjs(v).format()`을
 * 쓰면 KST 00~09시 모임이 전날로 찍힌다. 형식은 다이얼로그의 카톡 공유 본문(`A h:mm`)과 같다.
 */
export function buildGatheringOgText(src: GatheringOgSource): GatheringOgText {
  const location = src.loc_txt?.trim() || null;
  const whenLabel = formatKST(src.stt_at, "M월 D일 (ddd) A h:mm");
  const monthIndex = Number(formatKST(src.stt_at, "M")) - 1;

  return {
    title: src.gthr_nm,
    description: location ? `${whenLabel} · ${location}` : whenLabel,
    whenLabel,
    timeLabel: formatKST(src.stt_at, "A h:mm"),
    month: MONTH_ABBR[monthIndex] ?? "",
    day: formatKST(src.stt_at, "D"),
    weekday: formatKST(src.stt_at, "dddd"),
    location,
  };
}

/**
 * 이미지 URL. `v`는 `upd_at`이라 모임을 고치면 URL이 바뀌어 CDN 캐시를 자연히 비켜 간다 —
 * 라우트는 그래서 응답을 길게 캐시해도 된다.
 */
export function gatheringOgImagePath(src: GatheringOgSource): string {
  const ref = src.short_id ?? src.gthr_id;
  const version = src.upd_at ? dayjs(src.upd_at).unix() : 0;
  return `/api/og/gathering?g=${encodeURIComponent(ref)}&v=${version}`;
}

/**
 * `/schedule?gthr=` 지면의 metadata.
 *
 * `openGraph`는 루트와 **깊은 병합이 안 된다**(Next 규칙: 페이지가 정의하면 통째로 덮는다)
 * — siteName·locale·type을 여기서 다시 적는 이유. canonical은 `/schedule` 고정이다:
 * `?gthr=` 변형마다 별개 문서가 되면 「동일 제목 다수」가 재발한다. OG는 canonical과 무관하게 읽힌다.
 */
export function buildGatheringMetadata(src: GatheringOgSource): Metadata {
  const text = buildGatheringOgText(src);
  const image = {
    url: gatheringOgImagePath(src),
    width: 1200,
    height: 630,
    alt: `${text.title} — ${text.whenLabel}`,
  };

  return {
    title: text.title,
    description: text.description,
    alternates: { canonical: "/schedule" },
    openGraph: {
      type: "website",
      siteName: siteContent.brand.fullName,
      locale: "ko_KR",
      title: text.title,
      description: text.description,
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: text.title,
      description: text.description,
      images: [image.url],
    },
  };
}
