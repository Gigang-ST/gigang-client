import * as React from "react";
import { Slot } from "@radix-ui/react-slot";

import { cn } from "@/lib/utils";

/* ---------- CardItem: 프로젝트 공통 카드 스타일 ---------- */

const cardItemVariants = {
  /** 기본: 실선 테두리 카드 */
  outlined: "rounded-2xl border-[1.5px] border-border p-4",
  /** 빈 상태: 점선 테두리 */
  dashed: "rounded-2xl border-[1.5px] border-dashed border-border p-4",
} as const;

type CardItemProps = React.HTMLAttributes<HTMLDivElement> & {
  /** 카드 스타일 variant (기본: "outlined") */
  variant?: keyof typeof cardItemVariants;
  /** true이면 자식 요소를 루트로 사용 (Slot 패턴 — button, a, Link 등) */
  asChild?: boolean;
};

const CardItem = React.forwardRef<HTMLDivElement, CardItemProps>(
  ({ className, variant = "outlined", asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "div";
    return (
      <Comp
        ref={ref}
        className={cn(cardItemVariants[variant], className)}
        {...props}
      />
    );
  },
);
CardItem.displayName = "CardItem";

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-xl border bg-card text-card-foreground shadow",
      className,
    )}
    {...props}
  />
));
Card.displayName = "Card";

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
));
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
));
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
));
CardFooter.displayName = "CardFooter";

export {
  Card,
  CardItem,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
};
