import { cn } from "@/lib/utils";

/**
 * 비활성·탈퇴 사유 한 칸 — "왜 막혔는지"를 말하는 공통 조각.
 *
 * 쓰는 곳이 둘이다: 참여 게이트 다이얼로그(`InactiveGateDialog`)와 프로필탭 전면 차단 화면.
 * 두 자리가 각자 그리면 라벨·서체·줄바꿈 처리가 한쪽만 고쳐져 반드시 어긋나므로 하나로 묶는다.
 *
 * 사유가 없으면(활성·공백) **아무것도 그리지 않는다** — 판정은 넘기는 쪽이
 * `getVisibleInactiveReason`(`lib/inactive-notice`)으로 이미 마쳤고, 여기선 빈 상자만 막는다.
 *
 * `label` 은 `statusReasonLabel(status)` 이 정한다 — 탈퇴 화면에 "비활성 사유"라고 적혀
 * 있으면 자기 얘기가 아닌 줄 안다. 기본값을 "비활성 사유"로 둬서, 라벨을 안 넘기는
 * 호출부가 생겨도 옛 동작 그대로 선다.
 *
 * 서버 컴포넌트다 — 프로필탭이 서버에서 그대로 세울 수 있어야 한다("use client" 금지).
 */
export function InactiveReasonNote({
  reason,
  label = "비활성 사유",
  className,
}: {
  reason: string | null;
  label?: string;
  className?: string;
}) {
  if (!reason) return null;

  return (
    <div className={cn("w-full rounded-lg bg-muted px-3 py-2 text-left", className)}>
      <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
      {/* 관리자가 자유 입력한 문장이라 길이·줄바꿈을 예상할 수 없다 — 줄바꿈은 살리고 긴 낱말은 꺾는다 */}
      <p className="mt-0.5 text-[13px] leading-relaxed whitespace-pre-wrap break-words text-foreground">
        {reason}
      </p>
    </div>
  );
}
