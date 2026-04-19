/**
 * 종목 코드(`comp_sprt_cd`)별 뱃지용 Tailwind 클래스.
 * 공통코드 `cd_nm`과 별도로, 기존 스포츠 칩 색을 유지한다.
 */
export function sprtCdChipClassName(sprtCd: string | null | undefined): string {
  if (!sprtCd?.trim()) return "bg-secondary text-secondary-foreground";
  const k = sprtCd.trim().toLowerCase();
  const map: Record<string, string> = {
    road_run: "bg-sport-road-run text-foreground",
    ultra: "bg-sport-ultra text-foreground",
    trail_run: "bg-sport-trail-run text-foreground",
    triathlon: "bg-sport-triathlon text-foreground",
    cycling: "bg-sport-cycling text-white",
  };
  return map[k] ?? "bg-secondary text-secondary-foreground";
}
