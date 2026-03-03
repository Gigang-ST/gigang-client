"use client";

import HeroSection from "@/components/hero-section";
import { siteContent } from "@/config";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const socialLabels = ["소모임", "인스타그램", "카카오톡", "가민 그룹"];
  const socialIconMap = {
    소모임: "/somoim.png",
    인스타그램: "/Instagram.png",
    카카오톡: "/kakao.png",
    "가민 그룹": "/garmin.png",
  } as const;

  return (
    <HeroSection
      showHeroContent={isHome}
      showSliderNav={isHome}
      showNavigation
      overlay={
        <div className="h-full overflow-y-auto">
          <div className="min-h-screen flex flex-col">
            <div className="flex-1">{children}</div>
            <footer className="mt-auto w-full border-t border-white/10 bg-black/30 px-6 py-4 text-white/70">
              <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 text-center">
                <div className="flex items-center justify-center gap-4">
                  {socialLabels.map((label) => {
                    const item = siteContent.navigation.items.find(
                      (navItem) => navItem.label === label,
                    );
                    if (!item) {
                      return null;
                    }
                    const iconSrc =
                      socialIconMap[label as keyof typeof socialIconMap];
                    return (
                      <a
                        key={label}
                        href={item.href}
                        target="_blank"
                        rel="noreferrer"
                        className="flex flex-col items-center gap-1 text-[9px] text-white/70 transition hover:text-white"
                        aria-label={`${label} 링크`}
                      >
                        <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/5 p-1 transition hover:border-white/40">
                          <Image
                            src={iconSrc}
                            alt={label}
                            width={24}
                            height={24}
                            className={
                              label === "가민 그룹"
                                ? "h-8 w-8 object-contain"
                                : "h-6 w-6 object-contain"
                            }
                          />
                        </span>
                        <span>{label}</span>
                      </a>
                    );
                  })}
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] text-white/60">
                  <Link href="/privacy" className="transition hover:text-white">
                    개인정보처리방침
                  </Link>
                  <span className="text-white/20">·</span>
                  <Link href="/terms" className="transition hover:text-white">
                    이용약관
                  </Link>
                  <span className="text-white/20">·</span>
                  <Link href="/policy" className="transition hover:text-white">
                    운영정책
                  </Link>
                </div>
                <div className="text-[10px] text-white/40">
                  © 2026 {siteContent.brand.shortName}. All rights reserved.
                </div>
              </div>
            </footer>
          </div>
        </div>
      }
    />
  );
}
