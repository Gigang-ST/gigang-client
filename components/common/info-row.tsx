import * as React from "react";
import { cn } from "@/lib/utils";

type InfoRowProps = React.HTMLAttributes<HTMLDivElement> & {
  /** 좌측 라벨 */
  label: string;
  /** 우측 값 (없으면 "-" 표시) */
  value?: React.ReactNode;
};

const InfoRow = React.forwardRef<HTMLDivElement, InfoRowProps>(
  ({ className, label, value, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex items-center justify-between border-b border-border py-2.5",
        className,
      )}
      {...props}
    >
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">
        {value ?? "-"}
      </span>
    </div>
  ),
);
InfoRow.displayName = "InfoRow";

export { InfoRow };
