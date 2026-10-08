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

/** 테두리판 — 10K 트랙의 러너 얼굴에 두르는 유니폼 색. 리터럴인 이유는 위와 같다 */
const TEAM_RING_CLASS: Record<number, string> = {
  1: "ring-chart-1",
  2: "ring-chart-2",
  3: "ring-chart-3",
  4: "ring-chart-4",
  5: "ring-chart-5",
};

export function teamRingClass(colorNo: number | null | undefined): string {
  return (colorNo != null && TEAM_RING_CLASS[colorNo]) || "ring-border";
}

/**
 * SVG(recharts) 선 색 — 클래스가 아니라 CSS 변수 값이 필요하다.
 *
 * `chart-*`는 globals.css 의 `@theme inline`이라 `--color-chart-N`이 런타임 변수로 나오지 않는다 —
 * 그래서 chart-N 이 가리키는 원본(`--sport-*`)을 직접 읽는다. **매핑은 globals.css 의 chart-1~5 와 같아야 한다**
 * (1 로드 · 2 철인 · 3 사이클 · 4 트레일 · 5 울트라). 한쪽만 바꾸면 순위표 점과 그래프 선의 색이 갈린다.
 */
const TEAM_COLOR_VAR: Record<number, string> = {
  1: "var(--sport-road-run)",
  2: "var(--sport-triathlon)",
  3: "var(--sport-cycling)",
  4: "var(--sport-trail-run)",
  5: "var(--sport-ultra)",
};

export function teamColorVar(colorNo: number | null | undefined): string {
  return (colorNo != null && TEAM_COLOR_VAR[colorNo]) || "var(--muted-foreground)";
}

/** 팀 색 점 — 색만으로 팀을 가르지 않도록 항상 팀 이름 옆에 놓는다 */
export function PbTeamDot({ colorNo, className }: { colorNo: number | null | undefined; className?: string }) {
  return <span aria-hidden className={cn("size-3 shrink-0 rounded-full", teamColorClass(colorNo), className)} />;
}
