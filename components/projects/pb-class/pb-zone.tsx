import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { StoryZoneHeader } from "@/components/story/story-zone-header";

/**
 * PB 클래스 화면의 섹션 한 칸 — 괘선 + 영문 라벨 + 한국어 리드문(기강이야기·돌아보기와 같은 어법).
 *
 * 예전엔 섹션마다 `SectionHeader`(라벨만)를 썼는데, 「이 칸이 뭘 말하는지」를 숫자만 보고 맞혀야 했다.
 * 리드문 한 줄이 그 답을 먼저 말한다. 헤더 간격·서체는 `StoryZoneHeader`가 정본이라 여기서 다시
 * 정하지 않고, 본문 위 여백(mt-4)만 이 파일 한 곳에서 정한다 — 섹션마다 달라지면 리듬이 깨진다.
 */
export function PbZone({
  label,
  lead,
  action,
  id,
  className,
  children,
}: {
  /** 영문 라벨 — 신문의 면 이름 */
  label: string;
  /** 라벨 아래 한국어 한 줄 */
  lead?: ReactNode;
  /** 라벨 우측 슬롯 — 보통 `HelpTip` */
  action?: ReactNode;
  /** 목차 앵커 */
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={cn("flex scroll-mt-6 flex-col", className)}>
      <StoryZoneHeader label={label} lead={lead} action={action} />
      <div className="mt-4 flex flex-col gap-3">{children}</div>
    </section>
  );
}
