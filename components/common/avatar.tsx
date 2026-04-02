import * as React from "react";
import { UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

const SIZE_MAP = {
  sm: "size-8",
  md: "size-10",
  lg: "size-14",
  xl: "size-16",
} as const;

const ICON_SIZE_MAP = {
  sm: "size-3.5",
  md: "size-4",
  lg: "size-6",
  xl: "size-7",
} as const;

type AvatarSize = keyof typeof SIZE_MAP;

type AvatarProps = React.HTMLAttributes<HTMLDivElement> & {
  /** 프로필 이미지 URL */
  src?: string | null;
  /** 이미지 alt 텍스트 */
  alt?: string;
  /** 아바타 크기 */
  size?: AvatarSize;
  /** 이미지 없을 때 폴백 아이콘 */
  fallbackIcon?: React.ComponentType<{ className?: string }>;
};

const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  (
    { className, src, alt, size = "md", fallbackIcon: Icon = UserRound, ...props },
    ref,
  ) => (
    <div
      ref={ref}
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary",
        SIZE_MAP[size],
        className,
      )}
      {...props}
    >
      {src ? (
        <img
          src={src}
          alt={alt ?? ""}
          className="size-full object-cover"
          referrerPolicy="no-referrer"
        />
      ) : (
        <Icon className={cn("text-muted-foreground", ICON_SIZE_MAP[size])} />
      )}
    </div>
  ),
);
Avatar.displayName = "Avatar";

export { Avatar, SIZE_MAP, ICON_SIZE_MAP };
export type { AvatarSize };
