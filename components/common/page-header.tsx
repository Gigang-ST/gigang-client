import * as React from "react";
import { cn } from "@/lib/utils";
import { H1 } from "@/components/common/typography";

/**
 * 메인 탭 상단 헤더.
 *
 * `variant`로 두 판형을 고른다:
 * - `plain` — 28px 볼드 한 줄(기존). 홈·대회가 쓴다.
 * - `editorial` — 영문 라벨 + 명조 제목. **기강이야기 제호와 같은 언어**라, 지면 톤을 쓰는
 *   탭(랭킹·프로젝트·프로필·일정)이 이걸 쓰면 한 앱으로 묶인다. 라벨을 제목 위에 얹되
 *   여백을 최소로 잡아 세로가 길지 않게 한다. 괘선은 제호(StoryMasthead)만 갖는다.
 *
 * `center`는 라벨 줄에 겹치는 가운데 슬롯이다 — 일정 탭의 슬로건(티커)이 여기 들어간다.
 * 다른 탭은 안 주므로 라벨·제목만 남는다.
 */

type PageHeaderProps = React.HTMLAttributes<HTMLDivElement> & {
  /** 페이지 제목 */
  title: string;
  /** 우측 액션 영역 (아이콘 버튼, 링크 등) */
  action?: React.ReactNode;
  /** 판형 — 기본은 기존 모양 유지 */
  variant?: "plain" | "editorial";
  /** 제목 위 영문 라벨. `editorial`에서만 표시 */
  label?: string;
  /** 라벨 줄에 겹치는 가운데 슬롯. `editorial`에서만. 일정 탭 슬로건 자리 */
  center?: React.ReactNode;
  /**
   * Suspense 폴백(스켈레톤)으로 쓸 때 켠다 — 제목을 `h1`이 아닌 `div`로 낮춘다.
   *
   * 폴백과 본 헤더가 **같은 제목을 두 번** 그리는데, 스트리밍 HTML에는 둘 다 담긴다.
   * 그대로 두면 JS를 안 돌리는 검색로봇 눈에 h1이 두 개다(`/schedule`에서 실제로 그랬다).
   * 보이는 모양은 그대로다 — 클래스가 같다.
   */
  decorative?: boolean;
};

const PageHeader = React.forwardRef<HTMLDivElement, PageHeaderProps>(
  (
    { className, title, action, variant = "plain", label, center, decorative, ...props },
    ref,
  ) => {
    if (variant === "editorial") {
      return (
        <div
          ref={ref}
          className={cn(
            // 헤더 높이를 기강이야기(StoryMasthead)와 같은 78px로 **고정**한다 — min-h로 두면
            // 라벨+제목 콘텐츠가 78을 넘어 헤더가 더 커진다(실제로 94px가 나왔다). h-고정 +
            // 세로 가운데 정렬로 5개 탭이 정확히 같은 높이가 된다.
            "relative flex h-[78px] items-center px-6",
            className,
          )}
          {...props}
        >
          {/* 라벨 + 제목을 한 덩이로 세로로 쌓고 헤더 안에서 세로 가운데 정렬한다. 영문 라벨은
              pt-0.5로 아주 살짝 내려(위에 딱 붙지 않게) 제목과의 균형을 잡는다. */}
          <div className="flex min-w-0 flex-col pt-0.5">
            {label && (
              <span className="mb-0.5 font-numeric text-[10px] font-medium uppercase leading-none tracking-[0.22em] text-muted-foreground">
                {label}
              </span>
            )}
            {/* 헤더 제목은 프리텐다드(font-sans) 볼드 — H1의 원래 규격(28px bold, DESIGN.md).
                명조(리디바탕)일 땐 가짜 볼드가 생겨 font-normal로 눌렀지만, 프리텐다드는
                진짜 볼드 웨이트가 있어 되살렸다(H1 기본이 font-bold라 클래스 추가 불필요). */}
            <H1 as={decorative ? "div" : "h1"} className="font-sans leading-tight">
              {title}
            </H1>
          </div>

          {/* 액션 — 우측 세로 가운데. 라벨·제목 덩이와 같은 축에 놓여 위에 붙지 않는다. */}
          {action && <div className="ml-auto shrink-0 pl-2">{action}</div>}

          {/* 가운데 슬롯(center) — 일정 탭 슬로건. 헤더 세로 가운데에 겹쳐 띄운다(inset-y-0
              + items-center). 라벨·제목·아이콘과 같은 세로 축이라 어느 것도 위로 뜨지 않는다.
              다른 탭은 안 주므로 렌더되지 않는다. */}
          {center && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              {center}
            </div>
          )}
        </div>
      );
    }

    return (
      <div
        ref={ref}
        className={cn("flex h-14 items-center justify-between px-6", className)}
        {...props}
      >
        <H1 as={decorative ? "div" : "h1"}>{title}</H1>
        {action}
      </div>
    );
  },
);
PageHeader.displayName = "PageHeader";

export { PageHeader };
