"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ActivityLogBatchForm } from "./activity-log-batch-form";

type ActivityLogFabProps = {
  evtId: string;
  memId: string;
};

export function ActivityLogFab({ evtId, memId: _memId }: ActivityLogFabProps) {
  const [open, setOpen] = useState(false);
  const [showSuccessNotice, setShowSuccessNotice] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  const handleSuccess = (count: number) => {
    setOpen(false);
    router.refresh();
    window.dispatchEvent(new Event("mileage:refresh"));
    setSavedCount(count);
    setShowSuccessNotice(true);

    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current);
    }
    successTimerRef.current = setTimeout(() => {
      setShowSuccessNotice(false);
      successTimerRef.current = null;
    }, 3500);
  };

  useEffect(() => {
    return () => {
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current);
      }
    };
  }, []);

  return (
    <>
      {showSuccessNotice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="mx-6 w-full max-w-sm rounded-2xl bg-primary px-6 py-7 text-primary-foreground shadow-2xl">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="flex size-14 items-center justify-center rounded-full bg-white/20">
                <Check className="size-7" />
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-sm opacity-70">{savedCount}건 등록완료</p>
                <p className="text-xl font-bold leading-snug">
                  동기부여를 위해<br />러닝기록을 단톡방에<br />올려주세요!
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <Button
        size="icon"
        className="fixed bottom-24 right-6 z-50 size-14 rounded-full shadow-lg"
        onClick={() => setOpen(true)}
        aria-label="기록 입력"
      >
        <Plus className="size-6" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[90svh] overflow-y-auto rounded-t-2xl px-6"
          showCloseButton={false}
        >
          <SheetHeader className="px-0 pt-4 pb-0">
            <SheetTitle>기록 입력</SheetTitle>
          </SheetHeader>
          <ActivityLogBatchForm
            key={open ? "open-batch" : "closed-batch"}
            evtId={evtId}
            onSuccess={handleSuccess}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
