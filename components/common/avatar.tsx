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

/**
 * 프사 미설정 멤버에게 보여줄 랜덤(고정) 아바타 스타일.
 * DiceBear 스타일 이름만 바꾸면 전체 폴백 아바타가 교체된다.
 * 후보: fun-emoji, bottts, thumbs, notionists, adventurer, lorelei 등
 * @see https://www.dicebear.com/styles
 */
const FALLBACK_AVATAR_STYLE = "dylan";

/** seed(멤버 id 등)로 고정된 DiceBear 아바타 SVG URL을 만든다. */
function buildFallbackAvatarUrl(seed: string | number): string {
  return `https://api.dicebear.com/9.x/${FALLBACK_AVATAR_STYLE}/svg?seed=${encodeURIComponent(String(seed))}`;
}

type AvatarProps = React.HTMLAttributes<HTMLDivElement> & {
  /** 프로필 이미지 URL */
  src?: string | null;
  /**
   * 프사 미설정 시 생성할 랜덤 아바타의 seed (멤버 id 권장).
   * 같은 seed = 항상 같은 아바타. 없으면 fallbackIcon으로 폴백.
   */
  seed?: string | number | null;
  /** 이미지 alt 텍스트 */
  alt?: string;
  /** 아바타 크기 */
  size?: AvatarSize;
  /** 이미지·seed 모두 없을 때 폴백 아이콘 */
  fallbackIcon?: React.ComponentType<{ className?: string }>;
};

const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  (
    { className, src, seed, alt, size = "md", fallbackIcon: Icon = UserRound, ...props },
    ref,
  ) => {
    const [imgError, setImgError] = React.useState(false);

    // src 우선, 없으면 seed 기반 랜덤(고정) 아바타로 폴백
    const imageSrc =
      src && src.length > 0
        ? src
        : seed != null && String(seed).length > 0
          ? buildFallbackAvatarUrl(seed)
          : null;
    const showImage = imageSrc && !imgError;

    // 이미지 소스가 변경되면 에러 상태 리셋
    React.useEffect(() => {
      setImgError(false);
    }, [imageSrc]);

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
            src={imageSrc}
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
