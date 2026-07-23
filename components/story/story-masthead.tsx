import Link from "next/link";

import { dayjs } from "@/lib/dayjs";
import { env } from "@/lib/env";

import type { StoryWeekStat } from "@/lib/queries/story-feed";

/**
 * 제호(masthead) — "이 페이지는 신문이다"를 1초 안에 전달하는 장치.
 *
 * 명조 제호 + 발행정보 한 줄 + 굵은 괘선. 메인 탭의 `PageHeader`(h-14 산세리프) 대신
 * 이 페이지만 쓰는 전용 헤더다.
 */
export function StoryMasthead({ week }: { week: StoryWeekStat }) {
  // 발행정보 — 이번 주 활동이 있으면 그걸, 없으면 크루명으로 채운다.
  const dateline: string[] = [dayjs().format("YYYY년 M월 D일 ddd요일")];
  if (week.gthr_cnt > 0) dateline.push(`이번 주 모임 ${week.gthr_cnt}회`);
  if (week.rec_cnt > 0) dateline.push(`새 기록 ${week.rec_cnt}건`);

  return (
    <header className="newsprint relative px-6 pb-3 pt-2">
      {/* TODO(임시): 스타일 확정되면 이 링크와 /dev/story-styles 폴더를 함께 삭제한다.
          개발 모드에서만 노출 — 프로덕션 방문자(비로그인 포함)에게는 보이지 않는다. */}
      {env.NEXT_PUBLIC_ENABLE_DEV_MODE && (
        <Link
          href="/dev/story-styles"
          className="absolute right-4 top-2 rounded-full border border-border px-2.5 py-1 font-numeric text-[10px] uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          스타일 비교
        </Link>
      )}

      <h1 className="text-center font-serif text-[30px] leading-none tracking-[0.02em] text-foreground">
        기강이야기
      </h1>
      <p className="mt-2.5 text-center font-numeric text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        {dateline.join(" · ")}
      </p>
      <div className="rule-masthead mt-3" />
    </header>
  );
}
