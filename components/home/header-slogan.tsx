/**
 * 일정 탭 헤더 가운데 슬로건 — 본 헤더(`HeaderTicker`)와 로딩 스켈레톤(`HomeHeaderSkeleton`)이
 * **같은 컴포넌트**를 그린다.
 *
 * 예전엔 두 곳이 각자 그렸는데, 스켈레톤 쪽이 어디에도 정의되지 않은 CSS 변수
 * (`--text-slogan-eyebrow` 등)를 읽어 브라우저 기본 16px로 떨어졌다. 그래서 진입할 때마다
 * 슬로건이 16px로 떴다가 6px·13px로 줄어들며 헤더가 한 번 튀었다 — 스켈레톤이 막으려던
 * 바로 그 현상이다. 크기를 바꿀 땐 여기 하나만 고친다.
 */
export function HeaderSlogan() {
  return (
    <>
      <p className="font-sans text-[6px] uppercase tracking-[0.15em] text-muted-foreground">
        Since 2024.04.23
      </p>
      <p className="font-sans text-[13px] font-black italic uppercase leading-tight tracking-[-0.03em] text-foreground">
        No time to be weak
      </p>
    </>
  );
}
