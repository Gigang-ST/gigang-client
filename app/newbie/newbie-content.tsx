import Link from "next/link";

import {
  CalendarDays,
  ClipboardList,
  Info,
  Lightbulb,
  MapPin,
  ScrollText,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

import { GuideMarkdown } from "@/components/common/guide-markdown";

import { SignupProgress } from "@/components/auth/signup-progress";
import { H1, H2, Body, Caption } from "@/components/common/typography";
import { hasRunningProfileStep, type SignupStepLabel, type TeamSignup } from "@/lib/team-signup";
import { Button } from "@/components/ui/button";
import { CardItem } from "@/components/ui/card";
import { josa } from "@/lib/josa";
import { visibleGuideSections, type GuideIconKey, type GuideSection } from "@/lib/newbie-guide";
import { cn } from "@/lib/utils";

/**
 * 신입 가입 안내(가입 위저드 1단계) 본문. 서버 페이지(`./page.tsx`)가 팀 문구를 읽어 넘긴다 — 이 파일은 요청을 읽지 않아
 * 렌더 테스트가 팀별로 그려 볼 수 있다(`app/newbie/__tests__/newbie-content-render.test.ts`).
 *
 * 가입 단계는 팀 가입 설정(`lib/team-signup.ts`)을 따른다 — 모비는 러닝 프로필 단계가 없다(#748).
 * **「이런 활동을 해요」 칩과 「더 알아보기」 칸은 팀 설정**(`newbie.activities` · `newbie.sections`, §lib/newbie-guide)이다 —
 * 예전엔 기강 운영 안내가 이 파일에 박혀 기강에서만 섰다(#658). 이제 각 팀 운영진이 관리자 「팀 설정」에서 칸을 더하고
 * 마크다운으로 쓴다. 비어 있는 팀(모비 처음)은 두 영역 다 안 그린다.
 */
export type NewbieContentProps = {
  /** 크루 이름(팀 문구) */
  crewName: string;
  /** 팀 가입 설정 — 단계 목록 */
  signup: Pick<TeamSignup, "steps">;
  /** 팀 설정의 신입 안내 — 칩·칸 목록 */
  guide: { activities: readonly string[]; sections: readonly GuideSection[] };
};

/**
 * 가입 흐름 미리보기 — 단계 이름·순서·번호는 상단 진행바와 같은 목록(팀 가입 설정 `steps`)에서 온다.
 * 여기선 설명만 붙인다. Record라서 진행바에 단계가 늘면 설명을 안 채운 채로는 타입 검사가 막는다.
 * ⚠️ `optional`은 실제 폼과 맞춰야 한다 — 가입 목적은 "알게 된 경로"를 안 고르면 못 넘어가는 필수다.
 */
const signupStepGuide: Record<SignupStepLabel, { desc: string; optional?: boolean }> = {
  시작: { desc: "지금 보고 있는 안내예요" },
  로그인: { desc: "카카오·구글 계정으로 1초면 끝나요" },
  "기본 정보": { desc: "연락처·이름·성별·생일이면 돼요" },
  "러닝 프로필": { desc: "가까운 역·거리·페이스 — 건너뛰어도 돼요", optional: true },
  "가입 목적": { desc: "어떻게 알게 됐는지, 왜 왔는지 골라요" },
  "참석 약속": { desc: "첫 참석을 약속해요 — 모임은 나중에 골라도 돼요" },
};


/** 칸 아이콘 키 → 그림(§lib/newbie-guide GUIDE_ICONS) */
const GUIDE_ICON: Record<GuideIconKey, LucideIcon> = {
  notice: ClipboardList,
  rules: ScrollText,
  safety: ShieldCheck,
  tip: Lightbulb,
  place: MapPin,
  schedule: CalendarDays,
  info: Info,
};

/* ─── 토글 컴포넌트 ─── */

function Toggle({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <details className="overflow-hidden rounded-xl border-[1.5px] border-border">
      <summary className="flex cursor-pointer items-center justify-between bg-secondary/50 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          <Icon className="size-4 shrink-0 text-primary" strokeWidth={2} />
          <Body className="font-bold">{title}</Body>
        </span>
        <Caption className="transition-transform [[open]>&]:rotate-180">
          ▼
        </Caption>
      </summary>
      <div className="border-t border-border px-4 py-4">{children}</div>
    </details>
  );
}

export function NewbieContent({ crewName, signup, guide }: NewbieContentProps) {
  const sections = visibleGuideSections(guide.sections);
  const { activities } = guide;
  const signupSteps = signup.steps.map((label) => ({ label, ...signupStepGuide[label] }));
  // 「러닝 프로필은 건너뛰어도 돼요」는 그 단계가 있는 팀에서만 — 없는 팀에 말하면 없는 단계를 안내하게 된다
  const runningProfileNote = hasRunningProfileStep(signup) ? " 러닝 프로필은 건너뛰어도 돼요." : "";
  return (
    <>
      <SignupProgress step="시작" steps={signup.steps} />
      <div className="mx-auto max-w-md px-6 pb-44 pt-[calc(env(safe-area-inset-top,0px)+5rem)]">
        {/* 1. 히어로 */}
        <section className="text-center">
          <Caption className="tracking-[3px]">WELCOME TO</Caption>
          <H1 className="mt-2 text-[32px]">{crewName}에 잘 오셨어요 👟</H1>
          <Body className="mt-3 block text-muted-foreground">
            기본 정보·가입 목적을 답하고 첫 참석을 약속하면 끝.{runningProfileNote}
          </Body>
        </section>

        {/* 2. 가입 단계 미리보기 — 번호가 상단 진행바(1/N)와 같다. 이 페이지가 1번(지금 여기)이다.
            카드 여섯 장을 쌓으면 무거워 한 장 안의 목록으로 묶는다 */}
        <CardItem className="mt-8 flex flex-col p-0">
          {signupSteps.map((s, i) => {
            const current = i === 0;
            return (
              <div
                key={s.label}
                className={cn("flex items-center gap-3 px-4 py-3", i > 0 && "border-t border-border")}
              >
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                    current ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary",
                  )}
                >
                  {i + 1}
                </span>
                <div className="flex flex-col">
                  <Body className="font-semibold">
                    {s.label}
                    {s.optional && <span className="font-normal text-muted-foreground"> (선택)</span>}
                  </Body>
                  <Caption>{s.desc}</Caption>
                </div>
              </div>
            );
          })}
        </CardItem>

        {/* 3. 활동 소개 — 팀 설정 「이런 활동을 해요」(newbie.activities). 비어 있으면 줄째 안 그린다 */}
        {activities.length > 0 && (
          <section className="mt-8">
            <H2 className="text-base">이런 활동을 해요</H2>
            <div className="mt-3 flex flex-wrap gap-2">
              {activities.map((c) => (
                <span
                  key={c}
                  className="rounded-full bg-secondary px-3.5 py-1.5 text-[13px] font-semibold text-secondary-foreground"
                >
                  {c}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* 4. 더 알아보기 — 팀 설정 「더 알아보기」(newbie.sections) 칸 목록. 보이는 칸이 없으면 째로 안 그린다 */}
        {sections.length > 0 && (
          <section className="mt-8">
            <Caption className="font-semibold text-foreground">
              ▸ {josa(crewName, "이/가")} 더 궁금하다면
            </Caption>
            <div className="mt-3 flex flex-col gap-2">
              {sections.map((s, i) => (
                <Toggle key={`${i}-${s.title}`} icon={GUIDE_ICON[s.icon]} title={s.title}>
                  <GuideMarkdown body={s.body} />
                </Toggle>
              ))}
            </div>
          </section>
        )}

        {/* 5. 하단 고정 CTA */}
        <div className="app-fixed fixed inset-x-0 bottom-0 z-50 bg-gradient-to-t from-background via-background/90 to-transparent px-4 pb-4 pt-6">
          <div className="mx-auto max-w-md">
            <div className="grid grid-cols-2 gap-2.5">
              <Button
                asChild
                variant="outline"
                size="lg"
                className="rounded-2xl font-bold"
              >
                <Link href="/">{crewName} 둘러보기</Link>
              </Button>
              <Button asChild size="lg" className="rounded-2xl font-bold">
                <Link href="/auth/login?next=%2Fonboarding">시작하기 →</Link>
              </Button>
            </div>
            <Caption className="mt-2 block text-center leading-relaxed">
              카카오·구글로 간편 가입 · 전달받은 링크를 다시 누르면 가입 화면으로
              돌아와요
            </Caption>
          </div>
        </div>
      </div>
    </>
  );
}
