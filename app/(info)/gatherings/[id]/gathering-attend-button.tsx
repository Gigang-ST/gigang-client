"use client";

import { useRef, useState, useTransition } from "react";

import { Lock } from "lucide-react";
import { toast } from "sonner";

import { isWaitlistOpenToAll } from "@/lib/gathering/cancel-imminent";
import { cn } from "@/lib/utils";

import { toggleGatheringAttendance } from "@/app/actions/gathering/toggle-attendance";

import { Caption } from "@/components/common/typography";
import { WaitConfirmDialog } from "@/components/schedule/wait-confirm-dialog";
import { Button } from "@/components/ui/button";

import {
  attendButtonLabel,
  attendStateOf,
  waitHintText,
  type AttendState,
} from "@/lib/gathering/waitlist";

import { GatheringCancelDialog } from "./gathering-cancel-dialog";

type Props = {
  gthrId: string;
  initialAttending: boolean;
  maxPrtCnt: number | null;
  currentAttdCount: number;
  /** 모임 시작 시각(UTC ISO) — 취소 사유 필수 여부(시작 5시간 전부터) 판정용 */
  sttAt: string;
  /** 지난 모임(KST) — 참석/해제 잠금 (관리자는 서버 페이지에서 false로 내려옴) */
  pastLocked?: boolean;
  /**
   * 참여조건 충족 여부. 미달이면 **등록·대기 신청만** 막는다 — 이미 참석 중이거나
   * 대기 중인 사람이 빠져나올 길까지 막으면 조건이 나중에 걸린 모임에서 갇힌다.
   * 서버도 등록에만 조건을 건다. 조건이 없는 모임은 true 로 내려온다.
   */
  conditionsOk?: boolean;
  /** 내가 대기 중인가 (서버가 판정해 내려준다) */
  initialWaiting?: boolean;
  /** 내 대기 순번(1-based). 대기 중이 아니면 null */
  initialWaitRank?: number | null;
  /** 이 모임의 총 대기 인원 */
  initialWaitCount?: number;
};

export function GatheringAttendButton({
  gthrId,
  initialAttending,
  maxPrtCnt,
  currentAttdCount,
  sttAt,
  pastLocked,
  conditionsOk = true,
  initialWaiting,
  initialWaitRank,
  initialWaitCount,
}: Props) {
  // 참석·대기·없음 3상태. 대기열이 생기며 boolean 으로는 표현할 수 없게 됐다.
  const [state, setState] = useState<AttendState>(
    attendStateOf({ attending: initialAttending, waiting: !!initialWaiting }),
  );
  const [attdCount, setAttdCount] = useState(currentAttdCount);
  const [waitRank, setWaitRank] = useState<number | null>(initialWaitRank ?? null);
  const [waitCount, setWaitCount] = useState(initialWaitCount ?? 0);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [waitConfirmOpen, setWaitConfirmOpen] = useState(false);
  const [, startTransition] = useTransition();
  // 동기적 재진입 가드 — isPending(리렌더 의존)은 같은 렌더 내 연타를 못 막으므로 ref로 막는다.
  const togglingRef = useRef(false);

  // 실제 정원 판정 — **대기 중인 사람에게도** 필요하다. 예전엔 `state === "none"` 일 때만 true 라
  // 선착순 구간의 대기자는 만석이어도 늘 "참석하기"를 봤다(PR #532 리뷰). 참석 중인 사람은
  // 자기 자리가 있으니 만석 여부가 버튼을 바꾸지 않는다.
  const isFull = state !== "attending" && maxPrtCnt !== null && attdCount >= maxPrtCnt;
  // 조건 잠금은 등록·대기 신청에만 — 이미 참석/대기 중이면 취소는 열어 둔다(위 prop 주석 참고).
  const conditionLocked = state === "none" && !conditionsOk;
  // 시작 2시간 전부터는 대기 순번이 없고 선착순이다 — 버튼·안내·확인 문구가 통째로 갈린다.
  // 렌더마다 다시 계산해 모달이 열려 있는 동안 경계를 넘어도 값이 굳지 않게 한다
  // (GatheringCancelDialog 의 reasonRequired 와 같은 태도).
  const openToAll = isWaitlistOpenToAll(sttAt);

  // 참석 등록(만석이면 대기 신청) — 기존과 동일하게 원탭 즉시 처리(낙관적 업데이트).
  //
  // `fromWait` — 선착순 구간(시작 2시간 전~)에 대기 중이던 사람이 빈 자리로 **직접** 들어오는 경우.
  // 토글만으로는 "대기 취소"와 구분이 안 돼 서버에 의도("join")를 넘긴다(PR #532 리뷰).
  function handleJoin(fromWait = false) {
    togglingRef.current = true;
    const optimistic: AttendState = fromWait || !isFull ? "attending" : "waiting";
    const prevRank = waitRank;
    startTransition(async () => {
      setState(optimistic);
      if (optimistic === "attending") setAttdCount((c) => c + 1);
      // 순번은 서버가 정한다 — 낙관적으로 지어내면 "3번이었는데 5번이 됐다"로 보인다.
      if (optimistic === "waiting") setWaitRank(null);
      try {
        const result = await toggleGatheringAttendance(gthrId, undefined, fromWait ? "join" : undefined);
        setState(result.state);
        setWaitRank(result.waitRank ?? null);
        if (result.waitCount !== undefined) setWaitCount(result.waitCount);
        // 대기에서 참석으로 넘어왔으면 대기 인원도 하나 준다(서버는 참석 결과에 인원을 싣지 않는다).
        if (fromWait && result.state === "attending") setWaitCount((c) => Math.max(0, c - 1));
        // 참석 등록 시에만 담백한 횟수 피드백(취소는 조용히)
        if (result.state === "attending" && result.monthlyAttendCnt) {
          toast.success(`이번 달 ${result.monthlyAttendCnt}회 참여!`);
        }
        if (result.state === "waiting") {
          if (fromWait) {
            // 누르는 사이 다른 사람이 자리를 가져갔다 — 서버가 대기를 순번 그대로 유지했다.
            setAttdCount((c) => c - 1);
            toast.info("그 사이 자리가 찼어요. 알림 요청은 그대로 유지돼요.");
          } else {
            // 대기는 "됐다"는 확인이 특히 중요하다 — 참석과 달리 아무 일도 안 일어난 것처럼 보인다.
            toast.success(
              result.waitRank ? `대기 ${result.waitRank}번으로 등록했어요` : "대기로 등록했어요",
            );
          }
        }
      } catch (e) {
        // 대기에서 들어오다 실패했으면 대기 상태로 되돌린다 — none 으로 두면 대기 행이 남아 있는데
        // 버튼이 "빈 자리 알림 요청"으로 보인다.
        setState(fromWait ? "waiting" : "none");
        if (optimistic === "attending") setAttdCount((c) => c - 1);
        setWaitRank(fromWait ? prevRank : null);
        // 서버 거절 사유(지난 모임·참여조건 등)를 안내 — 무음 롤백이면 버튼 고장으로 오인한다
        toast.error(e instanceof Error ? e.message : "참석 처리에 실패했습니다.");
      } finally {
        togglingRef.current = false;
      }
    });
  }

  // 대기 취소 — 참석 취소와 달리 확인 모달이 없다. 자리를 갖고 있던 게 아니라
  // 남에게 미치는 영향이 없고, 다시 걸면 맨 뒤로 갈 뿐이라 되돌리기도 쉽다.
  function handleWaitCancel() {
    togglingRef.current = true;
    const prevRank = waitRank;
    startTransition(async () => {
      setState("none");
      setWaitRank(null);
      setWaitCount((c) => Math.max(0, c - 1));
      try {
        const result = await toggleGatheringAttendance(gthrId);
        setState(result.state);
      } catch (e) {
        setState("waiting");
        setWaitRank(prevRank);
        setWaitCount((c) => c + 1);
        toast.error(e instanceof Error ? e.message : "대기 취소에 실패했습니다.");
      } finally {
        togglingRef.current = false;
      }
    });
  }

  // 참석 취소 — 확인 모달에서 호출. 실패 시 에러를 다시 던져 모달이 자체 토스트를 띄우고
  // 제출 상태를 풀되(모달은 열린 채) 낙관적 업데이트만 롤백한다.
  async function handleCancelConfirm(reason?: string) {
    togglingRef.current = true;
    const prevAttdCount = attdCount;
    setState("none");
    setAttdCount((c) => c - 1);
    try {
      await toggleGatheringAttendance(gthrId, reason);
      setCancelDialogOpen(false);
    } catch (e) {
      setState("attending");
      setAttdCount(prevAttdCount);
      throw e;
    } finally {
      togglingRef.current = false;
    }
  }

  function handleClick() {
    // isFull 은 더 이상 차단 사유가 아니다 — 만석이면 대기 신청으로 간다.
    if (pastLocked || conditionLocked || togglingRef.current) return; // 처리 중이면 재클릭 무시(중복 방지) — 버튼은 흐려지지 않음
    if (state === "attending") {
      // 참석 취소만 사유 확인 모달을 거친다(등록·대기 경로는 그대로 1탭).
      setCancelDialogOpen(true);
      return;
    }
    if (state === "waiting") {
      // 선착순 구간에 자리가 났으면 버튼이 "참석하기"다 — 누르면 대기 취소가 아니라 **참석**이다.
      // 예전엔 라벨만 "참석하기"로 바뀌고 이 분기가 대기 취소를 불러 대기만 사라졌다(PR #532 리뷰).
      if (openToAll && !isFull) {
        handleJoin(true);
        return;
      }
      handleWaitCancel();
      return;
    }
    // 만석이라 대기(또는 빈 자리 알림 요청)로 들어가는 경우에만 확인을 받는다 —
    // 자리가 나면 **자동으로 참석자가 되는데** 그건 되돌리기 번거로운 일이라
    // 누르기 전에 알려야 한다. 자리가 있어 바로 참석하는 경로는 그대로 1탭이다.
    if (isFull) {
      setWaitConfirmOpen(true);
      return;
    }
    handleJoin();
  }

  const hint = waitHintText(state, waitRank, waitCount, openToAll);

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Button
          onClick={handleClick}
          // 처리 중(isPending)엔 disabled 대신 handleClick 가드로 재클릭만 막아 버튼이 흐려지지 않게 한다.
          // 낙관적 업데이트로 색이 즉시 바뀌므로 사용자는 "바로 눌렸다"고 느낀다.
          disabled={pastLocked || conditionLocked}
          variant={state === "attending" ? "default" : "outline"}
          className={cn(
            "w-full",
            state === "attending" && "bg-success hover:bg-success/90 border-success",
          )}
        >
          {/* 지난 모임: 문구 변경 없이 잠금 아이콘 + disabled 흐림으로만 표시 */}
          {(pastLocked || conditionLocked) && <Lock className="size-3.5" />}
          {attendButtonLabel(state, isFull, openToAll)}
        </Button>

        {hint && <Caption className="text-center">{hint}</Caption>}
      </div>

      <GatheringCancelDialog
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
        sttAt={sttAt}
        onConfirm={handleCancelConfirm}
      />

      <WaitConfirmDialog
        open={waitConfirmOpen}
        onOpenChange={setWaitConfirmOpen}
        openToAll={openToAll}
        onConfirm={handleJoin}
      />
    </>
  );
}
