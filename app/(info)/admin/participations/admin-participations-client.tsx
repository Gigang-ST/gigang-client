"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  approveParticipation,
  rejectParticipation,
  revokeApproval,
  deleteParticipation,
} from "@/app/actions/admin/manage-mileage";
import { Check, X, HandCoins, Sparkles, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { H2, Body, Caption } from "@/components/common/typography";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CardItem } from "@/components/ui/card";
import { EmptyState } from "@/components/common/empty-state";
import { SegmentControl } from "@/components/common/segment-control";

type ActiveEvent = {
  evt_id: string;
  evt_nm: string;
  stt_dt: string;
  end_dt: string;
  stts_enm: string;
};

type Participant = {
  prt_id: string;
  evt_id: string;
  mem_id: string;
  mem_nm: string | null;
  stt_mth: string;
  init_goal: number;
  deposit_amt: number;
  entry_fee_amt: number;
  singlet_fee_amt: number;
  has_singlet_yn: boolean;
  aprv_yn: boolean;
  aprv_at: string | null;
  created_at: string;
};

type Tab = "pending" | "approved";

const TABS: { value: Tab; label: string }[] = [
  { value: "pending", label: "승인 대기" },
  { value: "approved", label: "승인 완료" },
];

export function AdminParticipationsClient({ teamId }: { teamId: string }) {
  const [activeEvent, setActiveEvent] = useState<ActiveEvent | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("pending");
  const [processingId, setProcessingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();

    // 활성 이벤트 조회
    const { data: evts } = await supabase
      .from("evt_team_mst")
      .select("evt_id, evt_nm, stt_dt, end_dt, stts_enm")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false });

    const activeEvt =
      (evts ?? []).find((e) => e.stts_enm === "ACTIVE") ??
      (evts ?? [])[0] ??
      null;

    setActiveEvent(activeEvt as ActiveEvent | null);

    if (activeEvt) {
      // 참여자 목록 조회 (mem_mst JOIN)
      const { data: prtData } = await supabase
        .from("evt_team_prt_rel")
        .select(
          "prt_id, evt_id, mem_id, stt_mth, init_goal, deposit_amt, entry_fee_amt, singlet_fee_amt, has_singlet_yn, aprv_yn, aprv_at, created_at",
        )
        .eq("evt_id", activeEvt.evt_id)
        .order("created_at", { ascending: false });

      if (prtData && prtData.length > 0) {
        const memIds = [...new Set(prtData.map((p) => p.mem_id))];
        const { data: members } = await supabase
          .from("mem_mst")
          .select("mem_id, mem_nm")
          .in("mem_id", memIds);

        const memNameById = new Map(
          (members ?? []).map((m) => [m.mem_id, m.mem_nm]),
        );

        setParticipants(
          prtData.map((p) => ({
            ...p,
            mem_nm: memNameById.get(p.mem_id) ?? null,
          })) as Participant[],
        );
      } else {
        setParticipants([]);
      }
    } else {
      setParticipants([]);
    }

    setLoading(false);
  }, [teamId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleApprove = async (prtId: string) => {
    if (!confirm("승인하시겠습니까?")) return;
    setProcessingId(prtId);
    const result = await approveParticipation(prtId);
    if (result.ok) {
      setParticipants((prev) =>
        prev.map((p) =>
          p.prt_id === prtId
            ? { ...p, aprv_yn: true, aprv_at: new Date().toISOString() }
            : p,
        ),
      );
    } else {
      alert(result.message);
    }
    setProcessingId(null);
  };

  const handleReject = async (prtId: string) => {
    if (!confirm("거부하시겠습니까? 참여 신청이 삭제됩니다.")) return;
    setProcessingId(prtId);
    const result = await rejectParticipation(prtId);
    if (result.ok) {
      setParticipants((prev) => prev.filter((p) => p.prt_id !== prtId));
    } else {
      alert(result.message);
    }
    setProcessingId(null);
  };

  const handleRevoke = async (prtId: string) => {
    if (!confirm("승인을 취소하시겠습니까?")) return;
    setProcessingId(prtId);
    const result = await revokeApproval(prtId);
    if (result.ok) {
      setParticipants((prev) =>
        prev.map((p) =>
          p.prt_id === prtId ? { ...p, aprv_yn: false, aprv_at: null } : p,
        ),
      );
    } else {
      alert(result.message);
    }
    setProcessingId(null);
  };

  const handleDelete = async (prtId: string) => {
    if (!confirm("참여자를 삭제하시겠습니까? 기록과 목표가 모두 삭제됩니다.")) return;
    setProcessingId(prtId);
    const result = await deleteParticipation(prtId);
    if (result.ok) {
      setParticipants((prev) => prev.filter((p) => p.prt_id !== prtId));
    } else {
      alert(result.message);
    }
    setProcessingId(null);
  };

  const filteredList = participants.filter((p) =>
    tab === "pending" ? !p.aprv_yn : p.aprv_yn,
  );

  if (loading) {
    return (
      <div className="flex flex-col gap-4 px-6 pt-4">
        <Skeleton className="h-8 w-36 rounded" />
        <Skeleton className="h-20 w-full rounded-2xl" />
        <Skeleton className="h-10 w-full rounded-xl" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-6 pb-6 pt-4">
      <H2>참여자 관리</H2>

      {/* 현재 이벤트 정보 */}
      {activeEvent ? (
        <CardItem className="flex flex-col gap-2 bg-secondary/40">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <Body className="font-semibold">{activeEvent.evt_nm}</Body>
            <Badge
              variant={
                activeEvent.stts_enm === "ACTIVE"
                  ? "default"
                  : activeEvent.stts_enm === "CLOSED"
                    ? "outline"
                    : "secondary"
              }
              className="text-[11px]"
            >
              {activeEvent.stts_enm === "ACTIVE"
                ? "진행중"
                : activeEvent.stts_enm === "CLOSED"
                  ? "종료"
                  : "준비중"}
            </Badge>
          </div>
          <Caption>
            {activeEvent.stt_dt} ~ {activeEvent.end_dt}
          </Caption>
        </CardItem>
      ) : (
        <EmptyState message="등록된 이벤트가 없습니다. 프로젝트 관리에서 먼저 이벤트를 생성하세요." />
      )}

      {activeEvent && (
        <>
          {/* 탭 */}
          <SegmentControl
            segments={TABS}
            value={tab}
            onValueChange={(v) => setTab(v as Tab)}
          />

          <span className="text-[13px] text-muted-foreground">
            {filteredList.length}명
          </span>

          {/* 참여자 목록 */}
          <div className="flex flex-col gap-3">
            {filteredList.map((prt) => (
              <CardItem key={prt.prt_id} className="flex flex-col gap-3">
                {/* 헤더 */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Body className="font-semibold">
                      {prt.mem_nm ?? "이름 없음"}
                    </Body>
                    {prt.has_singlet_yn && (
                      <Badge variant="outline" className="text-[11px]">
                        싱글렛
                      </Badge>
                    )}
                  </div>
                  {!prt.aprv_yn && (
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        onClick={() => handleApprove(prt.prt_id)}
                        disabled={processingId === prt.prt_id}
                        className="h-8 rounded-lg gap-1 text-[13px]"
                      >
                        <Check className="size-3.5" />
                        승인
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleReject(prt.prt_id)}
                        disabled={processingId === prt.prt_id}
                        className="h-8 rounded-lg gap-1 text-[13px] text-destructive hover:text-destructive"
                      >
                        <X className="size-3.5" />
                        거부
                      </Button>
                    </div>
                  )}
                  {prt.aprv_yn && (
                    <div className="flex items-center gap-1.5">
                      <Badge variant="default" className="text-[11px]">
                        승인완료
                      </Badge>
                      <Button
                        size="icon-sm"
                        variant="outline"
                        onClick={() => handleRevoke(prt.prt_id)}
                        disabled={processingId === prt.prt_id}
                        className="rounded-lg"
                        aria-label="승인 취소"
                      >
                        <Undo2 className="size-3.5" />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="outline"
                        onClick={() => handleDelete(prt.prt_id)}
                        disabled={processingId === prt.prt_id}
                        className="rounded-lg text-destructive hover:text-destructive"
                        aria-label="삭제"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  )}
                </div>

                {/* 상세 정보 */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  <ParticipantInfoItem
                    label="시작월"
                    value={prt.stt_mth?.slice(0, 7) ?? "-"}
                  />
                  <ParticipantInfoItem
                    label="초기 목표"
                    value={`${prt.init_goal.toLocaleString()} km`}
                  />
                  <ParticipantInfoItem
                    label="보증금"
                    value={`${prt.deposit_amt.toLocaleString()}원`}
                  />
                  <ParticipantInfoItem
                    label="참가비"
                    value={`${prt.entry_fee_amt.toLocaleString()}원`}
                  />
                  <ParticipantInfoItem
                    label="싱글렛"
                    value={prt.has_singlet_yn ? "있음" : "없음"}
                  />
                  {prt.aprv_yn && prt.aprv_at && (
                    <ParticipantInfoItem
                      label="승인일"
                      value={prt.aprv_at.slice(0, 10)}
                    />
                  )}
                </div>
              </CardItem>
            ))}
          </div>

          {filteredList.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-12">
              <HandCoins className="size-12 text-muted-foreground/30" />
              <p className="text-[15px] text-muted-foreground">
                {tab === "pending"
                  ? "승인 대기 중인 참여자가 없습니다"
                  : "승인된 참여자가 없습니다"}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ParticipantInfoItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <Caption>{label}</Caption>
      <span className="text-[14px] font-medium text-foreground">{value}</span>
    </div>
  );
}
