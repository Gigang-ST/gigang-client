"use client";

import { useRef, useState, useTransition } from "react";

import { toast } from "sonner";

import { formatKST } from "@/lib/dayjs";
import { REVIEW_MEMO_MAX_LENGTH } from "@/lib/gathering/application";

import {
  approveApplicationAction,
  rejectApplicationAction,
} from "@/app/actions/gathering/manage-application";

import { Avatar } from "@/components/common/avatar";
import { EmptyState } from "@/components/common/empty-state";
import { Body, Caption, Micro, SectionLabel } from "@/components/common/typography";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/**
 * 신청 관리 — **개설자·운영진에게만** 보인다.
 *
 * 모임 상세 다이얼로그 안에 산다. 별도 페이지로 빼지 않는 이유는 도달 경로가 없어서다 —
 * 신청 알림 딥링크도 달력 탭의 다이얼로그(`/schedule?gthr=`)를 열고, 달력에서 모임을 여는
 * 것도 다이얼로그다. 승인만 다른 화면에 두면 **운영진이 알림을 눌러도 승인할 데가 없다.**
 *
 * 무게 걱정은 크지 않다: 권한 있는 사람에게만, 대기 건이 있을 때만 펼쳐지고 처리된 건은
 * 접혀 있다. 목록이 길어져도 다이얼로그가 이미 세로 스크롤(max-h-[85dvh])을 갖고 있다.
 *
 * 설계: docs/superpowers/specs/2026-08-25-모임-참여조건-승인제-design.md §6.2
 */

export type GatheringApplication = {
  mem_id: string;
  mem_nm: string | null;
  avatar_url: string | null;
  aply_st_cd: "pending" | "approved" | "rejected" | "canceled";
  aply_memo_txt: string | null;
  rvw_memo_txt: string | null;
  crt_at: string;
};

const ST_LABEL: Record<GatheringApplication["aply_st_cd"], string> = {
  pending: "대기",
  approved: "확정",
  rejected: "반려",
  canceled: "취소",
};

export function GatheringApplicationsSection({
  gthrId,
  applications,
  onChanged,
  onSelectMember,
}: {
  gthrId: string;
  applications: GatheringApplication[];
  /** 승인·반려 후 호출 — 다이얼로그가 명단과 참석자 목록을 다시 받아 온다. */
  onChanged?: () => void;
  /**
   * 얼굴·이름을 누르면 그 사람 프로필 카드를 연다 — 참석자 목록과 **같은 동작**이다.
   * 카드를 여는 건 이 컴포넌트가 아니라 감싸는 다이얼로그 몫이라(겹쳐 띄워야 한다)
   * 선택만 위로 올린다.
   */
  onSelectMember?: (memId: string, memNm: string) => void;
}) {
  const [rejectTarget, setRejectTarget] = useState<GatheringApplication | null>(null);
  const [reason, setReason] = useState("");
  const [showProcessed, setShowProcessed] = useState(false);
  const [, startTransition] = useTransition();
  const busyRef = useRef(false);

  const pending = applications.filter((a) => a.aply_st_cd === "pending");
  const processed = applications.filter((a) => a.aply_st_cd !== "pending");

  /** 성공 여부를 돌려준다 — 실패한 뒤에도 입력 다이얼로그를 열어 둬야 하므로. */
  async function run(
    fn: () => Promise<{ ok: boolean; message?: string }>,
    okMsg: string,
  ): Promise<boolean> {
    if (busyRef.current) return false;
    busyRef.current = true;
    try {
      const r = await fn();
      if (!r.ok) {
        // 정원 마감·이미 처리됨은 오류가 아니라 상태다 — 문구를 그대로 보여준다.
        toast.error(r.message ?? "처리에 실패했습니다.");
        return false;
      }
      toast.success(okMsg);
      // 승인하면 그 사람이 곧 참석자다 — 명단과 참석자 목록을 같이 다시 받는다.
      onChanged?.();
      return true;
    } finally {
      busyRef.current = false;
    }
  }

  function approve(memId: string) {
    // startTransition 콜백은 void 를 요구한다 — run 의 boolean 반환을 여기선 안 쓴다.
    startTransition(() => {
      void run(() => approveApplicationAction(gthrId, memId), "참가를 확정했어요.");
    });
  }

  function submitReject() {
    const target = rejectTarget;
    if (!target) return;
    startTransition(() => {
      void run(
        () => rejectApplicationAction(gthrId, target.mem_id, reason || undefined),
        "신청을 반려했어요.",
      ).then((succeeded) => {
        // 실패했으면 다이얼로그를 열어 둔다 — 닫으면 방금 적은 사유가 그대로 날아가고,
        // 사용자는 처리된 줄 알고 떠난다(run 은 실패를 던지지 않고 false 로 알린다).
        if (!succeeded) return;
        setRejectTarget(null);
        setReason("");
      });
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <SectionLabel>신청 관리{pending.length > 0 ? ` (${pending.length})` : ""}</SectionLabel>
        {processed.length > 0 && (
          <button
            type="button"
            onClick={() => setShowProcessed((v) => !v)}
            className="py-2 text-[12px] text-muted-foreground"
          >
            처리한 신청 {showProcessed ? "숨기기" : `보기 (${processed.length})`}
          </button>
        )}
      </div>

      {pending.length === 0 ? (
        <EmptyState variant="card" message="대기 중인 신청이 없어요." />
      ) : (
        <div className="flex flex-col gap-2">
          {pending.map((a) => (
            <div
              key={a.mem_id}
              className="flex items-start gap-3 rounded-xl border border-border px-4 py-3"
            >
              {/* 얼굴·이름이 한 버튼 — 12px 아이콘 하나를 겨냥하게 하지 않는다(참석자 목록과 동일). */}
              <button
                type="button"
                onClick={() => a.mem_nm && onSelectMember?.(a.mem_id, a.mem_nm)}
                disabled={!a.mem_nm}
                aria-label={`${a.mem_nm ?? "멤버"} 프로필 보기`}
                className="flex min-w-0 flex-1 items-start gap-3 rounded-lg p-0.5 text-left transition-colors enabled:hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Avatar src={a.avatar_url} seed={a.mem_id} alt={a.mem_nm ?? ""} size="sm" />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <Body className="font-semibold">{a.mem_nm ?? "탈퇴한 멤버"}</Body>
                  {a.aply_memo_txt && (
                    <Caption className="break-words">{a.aply_memo_txt}</Caption>
                  )}
                  <Micro>{formatKST(a.crt_at, "M.DD HH:mm")} 신청</Micro>
                </span>
              </button>
              <div className="flex shrink-0 gap-1.5">
                <Button size="sm" variant="ghost" onClick={() => setRejectTarget(a)}>
                  반려
                </Button>
                <Button size="sm" onClick={() => approve(a.mem_id)}>
                  승인
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showProcessed && processed.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {processed.map((a) => (
            <div key={a.mem_id} className="flex items-center gap-2 px-1">
              <Micro className="w-8 shrink-0 text-muted-foreground">
                {ST_LABEL[a.aply_st_cd]}
              </Micro>
              <button
                type="button"
                onClick={() => a.mem_nm && onSelectMember?.(a.mem_id, a.mem_nm)}
                disabled={!a.mem_nm}
                aria-label={`${a.mem_nm ?? "멤버"} 프로필 보기`}
                className="min-w-0 truncate py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Caption className="truncate">{a.mem_nm ?? "탈퇴한 멤버"}</Caption>
              </button>
              {a.rvw_memo_txt && (
                <Micro className="truncate text-muted-foreground">· {a.rvw_memo_txt}</Micro>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>신청 반려</DialogTitle>
            <DialogDescription>
              {rejectTarget?.mem_nm ?? "이 멤버"}님에게 사유가 그대로 전달돼요. 반려 후에도 다시
              신청할 수 있어요.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Caption className="text-muted-foreground">사유 (선택)</Caption>
            <Input
              value={reason}
              maxLength={REVIEW_MEMO_MAX_LENGTH}
              placeholder="예: 입금이 확인되지 않았어요"
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejectTarget(null)}>
              닫기
            </Button>
            <Button variant="destructive" onClick={submitReject}>
              반려하기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
