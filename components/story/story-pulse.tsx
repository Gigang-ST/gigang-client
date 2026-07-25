"use client";

import { dayjs } from "@/lib/dayjs";
import { getTeamPulse } from "@/lib/team-pulse";

import { HelpTip } from "@/components/common/help-tip";
import { HeartRate } from "@/components/story/heart-rate";

import type { TeamOverview } from "@/lib/queries/team-overview";

/**
 * 기강 오버뷰 — 크루 전체 활동 지수를 한 상자에.
 *
 * **먼저 상태를 말하고 근거를 뒤에 붙인다.** 왼쪽에 팀 심박수(심전도 파형 + BPM),
 * 오른쪽에 이번 달 수치. "회원 42명"만 나열하는 통계 블록과 다른 점이다.
 *
 * 단어(기강 그 자체 / 기강 잡아 / 기며든다 / 실종)는 프로필 카드의 개인 컨디션과 같다 —
 * 두 지표가 같은 척도라는 걸 설명 없이 전달하기 위해서.
 *
 * **8주 추세 막대는 걷어냈다.** 막대 높이는 "지난주보다 높다"까지만 말하고 그 이상을
 * 못 했는데, 그걸 읽자고 탭해서 주를 고르는 장치까지 얹혀 있었다. 크루가 실제로 궁금한
 * 건 "이번 달 얼마나 달렸나"라서, 그래프 자리를 큰 수치에 내주고 기간도 달로 옮겼다.
 * 주 단위는 크루가 작을 때 0~1을 오가 상태를 못 담는다(지수 판정만 주 단위로 남는다).
 */
export function StoryPulse({ overview }: { overview: TeamOverview }) {
  // 캐시에 남은 옛 payload에는 months가 아예 없을 수 있다(RPC를 바꿔도 unstable_cache는
  // 최대 1시간 옛 모양을 그대로 준다). 타입상 배열이어도 런타임엔 undefined일 수 있어
  // 여기서 한 번 더 받아낸다 — 지면 한 칸 때문에 /story 전체가 죽으면 안 된다.
  const weeks = overview.weeks ?? [];
  const months = overview.months ?? [];

  // 데이터가 아예 없으면(RPC 미배포·신규 팀) 빈 상자를 그리느니 통째로 접는다.
  if (weeks.length === 0) return null;

  // 지수는 여전히 주 단위 판정(이번 주 vs 직전 4주)이지만, 보여주는 수치는 이번 달 합계다.
  // 주 단위는 크루가 작을 때 0~1을 오가 상태를 못 담는다.
  const pulse = getTeamPulse(weeks);
  const active = months.at(-1);

  // 수치 격자 — 회원은 크루 총량(기간과 무관), 나머지는 이번 달 값.
  // months가 비면(RPC 미배포) 0으로 그린다 — 수치만 비고 심박은 살아 있다.
  const stats = [
    { label: "회원", value: overview.mem_cnt },
    { label: "모임", value: active?.gthr_cnt ?? 0 },
    { label: "참석", value: active?.attd_cnt ?? 0 },
    { label: "기록", value: active?.rec_cnt ?? 0 },
  ];

  return (
    <section className="flex flex-col px-6">
      <div className="rule-section flex items-center justify-between gap-2 pb-2">
        <h2 className="font-numeric text-[11px] font-medium uppercase tracking-[0.2em] text-foreground">
          Team Pulse
        </h2>
        <div className="-my-2">
          <HelpTip title="기강 오버뷰">
            심박수는 이번 주 크루 활동량을 지난 4주 평균과 견줘 나타냅니다. 프로필 카드의
            개인 컨디션과 같은 척도예요. 아래 수치는 이번 달 합계이고, 기록은 대회 기록과
            기록 자랑을 합한 값입니다.
          </HelpTip>
        </div>
      </div>

      {/* 왼쪽 심박수+상태, 오른쪽 이번 달 수치 2x2. 둘을 양끝(justify-between)으로 밀어
          심박수는 왼쪽에, 수치는 우측에 붙는다 — 가운데 여백은 비워 둔다. */}
      <div className="flex items-center justify-between gap-4 pt-4">
        {/* 심전도 파형 + BPM + 한 단어. */}
        <div className="flex shrink-0 flex-col items-center gap-1.5">
          <HeartRate bpm={pulse.bpm} className="h-[43px] w-36 text-pulse-neon" />
          <div className="flex items-baseline gap-1">
            <span className="font-numeric text-[22px] font-medium leading-none text-foreground tabular-nums">
              {pulse.bpm}
            </span>
            <span className="font-numeric text-[10px] uppercase tracking-wide text-muted-foreground">
              bpm
            </span>
          </div>
          <span className="text-center font-serif text-[15px] leading-tight text-foreground">
            {pulse.label}
          </span>
        </div>

        {/* 수치 격자 2x2 — 우측에 붙는다(flex-1 없이). 라벨을 위, 수치를 아래로 */}
        <dl className="grid shrink-0 grid-cols-2 gap-x-8 gap-y-4">
          {stats.map((s) => (
            <div key={s.label} className="flex flex-col gap-0.5">
              <dt className="text-[11px] text-muted-foreground">{s.label}</dt>
              <dd className="font-numeric text-[28px] font-medium leading-none text-foreground tabular-nums">
                {s.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {/* 하단 한 줄 — 왼쪽에 상태 설명, 오른쪽에 "M월 합계". 같은 라인에서 양끝으로 나눈다.
          설명이 길어도 합계를 밀지 않게 설명만 늘어나고 합계는 shrink 안 한다. */}
      <div className="flex items-end justify-between gap-3 pt-3">
        <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-muted-foreground">
          {pulse.message}
        </p>
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {dayjs().format("M월")} 합계
        </span>
      </div>
    </section>
  );
}
