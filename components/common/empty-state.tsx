import * as React from "react";
import { cn } from "@/lib/utils";
import { CardItem } from "@/components/ui/card";

type EmptyStateProps = Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "children"
> & {
  /** 아이콘 컴포넌트 (lucide-react 등) */
  icon?: React.ComponentType<{ className?: string }>;
  /** 빈 상태 메시지 */
  message: string;
  /** "card" = CardItem dashed 래퍼, "inline" = div 래퍼 */
  variant?: "card" | "inline";
  /**
   * 메시지 아래 유도 슬롯 — `프로필 작성하기 ›` 같은 한 줄.
   *
   * `children`이 아니라 이름 있는 슬롯인 이유: 이 컴포넌트는 아이콘·메시지를 자기가 조립해
   * children 자리에 넣으므로, 호출부가 children을 넘기면 조용히 사라진다(그래서 타입에서도 뺐다).
   */
  action?: React.ReactNode;
};

const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ className, icon: Icon, message, variant = "inline", action, ...props }, ref) => {
    const content = (
      <>
        {Icon && <Icon className="size-12 text-muted-foreground/30" />}
        <p className="text-body text-muted-foreground">{message}</p>
        {action}
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
