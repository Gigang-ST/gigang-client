import type { TitleDescVisibility } from "@/components/common/title-badge";

/** 카드 1줄에 해당하는 (종목×거리) 최고기록 */
export type CardBestRecord = {
  sport: string;
  evt: string;
  rec_time_sec: number;
  race_nm: string | null;
  race_dt: string | null;
};

/** card_featured 에 저장되는 선택 키 */
export type CardFeaturedKey = { sport: string; evt: string };

/** get_public_member_card RPC 반환 형태 */
export type MemberCardData = {
  mem_nm: string;
  avatar_url: string | null;
  badge_effect: string;
  frame_cd: string;
  card_featured: CardFeaturedKey[] | null;
  primary_title: {
    ttl_nm: string;
    ttl_desc: string | null;
    desc_visibility: TitleDescVisibility;
  } | null;
  best_records: CardBestRecord[];
};

export const SPORT_LABEL: Record<string, string> = {
  road_run: "로드",
  ultra: "울트라",
  trail_run: "트레일",
  triathlon: "철인",
  cycling: "사이클",
};

/** 종목 색 점 (DESIGN.md sport 토큰) */
export const SPORT_DOT_CLASS: Record<string, string> = {
  road_run: "bg-sport-road-run",
  ultra: "bg-sport-ultra",
  trail_run: "bg-sport-trail-run",
  triathlon: "bg-sport-triathlon",
  cycling: "bg-sport-cycling",
};

export function sportLabel(sport: string): string {
  return SPORT_LABEL[sport] ?? sport;
}

export function cardFeaturedKey(r: { sport: string; evt: string }): string {
  return `${r.sport}__${r.evt}`;
}

/**
 * 선택(featured)에 따라 카드에 표시할 기록을 추린다.
 * featured 가 null/빈배열이면 보유 기록 전부(기본값).
 * featured 가 있으면 선택 순서를 보존하고, 더 이상 없는 기록은 제외한다.
 */
export function resolveCardRecords(
  all: CardBestRecord[],
  featured: CardFeaturedKey[] | null,
): CardBestRecord[] {
  if (!featured || featured.length === 0) return all;
  const byKey = new Map(all.map((r) => [cardFeaturedKey(r), r]));
  return featured
    .map((f) => byKey.get(cardFeaturedKey(f)))
    .filter((r): r is CardBestRecord => Boolean(r));
}

/** 저장용 JPG 파일명. 한글/숫자/-/_ 외 문자는 제거 */
export function buildCardFilename(name: string, year: number): string {
  const safe = name.replace(/[^\p{L}\p{N}_-]/gu, "") || "runner";
  return `기강카드_${safe}_${year}.jpg`;
}
