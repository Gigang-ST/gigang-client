"use client";

import HeroSection from "@/components/hero-section";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isHome = pathname === "/";

  return (
    <HeroSection
      showHeroContent={isHome}
      showSliderNav={isHome}
      showNavigation
      overlay={<div className="h-full overflow-y-auto">{children}</div>}
    />
  );
}
