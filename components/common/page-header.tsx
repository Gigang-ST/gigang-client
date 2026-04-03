import * as React from "react";
import { cn } from "@/lib/utils";
import { H1 } from "@/components/common/typography";

type PageHeaderProps = React.HTMLAttributes<HTMLDivElement> & {
  /** 페이지 제목 */
  title: string;
  /** 우측 액션 영역 (아이콘 버튼, 링크 등) */
  action?: React.ReactNode;
};

const PageHeader = React.forwardRef<HTMLDivElement, PageHeaderProps>(
  ({ className, title, action, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex h-14 items-center justify-between px-6", className)}
      {...props}
    >
      <H1>{title}</H1>
      {action}
    </div>
  ),
);
PageHeader.displayName = "PageHeader";

export { PageHeader };
