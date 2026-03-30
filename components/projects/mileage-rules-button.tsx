"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { MileageRulesContent } from "./mileage-rules-content";

export function MileageRulesButton() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button className="w-full rounded-xl border border-dashed border-muted-foreground/30 py-3 text-sm text-muted-foreground hover:bg-muted/50 transition-colors">
          마일리지런 규칙 보기
        </button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[80svh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle className="text-lg">마일리지런 규칙</SheetTitle>
        </SheetHeader>
        <div className="px-4 pt-4 pb-8">
          <MileageRulesContent />
        </div>
      </SheetContent>
    </Sheet>
  );
}
