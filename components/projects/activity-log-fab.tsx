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

export function ActivityLogFab({
  participationId,
  projectId,
}: {
  participationId: string;
  projectId: string;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="fixed bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px)+1rem)] right-4 size-14 rounded-full shadow-lg"
        size="icon"
        aria-label="기록 입력"
      >
        <Plus className="size-6" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[90svh] overflow-y-auto rounded-t-2xl">
          <SheetHeader className="mb-4">
            <SheetTitle>기록 입력</SheetTitle>
          </SheetHeader>
          <ActivityLogForm
            key={open ? "open" : "closed"}
            participationId={participationId}
            projectId={projectId}
            onSuccess={() => { setOpen(false); router.refresh(); }}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
