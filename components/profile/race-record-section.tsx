"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, History } from "lucide-react";
import { CardItem } from "@/components/ui/card";
import { SectionLabel } from "@/components/common/typography";
import { RaceRecordDialog } from "./race-record-dialog";
import { RaceHistoryDialog } from "./race-history-dialog";
import type { MemberStatus } from "@/components/races/types";
import type { CachedCmmCdRow } from "@/lib/queries/cmm-cd-cached";

export function RaceRecordSection({
  memberId,
  teamId,
  cmmCdRows,
  competitionRegisterMemberStatus,
}: {
  memberId: string;
  teamId: string;
  cmmCdRows: CachedCmmCdRow[];
  competitionRegisterMemberStatus?: MemberStatus;
}) {
  const [recordOpen, setRecordOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const router = useRouter();

  return (
    <div className="flex flex-col gap-4">
      <SectionLabel>대회 기록</SectionLabel>
      <div className="grid grid-cols-2 gap-3">
        <CardItem variant="dashed" asChild className="py-6">
          <button
            type="button"
            onClick={() => setRecordOpen(true)}
            className="flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground transition-colors active:bg-secondary"
          >
            <Plus className="size-4" />
            기록 입력
          </button>
        </CardItem>
        <CardItem asChild className="py-6">
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            className="flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground transition-colors active:bg-secondary"
          >
            <History className="size-4" />
            과거 기록
          </button>
        </CardItem>
      </div>
      <RaceRecordDialog
        memberId={memberId}
        teamId={teamId}
        cmmCdRows={cmmCdRows}
        open={recordOpen}
        onOpenChange={setRecordOpen}
        competitionRegisterMemberStatus={competitionRegisterMemberStatus}
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
