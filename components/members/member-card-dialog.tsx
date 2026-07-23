"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { getPublicMemberCard } from "@/lib/queries/member-card";
import { cn } from "@/lib/utils";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Body, Caption } from "@/components/common/typography";
import { IntroEditDialog } from "@/components/members/intro-edit-dialog";
import { MemberCardDetail } from "@/components/members/member-card-detail";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import type { MemberCardData } from "@/lib/queries/member-card";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; data: MemberCardData }
  /** RPC가 null 반환 — 탈퇴·비활성·미소속. 사유는 구분해서 노출하지 않는다 */
  | { status: "gone" }
  | { status: "error" };

/**
 * 멤버 프로필 카드 다이얼로그.
 *
 * 오픈 시 RPC 1회 조회(prefetch 없음). 다른 다이얼로그 위에 겹칠 수 있어(`stacked`)
 * 모임 상세처럼 이미 열려 있는 시트 위에서도 쓸 수 있다.
 *
 * 모바일에서도 바텀시트가 아니라 **가운데 팝업**이다 — 카드는 손에 쥐는 물건처럼
 * 화면 중앙에 떠 있어야 하고, 시트로 올라오면 상단 스크린 존이 뷰포트 위쪽으로 밀려
 * 프레임·칭호 이펙트가 잘린다.
 */
export function MemberCardDialog({
  memId,
  memNm,
  teamId,
  open,
  onOpenChange,
  stacked = false,
  isOwner = false,
  onIntroSaved,
}: {
  /** null이면 닫힌 상태로 취급 — 호출부가 선택된 멤버를 비울 때 */
  memId: string | null;
  /** RPC 실패·탈퇴 폴백에 쓸 이름(호출부가 이미 알고 있는 값) */
  memNm?: string;
  teamId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 다른 다이얼로그 위에 열릴 때 z-index를 올린다 */
  stacked?: boolean;
  /** 본인 카드 — 한마디를 여기서 바로 수정할 수 있다 */
  isOwner?: boolean;
  /**
   * 본인이 이 카드 안에서 한마디를 수정했을 때 호출부에 알린다.
   * 호출부(예: ProfileCard)가 카드 밖에서 같은 한마디를 따로 표시하면
   * 서버 리페치 전까지 두 표시가 어긋나므로, 여기로 갱신값을 흘려준다.
   */
  onIntroSaved?: (next: string) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [introOpen, setIntroOpen] = useState(false);

  // 연속 탭으로 요청이 겹칠 때 늦게 온 응답이 화면을 덮어쓰지 않게 한다.
  const reqIdRef = useRef(0);

  const load = useCallback(async () => {
    if (!memId) return;
    const reqId = ++reqIdRef.current;
    setState({ status: "loading" });

    try {
      const data = await getPublicMemberCard(supabase, memId, teamId);
      if (reqId !== reqIdRef.current) return;
      setState(data ? { status: "ready", data } : { status: "gone" });
    } catch (error) {
      if (reqId !== reqIdRef.current) return;
      console.error("[MemberCardDialog] 카드 조회 실패", error);
      setState({ status: "error" });
    }
  }, [memId, teamId, supabase]);

  useEffect(() => {
    if (!open || !memId) return;
    // 오픈 직후 동기 setState로 인한 연쇄 렌더를 피해 다음 태스크로 넘긴다.
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [open, memId, load]);

  return (
    <Dialog open={open && memId !== null} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex max-h-[88dvh] w-[calc(100%-2rem)] max-w-sm flex-col gap-0 overflow-hidden rounded-2xl border-none bg-transparent p-0 shadow-none",
          // 닫기 X가 어두운 스크린 존 위에 얹히므로 밝은 색으로 뒤집는다
          "[&>button:last-child]:right-3 [&>button:last-child]:top-3 [&>button:last-child]:text-board-muted [&>button:last-child]:hover:text-board-foreground",
          stacked && "z-[60]",
        )}
        overlayClassName={stacked ? "z-[60]" : undefined}
      >
        {/* 카드 자체가 제목 역할을 하므로 시각적 헤더는 두지 않는다(스크린리더용만) */}
        <DialogHeader className="sr-only">
          <DialogTitle>{memNm ? `${memNm} 프로필` : "멤버 프로필"}</DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto">
          {state.status === "loading" && <MemberCardSkeleton />}

          {state.status === "ready" && memId && (
            <MemberCardDetail
              memId={memId}
              data={state.data}
              onEditIntro={isOwner ? () => setIntroOpen(true) : undefined}
            />
          )}

          {state.status === "gone" && (
            <div className="flex flex-col items-center gap-1.5 rounded-2xl border-[1.5px] border-dashed border-border p-8 text-center">
              <Body className="font-semibold">
                {memNm ? `${memNm}님` : "이 멤버"}은 함께 달렸던 멤버예요
              </Body>
              <Caption>지금은 기강에서 활동하고 있지 않아요.</Caption>
            </div>
          )}

          {state.status === "error" && (
            <div className="flex flex-col items-center gap-3 rounded-2xl border-[1.5px] border-border p-8 text-center">
              <div className="flex flex-col gap-1.5">
                <Body className="font-semibold">프로필을 불러오지 못했어요</Body>
                <Caption>잠시 후 다시 시도해 주세요.</Caption>
              </div>
              <Button size="sm" variant="outline" onClick={() => void load()}>
                다시 시도
              </Button>
            </div>
          )}
        </div>
      </DialogContent>

      {isOwner && (
        <IntroEditDialog
          open={introOpen}
          onOpenChange={setIntroOpen}
          initialValue={state.status === "ready" ? (state.data.intro_txt ?? "") : ""}
          // 카드를 다시 조회하지 않고 열려 있는 화면의 값만 갈아끼운다.
          onSaved={(next) => {
            setState((prev) =>
              prev.status === "ready"
                ? { status: "ready", data: { ...prev.data, intro_txt: next || null } }
                : prev,
            );
            // 카드 밖에서 같은 한마디를 표시하는 호출부도 함께 갱신한다.
            onIntroSaved?.(next);
          }}
          stacked
        />
      )}
    </Dialog>
  );
}

/** 실제 카드 레이아웃(스크린 존 + 3개 존)을 모사한 스켈레톤 */
function MemberCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border-[1.5px] border-border">
      <div className="flex flex-col items-center gap-2.5 bg-board px-5 py-6">
        <Skeleton className="size-24 rounded-full bg-board-line" />
        <Skeleton className="h-6 w-28 rounded bg-board-line" />
        <Skeleton className="h-4 w-20 rounded bg-board-line" />
        <Skeleton className="h-4 w-40 rounded bg-board-line" />
      </div>
      <div className="flex flex-col gap-5 bg-card p-5">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-16 rounded" />
          <Skeleton className="h-4 w-full rounded" />
          <Skeleton className="h-4 w-4/5 rounded" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Skeleton className="h-16 rounded-2xl" />
          <Skeleton className="h-16 rounded-2xl" />
          <Skeleton className="h-16 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
