import { cn } from "@/lib/utils";

import type { ReactNode } from "react";

/**
 * 기강이야기 존 헤더 — 괘선 + 영문 라벨 + 한국어 리드문을 한 곳에서.
 *
 * 같은 패턴이 존마다 손으로 복제되며 여백·행간이 조금씩 어긋났다(leading-snug 유무,
 * 리드문 윗 여백 10px vs 14px). 헤더의 간격·서체는 여기서만 정한다 — "선↔리드문
 * 여백을 줄이자" 같은 조정이 존 전수 수정이 아니라 이 파일 한 줄 수정이 되게.
 */
export function StoryZoneHeader({
  label,
  lead,
  action,
  leadAction,
  bleed = false,
}: {
  /** 영문 섹션 라벨 — 신문의 면 이름 */
  label: string;
  /** 라벨 아래 한국어 리드문 한 줄. 데이터 나열을 기사로 바꾸는 장치 */
  lead?: ReactNode;
  /** 라벨 우측 슬롯 — 설명이 필요한 지표는 여기에 `HelpTip`을 단다 */
  action?: ReactNode;
  /** 리드문 우측 슬롯("내 활동 내역" 링크 등) — 리드와 같은 줄 양끝 */
  leadAction?: ReactNode;
  /** 존 본문이 화면 전폭(가로 스크롤 등)이라 섹션에 px-6이 없으면 true —
   *  헤더가 자체적으로 지면 좌우 여백(mx-6/px-6)을 잡는다 */
  bleed?: boolean;
}) {
  return (
    <>
      <div
        className={cn(
          "rule-section flex items-center justify-between gap-2 pb-2",
          bleed && "mx-6",
        )}
      >
        <h2 className="font-numeric text-[11px] font-medium uppercase tracking-[0.2em] text-foreground">
          {label}
        </h2>
        {/* 괘선 높이가 물음표 히트영역(32px)에 밀리지 않게 음수 마진으로 흡수한다.
            래퍼가 **flex여야** 물음표가 라벨과 같은 세로 중심에 온다: HelpTip 버튼은
            inline-flex라 블록 래퍼 안에서는 인라인 요소로 줄상자에 앉는데, 그러면 줄상자가
            baseline 아래 descender 몫(~5px)까지 확보해 래퍼가 버튼보다 그만큼 커지고
            버튼이 위로 뜬다. flex는 자식을 블록화해 줄상자를 없앤다. */}
        {action && <div className="-my-2 flex items-center">{action}</div>}
      </div>
      {lead && (
        <div
          className={cn(
            "flex items-baseline justify-between gap-3 pt-1.5",
            bleed && "px-6",
          )}
        >
          <p className="min-w-0 text-[15px] leading-snug text-muted-foreground">
            {lead}
          </p>
          {leadAction}
        </div>
      )}
    </>
  );
}
