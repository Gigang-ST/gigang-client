"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Avatar } from "@/components/common/avatar";
import { computeFlick, formatFlyDist } from "@/lib/story-throw";
import { cn } from "@/lib/utils";

import type { PointerEvent as ReactPointerEvent } from "react";
import type { ThrowResult } from "@/lib/story-throw";

/** 착지 후 결과를 보여주는 시간 — 이보다 길면 하늘이 계속 막혀 있어 답답해진다 */
const RESULT_MS = 1100;
/** 속도를 재는 창(ms) — 놓기 직전 이만큼의 움직임만 본다(§handleMove) */
const SAMPLE_MS = 90;

type Phase = "hold" | "fly" | "done";

/**
 * 한마디 던지기 — **하늘 안에서** 손가락으로 끌다 휙 뿌린다.
 *
 * 전체화면 무대와 당김 게이지를 걷어냈다. 한 줄 쓰고 날리는 흐름에 화면 전환이 끼면
 * 그건 놀이가 아니라 절차가 되고, 게이지로 조준하는 건 "던진다"가 아니라 "설정한다"에
 * 가깝다. 지금은 하늘 위에 얼굴이 얹히고, 그걸 손가락으로 끌다 놓으면 **놓는 순간의
 * 속도**가 그대로 힘이 된다(관성 던지기) — 종이비행기를 뿌리는 손짓 그대로다.
 *
 * 하늘은 이 순간에만 세로로 늘어난다(호출부가 `h-44` → `h-64`). 던질 공간이 좁으면
 * 손가락이 벽에 막혀 속도가 안 붙는데, 늘 넓게 두면 평소 지면이 비어 보인다.
 *
 * **이 무대는 저장을 막지 않는다.** 열릴 때 한마디는 이미 하늘에 떠 있고, 거리는
 * `set_message_fly_dist`가 나중에 채운다. 그래서 안 던지고 놔둬도 잃는 게 없다.
 *
 * 접근성: 끌지 않고 **탭만 해도** 기본 세기로 날아간다. `prefers-reduced-motion`이면
 * 비행을 건너뛰고 결과만 보여준다.
 */
export function ThrowStage({
  rider,
  msgTxt,
  onDone,
}: {
  rider: { memId: string; memNm: string; avatarUrl: string | null };
  /** 방금 날린 한마디 — 무엇을 던지는지 보이게 얼굴 옆에 붙인다 */
  msgTxt: string;
  /** 던지기가 끝났다. `dist`가 null이면 기록하지 않는다 */
  onDone: (dist: number | null) => void;
}) {
  const [phase, setPhase] = useState<Phase>("hold");
  /** 끌고 있는 현재 위치(px, 잡은 지점 기준 상대) */
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const [grabbing, setGrabbing] = useState(false);
  const [result, setResult] = useState<ThrowResult | null>(null);

  /** 놓는 순간의 속도를 재기 위한 최근 포인터 표본 */
  const samplesRef = useRef<{ x: number; y: number; t: number }[]>([]);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const doneRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  const finish = useCallback(
    (dist: number | null) => {
      if (doneRef.current) return;
      doneRef.current = true;
      onDone(dist);
    },
    [onDone],
  );

  // 타이머 콜백이 최신 finish를 잡게 하는 ref. launch가 finish를 직접 닫으면
  // onDone이 바뀔 때마다 launch가 새로 만들어져 진행 중인 연출이 끊긴다.
  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  }, [finish]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  /** 던진다 — 비행 연출을 태우고 끝나면 결과를 올린다 */
  const launch = useCallback((r: ThrowResult) => {
    setResult(r);
    setGrabbing(false);

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);

    if (reduced) {
      setPhase("done");
      timerRef.current = window.setTimeout(() => finishRef.current(r.dist), RESULT_MS);
      return;
    }

    setPhase("fly");
    timerRef.current = window.setTimeout(() => {
      setPhase("done");
      timerRef.current = window.setTimeout(() => finishRef.current(r.dist), RESULT_MS);
    }, r.durationMs);
  }, []);

  function handleDown(e: ReactPointerEvent) {
    if (phase !== "hold") return;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    startRef.current = { x: e.clientX, y: e.clientY };
    samplesRef.current = [{ x: e.clientX, y: e.clientY, t: e.timeStamp }];
    setDrag({ x: 0, y: 0 });
    setGrabbing(true);
  }

  function handleMove(e: ReactPointerEvent) {
    const s = startRef.current;
    if (!s || phase !== "hold") return;

    setDrag({ x: e.clientX - s.x, y: e.clientY - s.y });

    // 놓기 직전 구간만 남긴다 — 처음부터 전부 평균 내면 천천히 끌다 마지막에 튕긴
    // 손짓이 "느린 던지기"로 잡힌다. 사람이 느끼는 힘은 마지막 순간의 속도다.
    const arr = samplesRef.current;
    arr.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
    while (arr.length > 2 && e.timeStamp - arr[0].t > SAMPLE_MS) arr.shift();
  }

  function handleUp() {
    if (phase !== "hold") return;
    startRef.current = null;
    setGrabbing(false);

    const arr = samplesRef.current;
    const first = arr[0];
    const last = arr[arr.length - 1];
    samplesRef.current = [];

    // 표본이 하나뿐(=거의 안 움직임)이면 탭이다 — 기본 세기로 날려 준다(접근성).
    if (!first || !last || arr.length < 2) {
      launch(computeFlick(0, 0, 0));
      return;
    }
    launch(computeFlick(last.x - first.x, last.y - first.y, last.t - first.t));
  }

  return (
    <div
      className="absolute inset-0 z-20 touch-none select-none"
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
    >
      {/* 던질 얼굴 — 하늘 왼쪽 아래에서 시작한다. 끄는 동안은 손가락을 그대로 따라가고
          (transform), 놓으면 그 자리에서 속도 방향으로 날아간다. */}
      <div
        className={cn(
          "absolute bottom-5 left-6",
          phase === "fly" && "throw-fly",
          phase === "done" && "opacity-0",
        )}
        style={
          phase === "fly" && result
            ? ({
                "--throw-dur": `${result.durationMs}ms`,
                "--throw-x": `${result.vecX}px`,
                "--throw-y": `${result.vecY}px`,
                "--throw-from-x": `${drag.x}px`,
                "--throw-from-y": `${drag.y}px`,
              } as React.CSSProperties)
            : phase === "hold"
              ? { transform: `translate(${drag.x}px, ${drag.y}px)` }
              : undefined
        }
      >
        <div className="flex items-center gap-2">
          {/* 얼굴만 구르고 배너는 세워 둔다 — 글씨까지 돌면 못 읽는다 */}
          <span className="throw-spin block">
            <Avatar
              src={rider.avatarUrl}
              seed={rider.memId}
              alt={rider.memNm}
              size="md"
              className={cn(
                "ring-2 ring-background transition-transform",
                grabbing && "scale-110",
              )}
            />
          </span>
          <span className="max-w-[8rem] truncate rounded-sm border border-border bg-background/85 px-2 py-1 text-[12px]">
            {msgTxt}
          </span>
        </div>
      </div>

      {/* 결과 — 얼마나 갔나 */}
      {phase === "done" && result && (
        <div className="throw-result pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5">
          <span className="font-numeric text-[34px] font-semibold leading-none tabular-nums">
            {formatFlyDist(result.dist)}
          </span>
          <span className="text-[12px] text-muted-foreground">
            {result.dist >= 7000
              ? "굿 스로우!"
              : result.dist >= 3000
                ? "잘 날아갔어요"
                : "더 세게 휙!"}
          </span>
        </div>
      )}

      {/* 조작 안내 — 뭘 해야 하는지 모르면 놀이가 시작되지 않는다.
          끄는 동안엔 감춘다(손가락이 이미 답을 알고 있고, 글자가 방해가 된다). */}
      {phase === "hold" && !grabbing && (
        <p className="pointer-events-none absolute inset-x-0 top-3 text-center text-[12px] text-muted-foreground">
          손가락으로 끌어서 휙 던져보세요
        </p>
      )}
    </div>
  );
}
