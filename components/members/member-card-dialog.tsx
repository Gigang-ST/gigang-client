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
 * 사람 단위 카드 캐시(모듈 스코프 = 탭을 옮겨 다녀도 유지, 새로고침하면 사라짐).
 *
 * 카드를 여는 자리가 여섯 곳인데 전광판·격자·랭킹에서는 **여러 명을 연달아 눌러보는** 게
 * 기본 사용 패턴이다. 캐시가 없으면 방금 닫은 사람을 다시 열어도 스켈레톤부터 다시 시작한다.
 *
 * **Map인 게 핵심이다** — "마지막 한 명"만 들고 있으면 준민↔서준을 번갈아 볼 때 매번 미스라
 * 캐시가 있으나 마나다. 여러 명이 동시에 남아야 두 바퀴째부터 전부 즉시 뜬다.
 *
 * 상한은 두지 않는다. payload가 수 KB고 한 세션에 열어보는 사람이 많아야 수십 명이라
 * 메모리가 문제될 규모가 아닌데, 상한을 두면 "몇 개까지·뭘 먼저 버릴지"를 정해야 한다.
 *
 * `null`(탈퇴·비활성)은 캐시하지 않는다 — 드문 경로라 얻는 게 없고, 그 사이 재가입한
 * 사람이 계속 "함께 달렸던 멤버"로 남는 쪽이 손해다.
 */
const cardCache = new Map<string, MemberCardData>();

/** 같은 mem_id라도 팀이 다르면 다른 카드다 — 키에 team_id를 함께 넣는다. */
const cacheKey = (teamId: string, memId: string) => `${teamId}:${memId}`;

/**
 * 멤버 프로필 카드 다이얼로그 — **공개판 전용**.
 *
 * 오픈 시 RPC 1회 조회(prefetch 없음). 다른 다이얼로그 위에 겹칠 수 있어(`stacked`)
 * 모임 상세처럼 이미 열려 있는 시트 위에서도 쓸 수 있다.
 *
 * **내 카드를 열어도 편집 어포던스가 없다.** 고치는 자리는 프로필탭 한 곳이고, 이 팝업은
 * "남들에게 보이는 내 카드"를 확인하는 자리다 — 여기서 손을 대면 그 성격이 흐려지고 같은 값을
 * 두 곳에서 고치게 된다(예전엔 `isOwner`로 한마디만 열어 뒀는데, 프로필탭이 전부 편집하게
 * 되면서 그 예외가 필요 없어졌다).
 *
 * 모바일에서도 바텀시트가 아니라 **가운데 팝업**이다 — 카드는 손에 쥐는 물건처럼
 * 화면 중앙에 떠 있어야 하고, 시트로 올라오면 상단 스크린 존이 뷰포트 위쪽으로 밀려
 * 프레임·칭호 이펙트가 잘린다.
 */
export interface MemberCardDialogProps {
  /** null이면 닫힌 상태로 취급 — 호출부가 선택된 멤버를 비울 때 */
  memId: string | null;
  /** RPC 실패·탈퇴 폴백에 쓸 이름(호출부가 이미 알고 있는 값) */
  memNm?: string;
  teamId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 다른 다이얼로그 위에 열릴 때 z-index를 올린다 */
  stacked?: boolean;
}

export function MemberCardDialog({
  memId,
  memNm,
  teamId,
  open,
  onOpenChange,
  stacked = false,
}: MemberCardDialogProps) {
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState<LoadState>({ status: "loading" });
  /**
   * 보는 사람이 로그인했나 — 비로그인이면 카드 아래 실적 존을 가린다(§MemberCardDetail).
   *
   * 호출부에서 prop으로 받지 않고 **여기서 직접 확인**한다. 이 카드를 여는 자리가 여섯 곳인데
   * (전광판·격자·랭킹·모임·프로필·일정) 그중 로그인 여부를 이미 아는 곳은 일부뿐이라,
   * prop으로 내리면 한 곳만 안 넘겨도 그 경로에서 조용히 다 보인다. 가림막은 빠뜨리면
   * 티가 안 나는 종류라 판정을 카드 쪽에 둔다.
   *
   * `null`은 "아직 모름" — 확인 전에는 가리지도 열지도 않는다(한 프레임 깜빡임 방지).
   */
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);

  // 연속 탭으로 요청이 겹칠 때 늦게 온 응답이 화면을 덮어쓰지 않게 한다.
  const reqIdRef = useRef(0);

  /**
   * 카드 조회 — stale-while-revalidate.
   *
   * 캐시가 있으면 그걸 **먼저 그리고**(stale) 조회는 그대로 진행해 갱신한다(revalidate).
   * 사용자는 스켈레톤을 건너뛰고, 그 사이 오른 응원 수 같은 건 조용히 따라붙는다.
   * 재검증이 실패하면 화면을 에러로 바꾸지 않는다 — 보이는 게 조금 낡았을 뿐 멀쩡한데
   * 지울 이유가 없다. 캐시 없이 실패했을 때만 재시도 UI를 띄운다.
   */
  const load = useCallback(async () => {
    if (!memId) return;
    const reqId = ++reqIdRef.current;
    const key = cacheKey(teamId, memId);
    const cached = cardCache.get(key);
    setState(cached ? { status: "ready", data: cached } : { status: "loading" });

    try {
      const data = await getPublicMemberCard(supabase, memId, teamId);
      if (reqId !== reqIdRef.current) return;
      if (data) cardCache.set(key, data);
      setState(data ? { status: "ready", data } : { status: "gone" });
    } catch (error) {
      if (reqId !== reqIdRef.current) return;
      console.error("[MemberCardDialog] 카드 조회 실패", error);
      if (cached) return;
      setState({ status: "error" });
    }
  }, [memId, teamId, supabase]);

  useEffect(() => {
    if (!open || !memId) return;

    // 페이스 추이 차트(recharts)는 무거워서 dynamic인데, `ready`가 돼야 렌더되는 탓에
    // 청크 다운로드가 RPC **뒤에** 직렬로 붙는다. 여는 순간 미리 찔러 둘을 나란히 보낸다.
    void import("@/components/profile/pace-chart");

    // 오픈 직후 동기 setState로 인한 연쇄 렌더를 피해 다음 태스크로 넘긴다.
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [open, memId, load]);

  // 로그인 여부 — 카드를 열 때 한 번 확인한다(카드 조회와 나란히 나가므로 지연이 안 늘어난다).
  //
  // `getUser()`가 아니라 `getSession()`인 이유: 전자는 매번 인증 서버로 왕복해 카드 조회와
  // 같은 크기의 지연을 하나 더 만든다. 여기서 쓰는 판정은 **실적 존을 가릴지 말지**라는
  // 코스메틱 게이트라 로컬 세션만 봐도 충분하다 — 카드 RPC 자체가 `SECURITY DEFINER`로
  // 비로그인에게도 공개되는 값이라(랭킹 공개 정책과 동일) 세션을 위조해도 얻는 게 없다.
  // 서버 판정이 필요한 자리였다면 `getSession()`을 쓰면 안 된다.
  useEffect(() => {
    if (!open) return;
    let active = true;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      setLoggedIn(!error && data.session != null);
    });
    return () => {
      active = false;
    };
  }, [open, supabase]);

  return (
    <Dialog open={open && memId !== null} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex max-h-[88dvh] w-[calc(100%-2rem)] max-w-sm flex-col gap-0 overflow-visible rounded-2xl border-none bg-transparent p-0 shadow-none",
          // 닫기 X가 어두운 스크린 존 위에 얹히므로 밝은 색으로 뒤집고, sticky 스크린 존(z-10)
          // 위로 오도록 z를 더 올린다(안 그러면 스크롤 시 X가 스크린 존에 가려진다).
          "[&>button:last-child]:z-20 [&>button:last-child]:right-3 [&>button:last-child]:top-3 [&>button:last-child]:text-board-muted [&>button:last-child]:hover:text-board-foreground",
          stacked && "z-[60]",
        )}
        overlayClassName={stacked ? "z-[60]" : undefined}
      >
        {/* 카드 자체가 제목 역할을 하므로 시각적 헤더는 두지 않는다(스크린리더용만) */}
        <DialogHeader className="sr-only">
          <DialogTitle>{memNm ? `${memNm} 프로필` : "멤버 프로필"}</DialogTitle>
        </DialogHeader>

        {/* 스크롤은 카드(MemberCardDetail) 내부에서 처리한다 — 스크린 존 sticky가 깨지지 않도록
            여기서 overflow를 걸지 않는다. 스켈레톤·폴백은 짧아 넘칠 일이 없다.
            **flex flex-col + min-h-0**: 이 래퍼가 flex 컨테이너여야 자식(카드 루트)이 `flex-1`로
            부모 높이를 flex 흐름으로 받아 shrink한다. 이게 없으면 카드 루트의 `max-h-full`
            (=max-height:100%)이 참조할 확정 높이가 없어 무력화되고, 스크롤이 안 걸린다. */}
        <div className="flex min-h-0 flex-1 flex-col">
          {state.status === "loading" && <MemberCardSkeleton />}

          {state.status === "ready" && memId && (
            <MemberCardDetail
              memId={memId}
              data={state.data}
              // 확인 전(null)에는 가리지 않는다 — 잠깐 가렸다 열리면 깜빡임으로 보인다.
              // 비로그인으로 확정됐을 때만 실적 존을 덮는다.
              locked={loggedIn === false}
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
