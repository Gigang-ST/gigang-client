import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { SectionLabel } from "@/components/common/typography";

type SectionHeaderAction = {
  label: string;
  href: string;
};

type SectionHeaderProps = React.HTMLAttributes<HTMLDivElement> & {
  /** 섹션 라벨 (영문 대문자 권장) */
  label: string;
  /** 우측 액션 링크 */
  action?: SectionHeaderAction;
};

const SectionHeader = React.forwardRef<HTMLDivElement, SectionHeaderProps>(
  ({ className, label, action, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex items-center justify-between", className)}
      {...props}
    >
      <SectionLabel>{label}</SectionLabel>
      {action && (
        <Link href={action.href} className="text-xs font-medium text-primary">
          {action.label}
        </Link>
      )}
    </div>
  ),
);
SectionHeader.displayName = "SectionHeader";

export { SectionHeader };
export type { SectionHeaderAction };
