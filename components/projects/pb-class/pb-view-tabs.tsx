import Link from "next/link";

import { cn } from "@/lib/utils";

import { PbTabPending } from "./pb-tab-pending";

/** 탭 이름 — URL `?view=` 값과 같다(바꾸면 공유된 링크가 기본 탭으로 떨어진다) */
export const PB_VIEWS = ["status", "training", "score", "guide"] as const;
export type PbView = (typeof PB_VIEWS)[number];

export const PB_VIEW_LABEL: Record<PbView, string> = {
  status: "내 현황",
  training: "훈련",
  score: "점수판",
  guide: "안내",
};

/**
 * 볼 수 있는 탭과 지금 탭을 정한다 — **첫 탭이 곧 기본 탭**이다.
 *
 * 승인된 참가자는 「내 현황」부터, 그 밖(미신청·입금 대기·크루 밖)은 「안내」부터 본다. 내 현황이 없는
 * 사람에게 빈 탭을 세우지 않으려고 탭 자체를 뺀다. 모르는 값·볼 수 없는 탭(`?view=status`를 미신청자가
 * 연 경우)은 기본 탭으로 떨어진다 — 공유된 링크가 에러 화면이 되면 안 된다.
 */
export function resolvePbView(raw: string | undefined, approved: boolean): { tabs: PbView[]; active: PbView } {
  const tabs: PbView[] = approved ? ["status", "training", "score", "guide"] : ["guide", "training", "score"];
  const active = tabs.find((t) => t === raw) ?? tabs[0];
  return { tabs, active };
}

/**
 * 안내 탭 맨 위에 세울 「지금 할 일」 — 미신청이면 신청, 입금 대기면 입금 안내, 그 밖엔 없음.
 * 종료된 프로젝트(보관용)에선 할 일이 없다 — 끝난 클래스에 신청 버튼을 세우면 누르고 나서야 거절당한다.
 */
export function pbGuideTop(readOnly: boolean, me: { aprvYn: boolean } | null): "apply" | "pending" | null {
  if (readOnly) return null;
  if (!me) return "apply";
  return me.aprvYn ? null : "pending";
}

/**
 * PB 클래스 화면 탭 — 모양은 `SegmentControl`이지만 **진짜 링크**다(`ProjectSwitcher`와 같은 이유).
 *
 * 선택이 `?view=`로 URL 에 남아야 새로고침·공유·뒤로가기가 같은 탭을 가리키고, 서버 컴포넌트가 그 값으로
 * 무엇을 조회·그릴지 고른다. 탭 하나만 서버에서 그리므로 안 보는 탭의 무거운 조회(정산 등)를 하지 않는다.
 * `scroll={false}` — 히어로 아래에서 탭을 누를 때마다 맨 위로 튀면 방금 누른 탭이 화면 밖으로 사라진다.
 */
export function PbViewTabs({ evtId, tabs, active }: { evtId: string; tabs: PbView[]; active: PbView }) {
  return (
    <nav aria-label="PB 클래스 보기" className="flex gap-0 rounded-xl border border-border bg-secondary p-1">
      {tabs.map((t) => {
        const on = t === active;
        return (
          <Link
            key={t}
            href={`/projects?evt=${evtId}&view=${t}`}
            scroll={false}
            aria-current={on ? "page" : undefined}
            className={cn(
              "relative flex min-h-11 flex-1 items-center justify-center whitespace-nowrap rounded-lg px-2 text-[13px] font-medium transition-colors",
              on
                ? "bg-background text-foreground shadow-sm dark:bg-card dark:shadow-none"
                : "text-muted-foreground",
            )}
          >
            {PB_VIEW_LABEL[t]}
            <PbTabPending />
          </Link>
        );
      })}
    </nav>
  );
}
