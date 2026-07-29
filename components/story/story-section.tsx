"use client";

import { useState } from "react";

import { StoryZoneHeader } from "@/components/story/story-zone-header";

/**
 * 기사 섹션 — 영문 라벨 + 한국어 리드문 + 괘선, 그리고 "더보기" 접기.
 *
 * 존마다 기본 노출 개수와 최대 개수가 다르지만(새 얼굴 3, 기록 3→10, 랭킹 5→10)
 * "처음엔 조금만 보여주고 눌러야 펼친다"는 규칙은 같아서 여기 한 곳에 둔다.
 * 접힌 항목은 렌더 자체를 하지 않는다 — 아래 섹션들이 화면 밖으로 밀려나면 안 되므로.
 */
export function StorySection<T>({
  label,
  lead,
  items,
  initial,
  max,
  unit = "건",
  headerAction,
  leadAction,
  children,
}: {
  /** 영문 섹션 라벨 — 신문의 면 이름 */
  label: string;
  /** 라벨 아래 한국어 리드문 한 줄. 데이터 나열을 기사로 바꾸는 장치 */
  lead?: string;
  items: T[];
  /** 접힌 상태에서 보여줄 개수 */
  initial: number;
  /** 펼쳤을 때 최대 개수 */
  max: number;
  /** 더보기 문구의 단위 ("명" / "건") */
  unit?: string;
  /** 라벨 우측 슬롯 — 설명이 필요한 지표는 여기에 `HelpTip`을 단다 */
  headerAction?: React.ReactNode;
  /** 리드문 우측 슬롯("내 활동 내역" 링크 등) — 리드와 같은 줄 양끝 */
  leadAction?: React.ReactNode;
  children: (items: T[]) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  if (items.length === 0) return null;

  const capped = items.slice(0, max);
  const shown = open ? capped : capped.slice(0, initial);
  const hidden = capped.length - initial;

  return (
    <section className="flex flex-col px-6">
      <StoryZoneHeader
        label={label}
        lead={lead}
        action={headerAction}
        leadAction={leadAction}
      />

      <div className="pt-1">{children(shown)}</div>

      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="mt-1 self-start py-2 font-numeric text-[11px] uppercase tracking-[0.14em] text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {open ? (
            "− 접기"
          ) : (
            <>
              + {hidden}
              {unit} 더보기
            </>
          )}
        </button>
      )}
    </section>
  );
}
