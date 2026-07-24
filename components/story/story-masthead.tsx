import Link from "next/link";

import { dayjs } from "@/lib/dayjs";
import { isDevModeEnabled } from "@/lib/dev-mode";

/**
 * 제호(masthead) — "이 페이지는 신문이다"를 1초 안에 전달하는 장치.
 *
 * 명조 제호 + 발행일자 + 굵은 괘선. 메인 탭의 `PageHeader`(h-14 산세리프) 대신
 * 이 페이지만 쓰는 전용 헤더다.
 */
export function StoryMasthead() {
  // 발행정보는 날짜만 둔다 — 이번 주 모임 수·새 기록 수는 기상대(`StoryWeather`)가
  // 근거 수치로 이미 말한다. 제호에 또 얹으면 같은 숫자를 한 화면에서 두 번 읽게 된다.
  return (
    <header className="newsprint relative px-6 pb-3 pt-2">
      {/* TODO(임시): 스타일 확정되면 이 링크와 /dev/story-styles 폴더를 함께 삭제한다.
          개발 모드에서만 노출 — 프로덕션 방문자(비로그인 포함)에게는 보이지 않는다.
          게이트는 반드시 `isDevModeEnabled()`를 쓴다. `env.NEXT_PUBLIC_ENABLE_DEV_MODE`를
          직접 읽으면 로컬 `pnpm dev`에서 변수를 안 둔 경우 이 버튼만 사라진다
          (다른 개발 전용 기능은 전부 헬퍼를 쓰므로 보이는데 여기만 안 보이는 상태가 된다). */}
      {isDevModeEnabled() && (
        <div className="absolute right-4 top-2 flex gap-1.5">
          <Link
            href="/dev/story-styles"
            className="rounded-full border border-border px-2.5 py-1 font-numeric text-[10px] uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            지면
          </Link>
          <Link
            href="/dev/presence-styles"
            className="rounded-full border border-border px-2.5 py-1 font-numeric text-[10px] uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            접속자
          </Link>
        </div>
      )}

      <h1 className="text-center font-serif text-[30px] leading-none tracking-[0.02em] text-foreground">
        기강이야기
      </h1>
      <p className="mt-2.5 text-center font-numeric text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        {dayjs().format("YYYY년 M월 D일 ddd요일")}
      </p>
      <div className="rule-masthead mt-3" />
    </header>
  );
}
