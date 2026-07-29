"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { pileAvatars } from "@/lib/actv-pile";
import { cn } from "@/lib/utils";

import { Avatar } from "@/components/common/avatar";

import type { StoryActvRankEntry } from "@/lib/queries/story-feed";

/**
 * 활동량 무더기 — 이번 달 활동량이 있는 크루원 **전원**을 점수에 비례하는 크기로 쌓는다.
 *
 * 순위 목록(1위 2위 3위…)을 대신한다. 목록은 정확하지만 재미가 없고, 무엇보다 상위
 * 몇 명만 보이고 나머지는 "더보기" 뒤에 숨어 **이만큼 많은 사람이 뛰었다**는 사실이
 * 전달되지 않았다. 크기 하나로 격차를 말하고, 개수로 참여를 말한다.
 *
 * 등수·점수 텍스트를 얹지 않는다: 숫자를 다시 읽게 하면 목록으로 돌아가는 셈이고,
 * 66개에 숫자를 붙이면 읽을 수도 없다. 정확한 수치는 눌렀을 때 프로필 카드가 답한다.
 *
 * 배치는 `lib/actv-pile.ts`의 결정적 패킹이라 매 프레임 물리를 돌리지 않는다 —
 * 66개 시뮬레이션은 모바일에서 비싸고, 매번 자리가 바뀌면 "내 자리"가 사라진다.
 */
export function ActvPile({
  entries,
  onSelectMember,
}: {
  entries: StoryActvRankEntry[];
  onSelectMember: (memId: string, memNm: string) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  /** 컨테이너 실제 폭 — 배치가 폭에 의존하므로 재기 전에는 그리지 않는다 */
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      setWidth(e.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { items, height } = useMemo(
    () => pileAvatars(entries, width),
    [entries, width],
  );

  if (entries.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {/* `z-0`으로 스태킹 컨텍스트를 가둔다 — 아래 hover:z-40이 다이얼로그(z-50) 위로
          새어나가지 않게. 떠다니는 아바타에서 겪은 것과 같은 함정이다. */}
      <div
        ref={wrapRef}
        className="relative z-0 w-full"
        style={{ height: height || 220 }}
      >
        {items.map(({ entry, x, y, d }, i) => (
          <button
            key={entry.mem_id}
            type="button"
            onClick={() => onSelectMember(entry.mem_id, entry.mem_nm)}
            aria-label={`${entry.mem_nm} — 활동량 ${entry.actv_score}`}
            title={`${entry.mem_nm} · ${entry.actv_score}`}
            style={{
              left: x - d / 2,
              top: y - d / 2,
              width: d,
              height: d,
              // 큰 것이 위로 오게 — 겹치지 않지만 링이 맞닿을 때 큰 얼굴이 잘리지 않는다
              zIndex: Math.round(d),
              // 떨어지는 연출을 한 박자씩 늦춰 순서대로 떨군다(큰 것=아래 먼저, i는
              // 점수 내림차순). 66개가 동시에 튀면 어지럽다. 상한 900ms로 꼬리를 자른다.
              animationDelay: `${Math.min(i * 22, 900)}ms`,
            }}
            className={cn(
              "actv-drop absolute rounded-full transition-transform",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "hover:z-40 hover:scale-110",
            )}
          >
            <Avatar
              src={entry.avatar_url}
              seed={entry.mem_id}
              alt={entry.mem_nm}
              size="sm"
              className="size-full ring-2 ring-background"
            />
          </button>
        ))}
      </div>

      {/* 그림만으로는 "무슨 기준의 크기인가"가 안 읽힌다 — 한 줄로 규칙만 밝힌다 */}
      <p className="text-[11px] text-muted-foreground">
        원이 클수록 이번 달 활동량이 많아요 · 총 {entries.length}명
      </p>
    </div>
  );
}
