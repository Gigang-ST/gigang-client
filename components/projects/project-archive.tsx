import Link from "next/link";
import { Archive, ChevronLeft, ChevronRight } from "lucide-react";

import { parseEventTime } from "@/lib/dayjs";
import { cn } from "@/lib/utils";

import { Body, Caption, Micro } from "@/components/common/typography";
import { StoryZoneHeader } from "@/components/story/story-zone-header";

/** evt_type_cd → 회원이 부르는 이름. 모르는 종류는 그냥 「프로젝트」 */
const TYPE_LABEL: Record<string, string> = {
  MILEAGE_RUN: "마일리지런",
  PB_CLASS: "PB 클래스",
};

export function projectTypeLabel(cd: string | null | undefined): string {
  return (cd && TYPE_LABEL[cd]) || "프로젝트";
}

export type ArchiveEvent = {
  evt_id: string;
  evt_nm: string;
  evt_type_cd: string | null;
  stt_dt: string;
  end_dt: string;
};

/** date 컬럼이라 parseEventTime(KST 자정)으로 — 연도가 바뀌는 시즌이 많아 둘 다 적는다 */
const period = (e: ArchiveEvent) =>
  `${parseEventTime(e.stt_dt).format("YYYY.M.D")} – ${parseEventTime(e.end_dt).format("YYYY.M.D")}`;

/**
 * 지난 프로젝트 — 지면 맨 아래 조용한 목록.
 *
 * 프로젝트가 끝나면 전환 줄(`ProjectSwitcher`)에서 사라져 내 출석·환급·기록을 다시 볼 길이 없었다.
 * 「보관」이라 맨 아래, 괘선 아래 한 줄씩 — 진행 중인 프로젝트와 같은 무게로 세우면 지금 할 일이 흐려진다.
 * 링크는 `?evt=`만 싣는다(다른 프로젝트의 월·탭이 따라오면 안 된다).
 */
export function ProjectArchive({ events, currentId }: { events: ArchiveEvent[]; currentId?: string }) {
  if (events.length === 0) return null;
  return (
    <section aria-label="지난 프로젝트" className="flex flex-col pt-4">
      <StoryZoneHeader label="Archive" lead="지난 프로젝트" />
      <ul className="mt-2 flex flex-col">
        {events.map((e) => {
          const current = e.evt_id === currentId;
          return (
            <li key={e.evt_id}>
              <Link
                href={`/projects?evt=${e.evt_id}`}
                aria-current={current ? "page" : undefined}
                className="rule-row flex min-h-14 items-center gap-3 py-2.5"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <Micro className="font-medium">{projectTypeLabel(e.evt_type_cd)}</Micro>
                  <Body className={cn("truncate", current ? "font-semibold" : "text-muted-foreground")}>
                    {e.evt_nm}
                  </Body>
                </span>
                <Caption className="shrink-0 tabular-nums">{period(e)}</Caption>
                <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * 종료된 프로젝트를 열었을 때 맨 위 띠 — 「여기선 아무것도 바꿀 수 없다」를 먼저 말한다.
 * 버튼이 하나도 없는 화면을 설명 없이 보여 주면 고장으로 읽힌다.
 */
export function ArchivedBanner({ hasActive }: { hasActive: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-muted px-4 py-3">
      <Archive aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <Caption className="min-w-0 flex-1 font-medium text-foreground">종료된 프로젝트 · 기록 보관용</Caption>
      <Link
        href="/projects"
        className="-my-2 inline-flex min-h-11 shrink-0 items-center gap-0.5 text-[13px] font-medium text-primary"
      >
        <ChevronLeft aria-hidden className="size-3.5" />
        {hasActive ? "진행 중으로" : "돌아가기"}
      </Link>
    </div>
  );
}
