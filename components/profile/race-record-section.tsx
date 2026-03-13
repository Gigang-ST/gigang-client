"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, History } from "lucide-react";
import { RaceRecordDialog } from "./race-record-dialog";
import { RaceHistoryDialog } from "./race-history-dialog";

export function RaceRecordSection({ memberId }: { memberId: string }) {
  const [recordOpen, setRecordOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const router = useRouter();

  return (
    <div className="flex flex-col gap-4">
      <span className="text-xs font-semibold tracking-widest text-muted-foreground">
        대회 기록
      </span>
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setRecordOpen(true)}
          className="flex items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-border py-6 text-sm font-medium text-muted-foreground transition-colors active:bg-secondary"
        >
          <Plus className="size-4" />
          기록 입력
        </button>
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          className="flex items-center justify-center gap-2 rounded-2xl border-[1.5px] border-border py-6 text-sm font-medium text-muted-foreground transition-colors active:bg-secondary"
        >
          <History className="size-4" />
          과거 기록
        </button>
      </div>
      <RaceRecordDialog
        memberId={memberId}
        open={recordOpen}
        onOpenChange={setRecordOpen}
        onSaved={() => {
          setRecordOpen(false);
          router.refresh();
        }}
      />
      <RaceHistoryDialog
        memberId={memberId}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        onChanged={() => router.refresh()}
      />
    </div>
  );
}
