"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

export function BackHeader({ title }: { title?: string }) {
  const router = useRouter();

  return (
    <header className="sticky top-0 z-40 flex h-12 items-center border-b border-border bg-white px-4">
      <button
        onClick={() => router.back()}
        className="flex size-8 items-center justify-center rounded-lg text-foreground"
        aria-label="뒤로가기"
      >
        <ChevronLeft className="size-5" />
      </button>
      {title && (
        <h1 className="absolute left-1/2 -translate-x-1/2 text-base font-semibold text-foreground">
          {title}
        </h1>
      )}
    </header>
  );
}
