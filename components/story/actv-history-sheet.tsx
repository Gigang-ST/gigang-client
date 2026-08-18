"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  getActvHistory,
  type ActvHistoryEntry,
} from "@/app/actions/story/actv-history";
import { ACTV_HELP_TEXT, getActvMonthLabel, getActvTypeLabel } from "@/lib/activity-index";
import { dayjs } from "@/lib/dayjs";

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

    // 서버 액션은 결과값으로 실패를 돌려주지만(내부 try/catch), **전송 자체가 실패하면 던진다**
    // — 오프라인·배포 중 등. 안 잡으면 화면이 스켈레톤에 갇히고 재시도 버튼도 없어
    // 시트를 닫았다 여는 것 말고 빠져나갈 길이 없다(`TitleHistorySheet`와 같은 처리).
    let result: Awaited<ReturnType<typeof getActvHistory>>;
    try {
      result = await getActvHistory(memId);
    } catch (e) {
      console.error("[ActvHistorySheet] 내역 요청 실패", e);
      if (reqId === reqIdRef.current) {
        setState({ status: "error", message: "잠시 후 다시 시도해 주세요" });
      }
      return;
    }
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
      {/* 스크롤은 **안쪽 div**가 건다. 예전엔 `overflow-y-auto`를 이 Content에 직접 걸었는데,
          이 요소는 vaul이 "밀어서 닫기" 제스처를 잡는 판이라 세로 스크롤이 드래그에 먹혀
          목록이 아예 안 움직였다. 바깥은 높이를 정해 flex 기둥만 세우고(`h-[80dvh] flex-col`),
          안쪽 `flex-1 overflow-y-auto`가 스크롤러가 된다(과거 기록 다이얼로그와 같은 정본). */}
      <ResponsiveDrawerContent
        className="flex flex-col gap-0 p-0"
        dialogClassName="max-h-[85dvh] max-w-lg overflow-hidden"
        drawerClassName="h-[80dvh] max-h-[80dvh]"
      >
        <ResponsiveDrawerHeader className="shrink-0 border-b border-border px-4 py-4 text-left">
          <ResponsiveDrawerTitle>
            {memNm} · {month} 활동 내역
          </ResponsiveDrawerTitle>
        </ResponsiveDrawerHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-6 pt-2">
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
                      {/* 무엇으로 얻었는지 — 예: "정모 참석: 6월 정기런" */}
                      {entry.rsn_txt && (
                        <span className="truncate text-[11px] text-muted-foreground">
                          {entry.rsn_txt}
                        </span>
                      )}
                    </div>
                    {/* 회수된 짝은 목록에서 빠지므로 여기 금액은 항상 획득 순액(양수)이다 */}
                    <span className="shrink-0 font-numeric text-[14px] font-medium text-foreground tabular-nums">
                      +{entry.amount}
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
