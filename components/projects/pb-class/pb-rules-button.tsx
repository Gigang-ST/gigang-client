"use client";

import { BookOpen } from "lucide-react";

import type { PbClassCfg } from "@/lib/pb-class";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { PbRulesContent } from "./pb-rules-content";

/** 신청 이후 화면의 규칙 진입점 — 마일리지런의 규칙 시트와 같은 모양 */
export function PbRulesButton({ cfg }: { cfg: PbClassCfg }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" className="h-11 w-full gap-2 rounded-xl">
          <BookOpen className="size-4" />
          PB 클래스 규칙
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[80svh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>PB 클래스 규칙</SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-6">
          <PbRulesContent cfg={cfg} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
