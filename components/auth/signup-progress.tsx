import { cn } from "@/lib/utils";

import { Caption } from "@/components/common/typography";

const TOTAL_STEPS = 3;
const STEP_LABELS = ["시작", "로그인", "정보 입력"] as const;

type SignupProgressProps = {
  /** 현재 단계 (1=시작, 2=로그인, 3=정보 입력) */
  step: 1 | 2 | 3;
  /** 가입 완료 시 모든 칸을 채움 */
  done?: boolean;
};

/**
 * 가입 위저드 3단계 공유 진행바.
 * newbie(1)·login(2)·onboarding(3) 세 페이지가 동일하게 사용한다.
 * 화면 상단에 고정(fixed)되며 내부 콘텐츠는 max-w-md 중앙 정렬.
 */
export function SignupProgress({ step, done = false }: SignupProgressProps) {
  const filled = done ? TOTAL_STEPS : step;
  const currentLabel = done ? "완료" : STEP_LABELS[step - 1];

  return (
    <div className="fixed inset-x-0 top-0 z-40 bg-background/90 backdrop-blur-sm">
      <div className="mx-auto flex max-w-md flex-col gap-2 px-6 pb-3 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)]">
        <div className="flex items-center justify-between">
          <Caption className="font-semibold text-foreground">
            {currentLabel}
          </Caption>
          <Caption>
            {done ? TOTAL_STEPS : step}/{TOTAL_STEPS}
          </Caption>
        </div>
        <div className="flex gap-1.5" aria-hidden>
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <div
              key={i}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors",
                i < filled ? "bg-primary" : "bg-muted",
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
