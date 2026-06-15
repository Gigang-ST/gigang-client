"use client";

import { cn } from "@/lib/utils";

export function MemberNameButton({
  memId,
  name,
  onOpen,
  className,
}: {
  memId: string;
  name: string;
  onOpen: (memId: string) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(memId)}
      className={cn("text-left hover:underline", className)}
    >
      {name}
    </button>
  );
}
