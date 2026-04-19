"use client";

import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
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
        <Button variant="outline" className="w-full gap-2 rounded-xl">
          <BookOpen className="size-4" />
          마일리지런 규칙
        </Button>
      </SheetTrigger>
      <SheetContent
        side="bottom"
        className="max-h-[80svh] overflow-y-auto rounded-t-2xl"
      >
        <SheetHeader>
          <SheetTitle>마일리지런 규칙</SheetTitle>
        </SheetHeader>
        <MileageRulesContent />
      </SheetContent>
    </Sheet>
  );
}
