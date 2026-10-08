import Link from "next/link";

import { cn } from "@/lib/utils";

type ProjectSwitcherProps = {
  events: { evt_id: string; evt_nm: string }[];
  selectedId: string;
};

/**
 * 진행 중 프로젝트가 둘 이상일 때 맨 위에 서는 전환 줄.
 *
 * **칩 모양**이고 **진짜 `<Link>`**다. 세그먼트 모양이면 바로 아래 PB 뷰 탭(내 현황·훈련·…)과 똑같이 생겨
 * 층이 구분되지 않았다 — 위는 "어느 프로젝트", 아래는 "그 안의 어느 면"이라 모양을 갈라 둔다.
 * 선택이 `?evt=<evt_id>`로 URL에 남아야
 * 새로고침·공유·뒤로가기가 같은 프로젝트를 가리키고, 서버 컴포넌트가 그 값으로 뷰를 고른다
 * (클라이언트 상태로 들면 서버가 어느 뷰를 그릴지 모른다). 그래서 이 컴포넌트엔 상태도 클라이언트 코드도 없다.
 *
 * 링크에 `month` 같은 다른 쿼리를 싣지 않는다 — 다른 프로젝트의 월·차트 탭이 따라오면 안 된다.
 */
export function ProjectSwitcher({ events, selectedId }: ProjectSwitcherProps) {
  return (
    <nav
      aria-label="프로젝트 선택"
      className="-mx-6 flex gap-2 overflow-x-auto px-6 [scrollbar-width:none]"
    >
      {events.map((e) => {
        const active = e.evt_id === selectedId;
        return (
          <Link
            key={e.evt_id}
            href={`/projects?evt=${e.evt_id}`}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full border px-4 text-[13px] font-medium transition-colors",
              active
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-background text-muted-foreground",
            )}
          >
            {e.evt_nm}
          </Link>
        );
      })}
    </nav>
  );
}
