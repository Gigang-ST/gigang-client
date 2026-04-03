import * as React from "react";
import { cn } from "@/lib/utils";
import { CardItem } from "@/components/ui/card";

type EmptyStateProps = React.HTMLAttributes<HTMLDivElement> & {
  /** 아이콘 컴포넌트 (lucide-react 등) */
  icon?: React.ComponentType<{ className?: string }>;
  /** 빈 상태 메시지 */
  message: string;
  /** "card" = CardItem dashed 래퍼, "inline" = div 래퍼 */
  variant?: "card" | "inline";
};

const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ className, icon: Icon, message, variant = "inline", ...props }, ref) => {
    const content = (
      <>
        {Icon && <Icon className="size-12 text-muted-foreground/30" />}
        <p className="text-body text-muted-foreground">{message}</p>
      </>
    );

    if (variant === "card") {
      return (
        <CardItem
          ref={ref}
          variant="dashed"
          className={cn(
            "flex flex-col items-center gap-3 py-8 text-center",
            className,
          )}
          {...props}
        >
          {content}
        </CardItem>
      );
    }

    return (
      <div
        ref={ref}
        className={cn(
          "flex flex-col items-center gap-3 py-12",
          className,
        )}
        {...props}
      >
        {content}
      </div>
    );
  },
);
EmptyState.displayName = "EmptyState";

export { EmptyState };
