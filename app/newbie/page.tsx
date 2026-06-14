import Link from "next/link";

import { Check } from "lucide-react";

import { SignupProgress } from "@/components/auth/signup-progress";
import { H1, H2, Body, Caption } from "@/components/common/typography";
import { InAppBrowserGate } from "@/components/in-app-browser-gate";
import { Button } from "@/components/ui/button";
import { CardItem } from "@/components/ui/card";

/* ─── 토글 섹션 데이터 ─── */

const announcements = {
  title: "신입회원 안내말씀",
  icon: "📋",
  sections: [
    {
      heading: "📅 정기 러닝",
      items: [
        "격주 수요일 저녁 7:30 PM",
        "장소: 양재천·한강·여의도·남산 일대 (사전 공지)",
        "카카오톡에서 공지 확인",
      ],
    },
    {
      heading: "🙏 요청사항",
      items: [
        "카카오톡 오픈채팅 참여 필수",
        "정기 러닝 참석 시 카톡에 미리 표시",
        "모임 후 뒷정리 참여해 주세요.",
      ],
    },
  ],
  footer: "문의: IG @leegun_indie_pnk / 카카오톡 winsu",
};

const rules = [
  { label: "자유 모임 개설", desc: "누구나 자유롭게 모임을 만들 수 있습니다." },
  { label: "나이 제한", desc: "86년생부터 가입 가능" },
  {
    label: "카톡 참석 표시",
    desc: "정기 러닝 참석 시 카카오톡에 미리 표시",
  },
  { label: "Sport Team 활동", desc: "팀 활동에 적극 참여해 주세요." },
  { label: "회비", desc: "월 2,000원" },
  { label: "기타", desc: "지각 시 스쿼트 등 재밌는 벌칙이 있어요 😄" },
];

const safetyRules = [
  { label: "보행자 조심", desc: "좁은 길에서는 한 줄로 달리기" },
  {
    label: "선두 수신호",
    desc: "선두가 방향 전환/정지 신호, 후미가 복명복창",
  },
  { label: "그룹 규모", desc: "최대 6명 그룹으로 나눠 달리기" },
  { label: "초보자 질주 금지", desc: "무리한 페이스는 부상의 원인!" },
];

const grades = [
  { grade: "런린이", criteria: "5km 러닝 불가" },
  { grade: "입문", criteria: "5km 30분 내 러닝 가능" },
  { grade: "초보", criteria: "대회 참여 경험자부터" },
  { grade: "중수", criteria: "꾸준히 대회 참여 & 기록 단축 중" },
  { grade: "고수", criteria: "실력자!" },
  { grade: "최고존엄", criteria: "넘사벽" },
];

const runTypes = [
  { name: "조깅", desc: "대화 가능한 편한 페이스 (회복/워밍업)" },
  {
    name: "LSD (Long Slow Distance)",
    desc: "천천히 오래 달리기 (지구력 향상)",
  },
  { name: "인터벌", desc: "빠르게/천천히 반복 (스피드 향상)" },
  { name: "지속주 (템포런)", desc: "일정 페이스 유지 (젖산역치 향상)" },
];

/** 활동 칩 — 색상 토큰만 사용 */
const activityChips = [
  "🏃 러닝",
  "🚴 자전거",
  "🏊 수영",
  "⛰️ 등산",
  "🏅 대회",
  "🎉 외 활동 다수",
];

/** 가입 3단계 미리보기 */
const signupSteps = [
  { label: "카카오로 로그인", desc: "1초면 끝나요" },
  { label: "연락처 확인", desc: "기존 회원인지 확인해요" },
  { label: "기본 정보 입력", desc: "이름·성별·생일만요" },
];

/* ─── 토글 컴포넌트 ─── */

function Toggle({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <details className="overflow-hidden rounded-xl border-[1.5px] border-border">
      <summary className="flex cursor-pointer items-center justify-between bg-secondary/50 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
        <Body className="font-bold">
          {icon} {title}
        </Body>
        <Caption className="transition-transform [[open]>&]:rotate-180">
          ▼
        </Caption>
      </summary>
      <div className="border-t border-border px-4 py-4">{children}</div>
    </details>
  );
}

/* ─── 페이지 ─── */

export default function NewbiePage() {
  return (
    <InAppBrowserGate>
      <SignupProgress step={1} />
      <div className="mx-auto max-w-md px-6 pb-44 pt-[calc(env(safe-area-inset-top,0px)+5rem)]">
        {/* 1. 히어로 */}
        <section className="text-center">
          <Caption className="tracking-[3px]">WELCOME TO</Caption>
          <H1 className="mt-2 text-[32px]">기강에 잘 오셨어요 👟</H1>
          <Body className="mt-3 block text-muted-foreground">
            3단계, 1분이면 가입이 끝나요.
          </Body>
        </section>

        {/* 2. 가입 3단계 미리보기 */}
        <section className="mt-8 flex flex-col gap-2.5">
          {signupSteps.map((s, i) => (
            <CardItem key={s.label} className="flex items-center gap-3 p-4">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                {i + 1}
              </span>
              <div className="flex flex-col">
                <Body className="font-semibold">{s.label}</Body>
                <Caption>{s.desc}</Caption>
              </div>
            </CardItem>
          ))}
        </section>

        {/* 3. 준비물 */}
        <CardItem className="mt-4 flex items-center gap-3 bg-secondary/40 p-4">
          <Check className="size-5 shrink-0 text-success" />
          <Body className="text-muted-foreground">
            <span className="font-semibold text-foreground">연락처</span>만
            있으면 바로 시작할 수 있어요.
          </Body>
        </CardItem>

        {/* 4. 활동 소개 */}
        <section className="mt-8">
          <H2 className="text-base">✨ 이런 활동을 해요</H2>
          <div className="mt-3 flex flex-wrap gap-2">
            {activityChips.map((c) => (
              <span
                key={c}
                className="rounded-full bg-secondary px-3.5 py-1.5 text-[13px] font-semibold text-secondary-foreground"
              >
                {c}
              </span>
            ))}
          </div>
        </section>

        {/* 5. 더 알아보기 (기존 정보 보존) */}
        <section className="mt-8">
          <Caption className="font-semibold text-foreground">
            ▸ 기강이 더 궁금하다면
          </Caption>
          <div className="mt-3 flex flex-col gap-2">
            <Toggle icon={announcements.icon} title={announcements.title}>
              {announcements.sections.map((s) => (
                <div key={s.heading} className="mb-3 last:mb-0">
                  <Body className="mb-1 block text-[13px] font-bold">
                    {s.heading}
                  </Body>
                  <ul className="list-disc pl-4 text-[13px] text-muted-foreground">
                    {s.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
              <Caption className="mt-2 block">{announcements.footer}</Caption>
            </Toggle>

            <Toggle icon="📜" title="회칙">
              <ul className="space-y-1.5 text-[13px] text-muted-foreground">
                {rules.map((r) => (
                  <li key={r.label}>
                    <span className="font-bold text-foreground">{r.label}</span>{" "}
                    — {r.desc}
                  </li>
                ))}
              </ul>
            </Toggle>

            <Toggle icon="🦺" title="러닝크루 안전수칙">
              <ul className="space-y-1.5 text-[13px] text-muted-foreground">
                {safetyRules.map((r) => (
                  <li key={r.label}>
                    <span className="font-bold text-foreground">{r.label}</span>{" "}
                    — {r.desc}
                  </li>
                ))}
                <li>
                  <span className="font-bold text-foreground">필수 준비물</span>{" "}
                  — 일정에 따라 꼭 챙겨주세요.
                  <br />
                  <span className="ml-3">🚴 자전거 → 헬멧</span>
                  <br />
                  <span className="ml-3">🌙 야간 등산 → 랜턴, 등산화 등</span>
                </li>
              </ul>
            </Toggle>

            <Toggle icon="💡" title="러닝팁 (등급·페이스·러닝화)">
              <Body className="mb-1.5 block text-[13px] font-bold">
                🏅 등급표
              </Body>
              <table className="mb-4 w-full border-collapse text-[11px]">
                <thead>
                  <tr className="bg-secondary/70">
                    <th className="border border-border px-2 py-1.5 text-left font-semibold">
                      등급
                    </th>
                    <th className="border border-border px-2 py-1.5 text-left font-semibold">
                      기준
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {grades.map((g) => (
                    <tr key={g.grade}>
                      <td className="border border-border px-2 py-1.5">
                        {g.grade}
                      </td>
                      <td className="border border-border px-2 py-1.5">
                        {g.criteria}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Body className="mb-1.5 block text-[13px] font-bold">
                🏃 러닝의 종류
              </Body>
              <ul className="list-disc space-y-1 pl-4 text-[13px] text-muted-foreground">
                {runTypes.map((t) => (
                  <li key={t.name}>
                    <span className="font-bold text-foreground">{t.name}</span>{" "}
                    — {t.desc}
                  </li>
                ))}
              </ul>

              <Body className="mb-1.5 mt-4 block text-[13px] font-bold">
                ❤️ 심박수 &amp; 페이스
              </Body>
              <p className="mb-4 text-[13px] leading-relaxed text-muted-foreground">
                심박수는 운동 강도의 지표입니다.
                <br />
                최대 심박수의 60~70% → 유산소 구간
                <br />
                최대 심박수의 80% 이상 → 무산소 구간
                <br />
                <br />
                페이스(min/km)는 1km를 달리는 데 걸리는 시간입니다.
              </p>

              <Body className="mb-1.5 block text-[13px] font-bold">
                🎯 난이도 설정 방법
              </Body>
              <p className="mb-4 text-[13px] leading-relaxed text-muted-foreground">
                대화가 가능하면 →{" "}
                <span className="font-bold text-foreground">Easy</span>
                <br />
                문장이 끊기면 →{" "}
                <span className="font-bold text-foreground">Moderate</span>
                <br />
                단어만 나오면 →{" "}
                <span className="font-bold text-foreground">Hard</span>
                <br />
                <br />
                초보자는 Easy 70% + Moderate 30%로 시작하세요.
              </p>

              <Body className="mb-1.5 block text-[13px] font-bold">
                👟 러닝화
              </Body>
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                입문자에게는 쿠셔닝이 충분한 데일리 러닝화를 추천합니다.
                <br />
                나이키 페가수스, 아식스 노바블라스트, 호카 클리프톤 등이
                대표적이에요.
                <br />
                <br />
                자세한 건 모임에서 알려드릴게요! 👟
              </p>
            </Toggle>
          </div>
        </section>

        {/* 6. 하단 고정 CTA */}
        <div className="fixed inset-x-0 bottom-0 z-50 bg-gradient-to-t from-background via-background/90 to-transparent px-4 pb-4 pt-6">
          <div className="mx-auto max-w-md">
            <div className="grid grid-cols-2 gap-2.5">
              <Button
                asChild
                variant="outline"
                size="lg"
                className="rounded-2xl font-bold"
              >
                <Link href="/">기강 둘러보기</Link>
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
    </InAppBrowserGate>
  );
}
