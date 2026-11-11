"use client";

import Image from "next/image";

import { useTeamLogo } from "@/lib/use-team-logo";
import { cn } from "@/lib/utils";

/**
 * 지금 주소의 팀 로고 그림(홈 로딩 화면·로그인 화면). 팀을 고르는 규칙과 「껍데기에선 비워 두는」 이유는 `lib/team-logo.ts`.
 *
 * 로고를 아직 모를 때(서버가 미리 그린 껍데기) **같은 크기의 빈 자리**를 둔다 — 로고가 나타날 때 아래 내용이 밀리지 않게.
 * 빈 자리는 그림과 같은 `className` 에 정사각(`aspect-square`)을 더한 것이라, **크기는 className 으로 준다**
 * (`size-20`, `w-full max-w-xs` 처럼). 로고는 정사각이다.
 *
 * @param decorative 장식(「불러오는 중」 워터마크)이면 그림 설명을 비운다(alt="") — 화면낭독기가 읽을 이름이 아니다.
 */
export function TeamLogoImage({
  width,
  height,
  className,
  priority,
  decorative = false,
}: {
  width: number;
  height: number;
  className?: string;
  priority?: boolean;
  decorative?: boolean;
}) {
  const logo = useTeamLogo();
  if (!logo) {
    return <div aria-hidden className={cn(className, "aspect-square")} />;
  }
  return (
    <Image
      src={logo.logo}
      alt={decorative ? "" : logo.alt}
      width={width}
      height={height}
      priority={priority}
      className={className}
    />
  );
}
