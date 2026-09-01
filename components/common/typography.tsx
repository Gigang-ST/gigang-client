import * as React from "react";
import { cn } from "@/lib/utils";

/* ---------- H1: 메인 탭 페이지 제목 (28px bold) ---------- */

// `as`로 요소가 갈리므로 ref 계약도 그에 맞춰 넓힌다 — `as="div"`인데 ref 타입만
// HTMLHeadingElement로 두면 실제 `ref.current`(HTMLDivElement)와 어긋난 타입이 나간다.
type H1Props = React.HTMLAttributes<HTMLElement> & {
  /**
   * 렌더할 요소. 기본 `h1`.
   *
   * **한 문서에 `h1`은 하나여야 한다** — 네이버 검색로봇은 h1이 둘 이상이면 구조를
   * 이해하기 어려운 페이지로 본다(웹마스터 가이드 「<H1> 요소가 2개 이상 발견」).
   * Suspense 폴백처럼 **같은 제목을 한 번 더 그리는 자리**는 `as="div"`로 낮춘다 —
   * 스트리밍 HTML에는 폴백과 본 내용이 함께 담기므로, 폴백도 h1이면 크롤러 눈에 둘이 된다.
   */
  as?: "h1" | "div";
};

const H1 = React.forwardRef<HTMLElement, H1Props>(
  ({ className, as = "h1", ...props }, ref) => {
    // `"h1" | "div"` 유니온을 그대로 JSX 태그로 쓰면 ref 타입이 두 요소를 동시에
    // 만족해야 해서 컴파일이 안 된다(HTMLHeadingElement vs HTMLDivElement).
    // 넓힌 ref 계약(HTMLElement)에 맞춰 태그 쪽도 한 단계 넓힌다.
    const Tag = as as React.ElementType;
    return (
      <Tag
        ref={ref}
        className={cn(
          "text-[28px] font-bold leading-[1.2] -tracking-[0.025em] text-foreground",
          className,
        )}
        {...props}
      />
    );
  },
);
H1.displayName = "H1";

/* ---------- H2: 서브 페이지 제목 (22px bold) ---------- */

type H2Props = React.HTMLAttributes<HTMLHeadingElement>;

const H2 = React.forwardRef<HTMLHeadingElement, H2Props>(
  ({ className, ...props }, ref) => (
    <h2
      ref={ref}
      className={cn(
        "text-[22px] font-bold leading-[1.3] -tracking-[0.025em] text-foreground",
        className,
      )}
      {...props}
    />
  ),
);
H2.displayName = "H2";

/* ---------- Body: 본문/리스트 이름 (15px) ---------- */

type BodyProps = React.HTMLAttributes<HTMLSpanElement>;

const Body = React.forwardRef<HTMLSpanElement, BodyProps>(
  ({ className, ...props }, ref) => (
    <span
      ref={ref}
      className={cn("text-[15px] text-foreground", className)}
      {...props}
    />
  ),
);
Body.displayName = "Body";

/* ---------- Caption: 서브 정보 (13px) ---------- */

type CaptionProps = React.HTMLAttributes<HTMLSpanElement>;

const Caption = React.forwardRef<HTMLSpanElement, CaptionProps>(
  ({ className, ...props }, ref) => (
    <span
      ref={ref}
      className={cn("text-[13px] text-muted-foreground", className)}
      {...props}
    />
  ),
);
Caption.displayName = "Caption";

/* ---------- Micro: 배지, 날짜 세부 (11px) ---------- */

type MicroProps = React.HTMLAttributes<HTMLSpanElement>;

const Micro = React.forwardRef<HTMLSpanElement, MicroProps>(
  ({ className, ...props }, ref) => (
    <span
      ref={ref}
      className={cn("text-[11px] text-muted-foreground", className)}
      {...props}
    />
  ),
);
Micro.displayName = "Micro";

/* ---------- SectionLabel: 영문 섹션 라벨 (12px semibold tracking-widest) ---------- */

type SectionLabelProps = React.HTMLAttributes<HTMLSpanElement>;

const SectionLabel = React.forwardRef<HTMLSpanElement, SectionLabelProps>(
  ({ className, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        "text-xs font-bold tracking-widest text-foreground",
        className,
      )}
      {...props}
    />
  ),
);
SectionLabel.displayName = "SectionLabel";

export { H1, H2, Body, Caption, Micro, SectionLabel };
