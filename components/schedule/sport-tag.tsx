import { gthrSprtLabels, type GthrSprtType } from "@/lib/validations/gathering";

/**
 * 모임 종목 태그 (캘린더 패널·리스트뷰 공용 소형 배지).
 * 알 수 없는 sprt_cd(라벨 미정의)면 렌더하지 않는다.
 */
export function SportTag({ sprtCd }: { sprtCd?: string | null }) {
  if (!sprtCd) return null;
  const label = gthrSprtLabels[sprtCd as GthrSprtType];
  if (!label) return null;
  return (
    <span className="shrink-0 rounded-full border border-border bg-secondary px-1.5 py-px text-[9px] font-medium leading-tight text-muted-foreground">
      {label}
    </span>
  );
}
