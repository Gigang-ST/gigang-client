"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { MileageRulesContent } from "./mileage-rules-content";

export function MileageIntro() {
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-xl border border-border p-6 space-y-4">
      <div className="space-y-2">
        <h2 className="text-lg font-bold">마일리지런이란?</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          🏃‍♂️ 러닝, 🚴 자전거, 🏊 수영 — 뭐든 좋아요!
          <br />
          매월 나만의 목표를 세우고, 기강 크루와 함께 달려보세요.
          <br />
          종목별 활동이 마일리지로 환산되어 달성률로 기록됩니다.
          <br />
          💪 같이 하면 더 멀리 갈 수 있어요!
        </p>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" className="w-full gap-2">
            상세 안내
            <ChevronDown className="size-4" />
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>마일리지런 규칙</DialogTitle>
          </DialogHeader>
          <MileageRulesContent />
        </DialogContent>
      </Dialog>
    </section>
  );
}
