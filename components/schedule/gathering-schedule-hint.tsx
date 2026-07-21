import { Info, Lightbulb } from "lucide-react";

import { isImminentGathering } from "@/lib/gathering/imminent";

import { Caption } from "@/components/common/typography";

/**
 * 모임 개설 폼의 일정 안내.
 *
 * - 기본(개설 시 항상): 며칠 여유를 두고 열수록 참석률이 높다는 정보성 팁.
 * - 임박(시작 12시간 미만): 당일 오픈 경고를 아래에 추가로 노출.
 *
 * 두 개설 폼(전체 페이지 `gathering-form`, 홈 캘린더 `gathering-form-dialog`)이
 * 이 컴포넌트를 공유해 문구·임박 기준을 한 곳에서 관리한다(한쪽만 바뀌어 어긋나는 것 방지).
 *
 * @param sttAt 시작일시 datetime-local 문자열(오프셋 없는 KST 벽시계). `isImminentGathering`이 해석.
 * @param mode  개설(create)일 때만 기본 팁을 깐다. 수정(edit)에선 임박 경고만.
 */
export function GatheringScheduleHint({
  sttAt,
  mode,
}: {
  sttAt: string | null | undefined;
  mode: "create" | "edit";
}) {
  const imminent = isImminentGathering(sttAt);
  const showBaseTip = mode === "create";

  if (!showBaseTip && !imminent) return null;

  return (
    <div className="flex flex-col gap-2">
      {showBaseTip && (
        <div className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2">
          <Lightbulb className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <Caption>며칠 여유를 두고 열면 참석률이 훨씬 높아요.</Caption>
        </div>
      )}
      {imminent && (
        <div className="flex items-start gap-2 rounded-lg bg-info/10 px-3 py-2">
          <Info className="mt-0.5 size-4 shrink-0 text-info" />
          <Caption className="text-info">
            시작까지 12시간도 안 남았어요. 당일 오픈은 참석자가 없을 수 있어요.
          </Caption>
        </div>
      )}
    </div>
  );
}
