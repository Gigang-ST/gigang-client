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
 * 후보: dylan, fun-emoji, bottts, thumbs, notionists, adventurer, lorelei 등
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
    // 실제 프사 실패 → DiceBear 폴백 → 그것도 실패 → 아이콘. 단계별로 플래그를 분리한다.
    const [srcError, setSrcError] = React.useState(false);
    const [fallbackError, setFallbackError] = React.useState(false);

    // 판정·표시·비교에 모두 trim된 값을 써서 일관성을 유지한다.
    const trimmedSrc = src?.trim() || null;
    const fallbackUrl =
      seed != null && String(seed).trim().length > 0 ? buildFallbackAvatarUrl(seed) : null;

    // 프사 우선 → 깨지면 DiceBear → 그것도 깨지면 아이콘(null)
    const showingSrc = trimmedSrc != null && !srcError;
    const imageSrc = showingSrc
      ? trimmedSrc
      : fallbackUrl && !fallbackError
        ? fallbackUrl
        : null;
    const showImage = imageSrc != null;

    // src/seed가 바뀌면 에러 상태 리셋 (다른 멤버로 재사용되는 경우)
    React.useEffect(() => {
      setSrcError(false);
      setFallbackError(false);
    }, [src, seed]);

    const handleImageError = () => {
      // 실제 프사를 표시 중이었으면 프사 실패로(→ DiceBear 폴백), 아니면 폴백 실패로(→ 아이콘) 처리
      if (showingSrc) setSrcError(true);
      else setFallbackError(true);
    };

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
            onError={handleImageError}
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
