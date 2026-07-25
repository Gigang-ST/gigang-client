import { dayjs } from "@/lib/dayjs";

import type { ReactNode } from "react";

/**
 * 제호(masthead) — "이 페이지는 신문이다"를 1초 안에 전달하는 장치.
 *
 * 명조 제호 + 발행일자 + 굵은 괘선. 메인 탭의 `PageHeader`(h-14 산세리프) 대신
 * 이 페이지만 쓰는 전용 헤더다.
 *
 * **창간일·슬로건은 제호를 감싸되 제호와 다투지 않는다.** 홈 헤더의 슬로건은
 * `13px 이탤릭 블랙`이라 그 크기 그대로 여기 얹으면 정체성 문구가 둘이 되어 둘 다 죽는다.
 * 신문이 실제로 하는 방식대로 창간일을 제호 위에, 표어를 제호 아래에 **아주 작게** 눕혀
 * 제호를 받치게 했다. 이러면 슬로건이 판권의 일부로 읽히고 제호는 그대로 주인공이다.
 *
 * 일정 탭의 슬로건은 그대로 둔다 — 저긴 모임 칩과 교차 순환하는 별도 장치다.
 */
export function StoryMasthead({ actions }: { actions?: ReactNode }) {
  // 발행정보는 날짜만 둔다 — 이번 주 모임 수·새 기록 수는 오버뷰(`StoryPulse`)가
  // 근거 수치로 이미 말한다. 제호에 또 얹으면 같은 숫자를 한 화면에서 두 번 읽게 된다.
  return (
    <header className="newsprint relative flex h-[78px] flex-col justify-center px-6">
      {/* 우상단 액션 — 다른 탭과 같은 [알림][햄버거]. 제호는 헤더 전체 기준 가운데
          정렬을 유지해야 하므로 액션을 absolute로 오른쪽에 띄운다(flex로 밀면 제호가
          왼쪽으로 치우친다). 액션이 제호(30px)보다 키가 커서 세로 가운데(top-1/2)에 맞춘다. */}
      <div className="absolute right-4 top-1/2 z-10 flex -translate-y-1/2 items-center gap-1.5">
        {actions}
      </div>

      {/* 지면 날짜 — 제호 위. "Since 창간일"을 빼고 그 자리에 오늘 날짜를 둔다(리드 좌상단에
          있던 걸 헤더로 되돌렸다). 이 헤더가 "오늘 지면"임을 제호 바로 위에서 밝힌다. */}
      <p className="text-center font-numeric text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        {dayjs().format("YYYY년 M월 D일 ddd요일")}
      </p>
      <h1 className="mt-0.5 text-center font-sans text-[30px] font-bold leading-none tracking-[0.02em] text-foreground">
        기강이야기
      </h1>
      {/* 밑줄(괘선) — 기강이야기만 갖는다(editorial 탭은 뺐다). 제목에 너무 붙지 않게
          mt-2.5로 여백을 준다. 이 헤더 전체 높이가 5개 탭의 공통 기준이다. */}
      <div className="rule-masthead mt-2.5" />
    </header>
  );
}
