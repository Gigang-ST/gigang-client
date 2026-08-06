"use client";

import { useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import { toast } from "sonner";

import { setWeekStart } from "@/app/actions/set-week-start";
import { WEEK_START_LABEL, WEEK_STARTS, type WeekStart } from "@/lib/week-start";

import { SegmentControl } from "@/components/common/segment-control";

/**
 * 주 시작 요일 선택 — 설정 > DISPLAY.
 *
 * 다크모드처럼 토글 하나로 두지 않고 **두 값을 다 보여주는 세그먼트**로 둔다:
 * 다크/라이트와 달리 일요일·월요일은 서로 "반대"가 아니라 그냥 두 선택지라,
 * 아이콘 토글로는 눌렀을 때 뭐가 되는지 알 수 없다.
 *
 * 현재 값은 **서버가 쿠키에서 읽어 내려준다**(`weekStart` prop). 여기서 직접 읽으면
 * 첫 렌더에 기본값이 켜졌다가 바뀌어, 설정 화면이 실제와 다른 값을 잠깐 보여준다.
 */
export function WeekStartControl({ weekStart }: { weekStart: WeekStart }) {
  // 낙관적 표시 — 서버 왕복을 기다리면 탭이 한 박자 늦게 움직여 "안 눌렸나" 싶다.
  const [value, setValue] = useState<WeekStart>(weekStart);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function change(next: WeekStart) {
    if (next === value || isPending) return;
    const prev = value;
    setValue(next);
    startTransition(async () => {
      const result = await setWeekStart(next);
      if (!result.ok) {
        setValue(prev); // 저장 실패를 성공처럼 보이게 두지 않는다
        toast.error("설정을 저장하지 못했어요. 다시 시도해 주세요.");
        return;
      }
      // 쿠키를 바꿔도 **이미 클라이언트에 들려 있는 일정탭 페이로드**가 남아 있으면 탭을
      // 눌렀을 때 방금 바꾼 게 반영이 안 된 것처럼 보인다. 일정탭은 동적 스트리밍 구간이라
      // 대개는 새 쿠키로 다시 받지만, refresh()로 서버 재요청을 명시해 그 경우를 남기지 않는다
      // (이 한 줄이 없어도 대체로 맞게 동작한다 — 안전장치 쪽이다).
      router.refresh();
    });
  }

  return (
    <SegmentControl
      className="w-[152px] shrink-0"
      segments={WEEK_STARTS.map((ws) => ({ value: String(ws), label: WEEK_START_LABEL[ws] }))}
      value={String(value)}
      onValueChange={(next) => change(Number(next) as WeekStart)}
    />
  );
}
