"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BackHeader({ title }: { title?: string }) {
  const router = useRouter();

  return (
    <header className="sticky top-0 z-40 flex h-12 items-center border-b border-border bg-white px-4">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => router.back()}
        aria-label="뒤로가기"
      >
        <ChevronLeft className="size-5" />
      </Button>
      {title && (
        <h1 className="absolute left-1/2 -translate-x-1/2 text-base font-semibold text-foreground">
          {title}
        </h1>
      )}
    </header>
  );
}
