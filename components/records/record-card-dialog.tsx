"use client";

import { useEffect, useState } from "react";

import type { MemberCardData } from "@/lib/member-card";
import { fetchMemberCardClient } from "@/lib/queries/member-card";

import { RecordCard } from "@/components/records/record-card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

/** 랭킹에서 이름 클릭 시 뜨는 보기 전용 카드 팝업 */
export function RecordCardDialog({
  memId,
  teamId,
  onClose,
}: {
  memId: string | null;
  teamId: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<MemberCardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!memId) return;
    let alive = true;
    setLoading(true);
    setError(false);
    setData(null);
    fetchMemberCardClient(memId, teamId)
      .then((d) => {
        if (alive) setData(d);
      })
      .catch(() => {
        if (alive) setError(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [memId, teamId]);

  return (
    <Dialog open={!!memId} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[380px] border-0 bg-transparent p-0 shadow-none">
        <DialogHeader className="sr-only">
          <DialogTitle>기록 카드</DialogTitle>
        </DialogHeader>
        {loading && (
          <div className="flex h-64 items-center justify-center">
            <LoadingSpinner />
          </div>
        )}
        {error && (
          <p className="py-10 text-center text-sm text-white">
            카드를 불러오지 못했습니다.
          </p>
        )}
        {!loading && !error && data && (
          <div className="flex justify-center">
            <RecordCard data={data} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
