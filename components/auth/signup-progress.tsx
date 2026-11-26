import { cn } from "@/lib/utils";
import { SIGNUP_STEP_LABELS, type SignupStepLabel } from "@/lib/team-signup";

import { Caption } from "@/components/common/typography";

type SignupProgressProps = {
  /** 지금 단계 이름 — 번호가 아니라 이름으로 받는다. 팀마다 단계 수가 달라(#748) 같은 「가입 목적」이 5/6 이기도 4/5 이기도 하다 */
  step: SignupStepLabel;
  /**
   * 이 팀 가입 단계(`getRequestTeamSignup()` 의 `steps` — 팀 설정 `feature.running_profile` 을 따른다). 신입 안내 미리보기와 **같은 목록**을 넘긴다 — 예전엔 두 곳이 각자 들고
   * 있어 진행바는 6단계, 미리보기는 4단계로 갈렸다. 생략하면 전체 6단계(팀을 아직 모르는 로딩 화면 등).
   */
  steps?: readonly SignupStepLabel[];
  /** 가입 완료 시 모든 칸을 채움 */
  done?: boolean;
};

/**
 * 가입 위저드 공유 진행바 — newbie(시작)·login(로그인)·onboarding(기본 정보~참석 약속) 페이지가 같이 쓴다.
 * 화면 상단에 고정(fixed)되며 내부 콘텐츠는 max-w-md 중앙 정렬.
 */
export function SignupProgress({ step, steps = SIGNUP_STEP_LABELS, done = false }: SignupProgressProps) {
  const total = steps.length;
  // 목록에 없는 단계(팀 설정과 화면이 어긋난 경우)는 첫 칸으로 — 진행바가 0/N 이나 음수로 깨지지 않게
  const index = Math.max(0, steps.indexOf(step));
  const filled = done ? total : index + 1;
  const currentLabel = done ? "완료" : steps[index];

  return (
    <div className="app-fixed fixed inset-x-0 top-0 z-40 bg-background/90 backdrop-blur-sm">
      <div className="mx-auto flex max-w-md flex-col gap-2 px-6 pb-3 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)]">
        <div className="flex items-center justify-between">
          <Caption className="font-semibold text-foreground">{currentLabel}</Caption>
          <Caption>
            {filled}/{total}
          </Caption>
        </div>
        <div className="flex gap-1.5" aria-hidden>
          {Array.from({ length: total }, (_, i) => (
            <div
              key={i}
              className={cn("h-1.5 flex-1 rounded-full transition-colors", i < filled ? "bg-primary" : "bg-muted")}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * 팀을 아직 모를 때(신입 안내 로딩) 진행바 자리 — 단계 수를 말하지 않는다. 기본 6단계를 그리면 러닝 프로필이 없는 팀(모비)에서
 * 「1/6」이 잠깐 떴다가 「1/5」로 바뀐다(PR #745 리뷰). 높이·위치는 진짜 진행바와 같아 본문이 튀지 않는다.
 */
export function SignupProgressPending() {
  return (
    <div className="app-fixed fixed inset-x-0 top-0 z-40 bg-background/90 backdrop-blur-sm" aria-hidden>
      <div className="mx-auto flex max-w-md flex-col gap-2 px-6 pb-3 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)]">
        <Caption className="font-semibold text-foreground">시작</Caption>
        <div className="h-1.5 rounded-full bg-muted" />
      </div>
    </div>
  );
}
