import { parseEventTime } from "@/lib/dayjs";

/**
 * 일정 탭 헤더 가운데에 찍는 팀 얼굴 — 창설일 줄(`Since 2024.04.23`)과 슬로건 줄.
 * 값은 팀 설정(`brand.founded_dt` · `brand.slogan`)에서 오고, 없는 줄은 안 그린다(다른 팀 문구가 새지 않게).
 */
export type HeaderBrand = {
  /** 화면에 찍을 날짜 글자(`2024.04.23`). 없으면 창설일 줄을 안 그린다 */
  since: string | null;
  slogan: string | null;
};

/** 그릴 줄이 하나라도 있나 — 둘 다 없으면 헤더 티커가 슬로건 면으로 넘어가지 않는다(빈 면이 굴러오지 않게) */
export function hasHeaderBrand(brand: HeaderBrand): boolean {
  return Boolean(brand.since || brand.slogan);
}

/** 팀 설정 두 값 → 헤더에 넘길 모양. 날짜는 date 값이라 KST 로 읽어 찍는다(서버가 UTC 라도 하루 밀리지 않게) */
export function buildHeaderBrand(foundedDt: string | null, slogan: string | null): HeaderBrand {
  return {
    since: foundedDt ? parseEventTime(foundedDt).format("YYYY.MM.DD") : null,
    slogan,
  };
}
