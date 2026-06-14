"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ActivityLogBatchForm } from "./activity-log-batch-form";
import { analytics } from "@/lib/analytics";

type ActivityLogFabProps = {
  evtId: string;
  memId: string;
};

export function ActivityLogFab({ evtId, memId: _memId }: ActivityLogFabProps) {
  const [open, setOpen] = useState(false);
  const [showSuccessNotice, setShowSuccessNotice] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [grantedTitles, setGrantedTitles] = useState<string[]>([]);
  const [titleDismissable, setTitleDismissable] = useState(false);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  const handleSuccess = (count: number, titles: string[]) => {
    analytics.activityLogSaved(count);
    setOpen(false);
    router.refresh();
    window.dispatchEvent(new Event("mileage:refresh"));
    setSavedCount(count);
    setShowSuccessNotice(true);

    if (successTimerRef.current) clearTimeout(successTimerRef.current);
    successTimerRef.current = setTimeout(() => {
      setShowSuccessNotice(false);
      successTimerRef.current = null;

      // 동기부여 창 닫힌 후 칭호 알림 표시
      if (titles.length > 0) {
        setGrantedTitles(titles);
        setTitleDismissable(false);
        if (titleDismissTimerRef.current) clearTimeout(titleDismissTimerRef.current);
        titleDismissTimerRef.current = setTimeout(() => setTitleDismissable(true), 2000);
      }
    }, 3500);
  };

  const dismissTitle = () => {
    if (!titleDismissable) return;
    if (titleDismissTimerRef.current) clearTimeout(titleDismissTimerRef.current);
    setGrantedTitles([]);
    setTitleDismissable(false);
  };

  useEffect(() => {
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      if (titleDismissTimerRef.current) clearTimeout(titleDismissTimerRef.current);
    };
  }, []);

  return (
    <>
      {/* 동기부여 창 */}
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

      {/* 칭호 획득 알림 */}
      {grantedTitles.length > 0 && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={dismissTitle}
        >
          <div className="mx-6 w-full max-w-sm rounded-2xl border border-border bg-background px-6 py-6 shadow-2xl">
            <div className="flex flex-col items-center gap-3 text-center">
              <span className="text-2xl">🏅</span>
              <div className="flex flex-col gap-1">
                <p className="text-xs text-muted-foreground">칭호 획득</p>
                <p className="text-base font-bold text-foreground">
                  {grantedTitles.length === 1
                    ? <>「{grantedTitles[0]}」 칭호를 획득했습니다!</>
                    : <>{grantedTitles.map((t) => `「${t}」`).join(", ")} 칭호를 획득했습니다!</>
                  }
                </p>
              </div>
              <p className={cn("text-[11px] transition-opacity duration-300", titleDismissable ? "text-muted-foreground opacity-100" : "opacity-0")}>
                탭하면 닫힙니다
              </p>
            </div>
          </div>
        </div>
      )}

      <Button
        size="icon"
        className="fixed bottom-24 right-6 z-50 size-14 rounded-full shadow-lg"
        onClick={() => { analytics.activityLogOpened(); setOpen(true); }}
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
