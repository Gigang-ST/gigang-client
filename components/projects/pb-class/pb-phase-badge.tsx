import { cn } from "@/lib/utils";

/**
 * 훈련 단계(phase_nm) → 톤. 색은 토큰만 쓰고, 단계 이름을 항상 글자로 같이 적는다(색만으로 구분하지 않는다).
 *
 * 12주가 「기초 → 점검 → 강화 → 특화 → 마무리」로 짙어지는 흐름이 훈련표를 훑을 때 보이게 하려는 것.
 * 측정은 단계가 아니라 **시험 날**이라 유일하게 칠한 배지(반전)로 세운다 — 13줄 중 두 줄이 튀어야 한다.
 * Tailwind 는 클래스를 문자열 그대로 스캔하므로 조립하지 않고 통째로 적는다.
 */
const PHASE_TONE: Record<string, string> = {
  측정: "bg-foreground text-background",
  기초: "bg-success/10 text-success",
  점검: "bg-warning/15 text-warning",
  강화: "bg-sport-road-run/15 text-sport-road-run",
  특화: "bg-info/10 text-info",
  마무리: "bg-primary/10 text-primary",
};

/** 관리자가 단계 이름을 새로 지어도 화면이 깨지지 않게 — 모르는 단계는 중립 톤 */
const FALLBACK_TONE = "bg-secondary text-muted-foreground";

export function PbPhaseBadge({ phaseNm, className }: { phaseNm: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-md px-1.5 text-[11px] font-semibold leading-none",
        PHASE_TONE[phaseNm] ?? FALLBACK_TONE,
        className,
      )}
    >
      {phaseNm}
    </span>
  );
}
