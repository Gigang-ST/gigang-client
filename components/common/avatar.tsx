"use client";

import * as React from "react";
import Image from "next/image";
import { UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

const SIZE_MAP = {
  sm: "size-8",
  md: "size-10",
  lg: "size-14",
  xl: "size-16",
} as const;

const SIZE_PX: Record<AvatarSize, number> = {
  sm: 32,
  md: 40,
  lg: 56,
  xl: 64,
};

const ICON_SIZE_MAP = {
  sm: "size-4",
  md: "size-5",
  lg: "size-7",
  xl: "size-8",
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
  ) => {
    const [imgError, setImgError] = React.useState(false);
    const showImage = src && src.length > 0 && !imgError;

    // src가 변경되면 에러 상태 리셋
    React.useEffect(() => {
      setImgError(false);
    }, [src]);

    return (
      <div
        ref={ref}
        className={cn(
          "flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary",
          SIZE_MAP[size],
          className,
        )}
        {...props}
      >
        {showImage ? (
          <Image
            src={src}
            alt={alt ?? ""}
            width={SIZE_PX[size]}
            height={SIZE_PX[size]}
            className="size-full object-cover"
            referrerPolicy="no-referrer"
            unoptimized
            onError={() => setImgError(true)}
          />
        ) : (
          <Icon className={cn("text-foreground/50", ICON_SIZE_MAP[size])} />
        )}
      </div>
    );
  },
);
Avatar.displayName = "Avatar";

export { Avatar, SIZE_MAP, ICON_SIZE_MAP };
export type { AvatarSize };
