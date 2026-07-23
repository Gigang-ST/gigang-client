"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  getActvHistory,
  type ActvHistoryEntry,
} from "@/app/actions/story/actv-history";
import { ACTV_HELP_TEXT, getActvMonthLabel, getActvTypeLabel } from "@/lib/activity-index";
import { dayjs } from "@/lib/dayjs";
import { cn } from "@/lib/utils";

import { Body, Caption } from "@/components/common/typography";
import {
  ResponsiveDrawer,
  ResponsiveDrawerContent,
  ResponsiveDrawerHeader,
  ResponsiveDrawerTitle,
} from "@/components/common/responsive-drawer";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; entries: ActvHistoryEntry[]; total: number }
  | { status: "error"; message: string };

/**
 * 활동량 내역 시트 — 이번 달에 뭘 해서 얼마나 쌓였는지.
 *
 * 랭킹 숫자만 보여주면 "저 사람은 왜 나보다 높은가"에 답이 없다. 내역이 그 답이다.
 * 구간·정렬은 랭킹과 같고(`getActvMonthRange`), 하단 합계가 랭킹 숫자와 일치해야 한다.
 *
 * 모바일 바텀시트 / 데스크톱 다이얼로그 분기와 뒤로가기-닫기 연동은 `ResponsiveDrawer`가 맡는다.
 */
export function ActvHistorySheet({
  memId,
  memNm,
  open,
  onOpenChange,
}: {
  /** null이면 닫힌 상태로 취급 */
  memId: string | null;
  memNm: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  // 연속 탭으로 요청이 겹칠 때 늦게 온 응답이 화면을 덮어쓰지 않게 한다.
  const reqIdRef = useRef(0);

  const load = useCallback(async () => {
    if (!memId) return;
    const reqId = ++reqIdRef.current;
    setState({ status: "loading" });

    const result = await getActvHistory(memId);
    if (reqId !== reqIdRef.current) return;

    setState(
      result.ok
        ? { status: "ready", entries: result.entries, total: result.total }
        : { status: "error", message: result.message },
    );
  }, [memId]);

  useEffect(() => {
    if (!open || !memId) return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [open, memId, load]);

  const month = getActvMonthLabel();

  return (
    <ResponsiveDrawer open={open && memId !== null} onOpenChange={onOpenChange}>
      <ResponsiveDrawerContent className="max-h-[80svh] overflow-y-auto">
        <ResponsiveDrawerHeader>
          <ResponsiveDrawerTitle>
            {memNm} · {month} 활동 내역
          </ResponsiveDrawerTitle>
        </ResponsiveDrawerHeader>

        <div className="px-4 pb-6">
          {state.status === "loading" && (
            <div className="flex flex-col gap-3 pt-2">
              <Skeleton className="h-10 w-full rounded" />
              <Skeleton className="h-10 w-full rounded" />
              <Skeleton className="h-10 w-full rounded" />
            </div>
          )}

          {state.status === "error" && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <div className="flex flex-col gap-1.5">
                <Body className="font-semibold">내역을 불러오지 못했어요</Body>
                <Caption>{state.message}</Caption>
              </div>
              <Button size="sm" variant="outline" onClick={() => void load()}>
                다시 시도
              </Button>
            </div>
          )}

          {state.status === "ready" && state.entries.length === 0 && (
            <div className="flex flex-col items-center gap-1.5 py-8 text-center">
              <Body className="font-semibold">이번 달 활동이 아직 없습니다</Body>
              <Caption>{ACTV_HELP_TEXT}</Caption>
            </div>
          )}

          {state.status === "ready" && state.entries.length > 0 && (
            <>
              <ul className="flex flex-col">
                {state.entries.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-center gap-3 border-b border-border py-2.5"
                  >
                    <span className="w-11 shrink-0 font-numeric text-[12px] text-muted-foreground tabular-nums">
                      {dayjs(entry.aply_dt).format("M.DD")}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[14px] text-foreground">
                        {getActvTypeLabel(entry.actv_type)}
                      </span>
                      {/* 회수 행은 왜 깎였는지가 본문만큼 중요하다 */}
                      {entry.rsn_txt && (
                        <span className="truncate text-[11px] text-muted-foreground">
                          {entry.rsn_txt}
                        </span>
                      )}
                    </div>
                    <span
                      className={cn(
                        "shrink-0 font-numeric text-[14px] font-medium tabular-nums",
                        entry.amount < 0 ? "text-destructive" : "text-foreground",
                      )}
                    >
                      {entry.amount > 0 ? `+${entry.amount}` : entry.amount}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="flex items-center justify-between pt-3">
                <span className="text-[13px] font-semibold text-foreground">
                  {month} 합계
                </span>
                <span className="font-numeric text-[17px] font-medium text-foreground tabular-nums">
                  {state.total.toLocaleString()}
                </span>
              </div>
            </>
          )}
        </div>
      </ResponsiveDrawerContent>
    </ResponsiveDrawer>
  );
}
