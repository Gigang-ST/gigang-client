import * as React from "react";
import { cn } from "@/lib/utils";

/* ---------- H1: 메인 탭 페이지 제목 (28px bold) ---------- */

type H1Props = React.HTMLAttributes<HTMLHeadingElement>;

const H1 = React.forwardRef<HTMLHeadingElement, H1Props>(
  ({ className, ...props }, ref) => (
    <h1
      ref={ref}
      className={cn(
        "text-[28px] font-bold leading-[1.2] -tracking-[0.025em] text-foreground",
        className,
      )}
      {...props}
    />
  ),
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
        "text-xs font-semibold tracking-widest text-muted-foreground",
        className,
      )}
      {...props}
    />
  ),
);
SectionLabel.displayName = "SectionLabel";

export { H1, H2, Body, Caption, Micro, SectionLabel };
