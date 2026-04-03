import * as React from "react";
import { cn } from "@/lib/utils";
import { CardItem } from "@/components/ui/card";

type StatCardProps = React.HTMLAttributes<HTMLDivElement> & {
  /** 통계 값 (숫자, 텍스트 등) */
  value: React.ReactNode;
  /** 값 하단 라벨 */
  label: string;
  /** 값 텍스트 추가 스타일 */
  valueClassName?: string;
};

const StatCard = React.forwardRef<HTMLDivElement, StatCardProps>(
  ({ className, value, label, valueClassName, ...props }, ref) => (
    <CardItem
      ref={ref}
      className={cn("flex flex-col gap-1", className)}
      {...props}
    >
      <span
        className={cn("text-2xl font-bold text-foreground", valueClassName)}
      >
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </CardItem>
  ),
);
StatCard.displayName = "StatCard";

export { StatCard };
