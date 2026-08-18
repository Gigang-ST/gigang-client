"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  getTitleHistory,
  type TitleHistoryEntry,
} from "@/app/actions/profile/title-history";
import { formatKST } from "@/lib/dayjs";

import { TitleBadge } from "@/components/common/title-badge";
import {
  ResponsiveDrawer,
  ResponsiveDrawerContent,
  ResponsiveDrawerHeader,
  ResponsiveDrawerTitle,
} from "@/components/common/responsive-drawer";
import { Body, Caption, Micro } from "@/components/common/typography";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; entries: TitleHistoryEntry[] }
  | { status: "error"; message: string };

/**
 * 칭호 획득 이력 시트 — 언제 무슨 칭호를 땄나.
 *
 * **도감(`CollectionSheet`)과 축이 다르다.** 도감은 등급·카테고리 순으로 "뭘 모았나"를
 * 보여주고 여기는 시간 역순으로 "언제 땄나"를 보여준다. 칭호는 대부분 조용히 붙기 때문에
 * (알림을 놓치면 언제 생겼는지 알 길이 없다) 시간축이 따로 필요하다 —
 * `ttl_grnt` 알림의 딥링크도 이 시트로 온다.
 *
 * 구조는 활동량 내역 시트(`ActvHistorySheet`)를 그대로 따른다: 같은 바텀시트, 같은
 * 로딩·에러·빈 상태, 같은 좌측 날짜 열. 두 "내역"이 다르게 생길 이유가 없다.
 */
export function TitleHistorySheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  // 연속 탭으로 요청이 겹칠 때 늦게 온 응답이 화면을 덮어쓰지 않게 한다(ActvHistorySheet와 동일).
  const reqIdRef = useRef(0);

  const load = useCallback(async () => {
    const reqId = ++reqIdRef.current;
    setState({ status: "loading" });

    // 서버 액션은 결과값으로 실패를 돌려주지만(내부 try/catch), **전송 자체가 실패하면 던진다**
    // — 오프라인·배포 중 등. 안 잡으면 화면이 스켈레톤에 갇히고 재시도 버튼도 없어
    // 시트를 닫았다 여는 것 말고 빠져나갈 길이 없다.
    let result: Awaited<ReturnType<typeof getTitleHistory>>;
    try {
      result = await getTitleHistory();
    } catch (e) {
      console.error("[TitleHistorySheet] 이력 요청 실패", e);
      if (reqId === reqIdRef.current) {
        setState({ status: "error", message: "잠시 후 다시 시도해 주세요" });
      }
      return;
    }
    if (reqId !== reqIdRef.current) return;

    setState(
      result.ok
        ? { status: "ready", entries: result.entries }
        : { status: "error", message: result.message },
    );
  }, []);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [open, load]);

  return (
    <ResponsiveDrawer open={open} onOpenChange={onOpenChange}>
      {/* 스크롤은 안쪽 div가 건다 — 이 Content는 vaul이 "밀어서 닫기"를 잡는 판이라
          여기에 overflow를 걸면 목록이 드래그에 먹힌다(ActvHistorySheet의 같은 주석). */}
      <ResponsiveDrawerContent
        className="flex flex-col gap-0 p-0"
        dialogClassName="max-h-[85dvh] max-w-lg overflow-hidden"
        drawerClassName="h-[80dvh] max-h-[80dvh]"
      >
        <ResponsiveDrawerHeader className="shrink-0 border-b border-border px-4 py-4 text-left">
          <ResponsiveDrawerTitle>칭호 획득 이력</ResponsiveDrawerTitle>
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
                <Body className="font-semibold">이력을 불러오지 못했어요</Body>
                <Caption>{state.message}</Caption>
              </div>
              <Button size="sm" variant="outline" onClick={() => void load()}>
                다시 시도
              </Button>
            </div>
          )}

          {state.status === "ready" && state.entries.length === 0 && (
            <div className="flex flex-col items-center gap-1.5 py-8 text-center">
              <Body className="font-semibold">아직 획득한 칭호가 없어요</Body>
              <Caption>모임 참석·대회 출전·기록 등록으로 하나씩 붙어요.</Caption>
            </div>
          )}

          {state.status === "ready" && state.entries.length > 0 && (
            <ul className="flex flex-col">
              {state.entries.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center gap-3 border-b border-border py-2.5"
                >
                  {/* `grnt_at`은 timestamptz라 반드시 KST로 환산해 찍는다 — 그냥 format하면
                      배포처(UTC) 기준으로 하루 밀린다(§CLAUDE.md 날짜 규칙). 연도까지 쓰는 건
                      이 목록이 가입 시점부터 몇 해에 걸치기 때문이다(활동량 내역은 이번 달뿐이라 M.DD). */}
                  <span className="w-[68px] shrink-0 font-numeric text-[12px] text-muted-foreground tabular-nums">
                    {formatKST(entry.grnt_at, "YYYY.M.D")}
                  </span>
                  <div className="flex min-w-0 flex-1 items-center gap-1.5">
                    <TitleBadge
                      name={entry.ttl_nm}
                      effect="none"
                      size="xs"
                      tooltip={{
                        desc: entry.ttl_desc,
                        visibility: entry.desc_visibility,
                        isHeld: true,
                      }}
                    />
                  </div>
                  {/* 자동 획득이 대부분이라 그쪽엔 아무 말도 안 붙인다 — 전 줄에 "자동"이
                      붙으면 정보가 아니라 배경이 된다. 드문 쪽(운영진 수여)만 표시한다. */}
                  {!entry.auto && (
                    <Micro className="shrink-0">운영진 수여</Micro>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </ResponsiveDrawerContent>
    </ResponsiveDrawer>
  );
}
