import { cn } from "@/lib/utils";

/**
 * 게임팀 색 번호(1~5) → 토큰 클래스.
 *
 * Tailwind 는 클래스 이름을 **문자열 그대로** 스캔해서 CSS 를 만든다 — `bg-chart-${n}` 처럼
 * 조립하면 빌드에 그 클래스가 안 실려 색이 조용히 사라진다. 그래서 리터럴로 전부 적는다.
 * 색 미지정(null)은 muted 로 떨어진다(팀은 있는데 색만 안 정한 상태).
 */
const TEAM_COLOR_CLASS: Record<number, string> = {
  1: "bg-chart-1",
  2: "bg-chart-2",
  3: "bg-chart-3",
  4: "bg-chart-4",
  5: "bg-chart-5",
};

export function teamColorClass(colorNo: number | null | undefined): string {
  return (colorNo != null && TEAM_COLOR_CLASS[colorNo]) || "bg-muted";
}

/** 팀 색 점 — 색만으로 팀을 가르지 않도록 항상 팀 이름 옆에 놓는다 */
export function PbTeamDot({ colorNo, className }: { colorNo: number | null | undefined; className?: string }) {
  return <span aria-hidden className={cn("size-3 shrink-0 rounded-full", teamColorClass(colorNo), className)} />;
}
