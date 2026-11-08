import type { SVGProps } from "react";

/**
 * 전당 종목 탭 아이콘 (#645).
 *
 * lucide와 같은 문법(24 격자 · 선 2 · 둥근 끝 · `currentColor`)으로 직접 그렸다 — lucide엔 러너·철인·
 * 하이록스 픽토그램이 없고, 한 줄에 서는 넷이 한 계열로 읽혀야 해서 넷 다 같은 손으로 그린다.
 * 색은 글자를 따라간다(선택 = foreground, 나머지 = muted). 공식 로고(IRONMAN·HYROX)는 상표라 쓰지 않는다.
 */
function Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={18}
      height={18}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  );
}

/** 러닝 — 달리는 사람 */
export function RunningIcon() {
  return (
    <Icon>
      <circle cx="15" cy="4" r="2" />
      <path d="M12 21l1.5-5-3-3 1.5-5" />
      <path d="M7 10l3-2h4l2 3 3 1" />
      <path d="M10.5 13l-2 3H5" />
    </Icon>
  );
}

/** 트레일러닝 — 봉우리와 오르는 길 */
export function TrailIcon() {
  return (
    <Icon>
      <path d="M2 20l7-12 4 6 3-4 6 10z" />
      <path d="M9 20c1-2 3-2.5 4-4.5" strokeDasharray="1.5 2.5" />
    </Icon>
  );
}

/** 철인3종 — 위부터 달리기(머리)·자전거(바퀴)·수영(물결) */
export function TriathlonIcon() {
  return (
    <Icon>
      <circle cx="15.5" cy="3.5" r="1.5" />
      <circle cx="6" cy="13" r="3" />
      <circle cx="18" cy="13" r="3" />
      <path d="M6 13l4-5h4l4 5M10 8l2 5h-6M12.5 6.5L14 8" />
      <path d="M2 21c1.7-1.3 3.3-1.3 5 0s3.3 1.3 5 0 3.3-1.3 5 0 3.3 1.3 5 0" />
    </Icon>
  );
}

/** 하이록스 — 미는 썰매 옆모습(앞이 들린 썰매날 + 원판 + 뒤쪽 손잡이 기둥) */
export function HyroxIcon() {
  return (
    <Icon>
      <path d="M3 19h14a3 3 0 0 0 3-3" />
      <rect x="5" y="13" width="11" height="3" rx="1" />
      <circle cx="11" cy="9.5" r="2.5" />
      <path d="M5 13V5h3" />
    </Icon>
  );
}
