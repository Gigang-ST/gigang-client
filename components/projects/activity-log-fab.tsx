"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ActivityLogForm } from "./activity-log-form";

type ActivityLogFabProps = {
  evtId: string;
  memId: string;
};

export function ActivityLogFab({ evtId, memId }: ActivityLogFabProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const handleSuccess = () => {
    setOpen(false);
    router.refresh();
    window.dispatchEvent(new Event("mileage:refresh"));
  };

  return (
    <>
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
          className="max-h-[90svh] overflow-y-auto rounded-t-2xl"
        >
          <SheetHeader className="mb-4">
            <SheetTitle>기록 입력</SheetTitle>
          </SheetHeader>
          <ActivityLogForm
            key={open ? "open" : "closed"}
            evtId={evtId}
            memId={memId}
            onSuccess={handleSuccess}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
