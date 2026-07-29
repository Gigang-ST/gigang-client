"use client";

import { dayjs, nowKST } from "@/lib/dayjs";
import { getTeamPulse } from "@/lib/team-pulse";

import { HelpTip } from "@/components/common/help-tip";
import { HeartRate } from "@/components/story/heart-rate";
import { StoryZoneHeader } from "@/components/story/story-zone-header";

import type { TeamOverview } from "@/lib/queries/team-overview";

/**
 * 기강 오버뷰 — 크루 전체 활동 지수를 한 상자에.
 *
 * **먼저 상태를 말하고 근거를 뒤에 붙인다.** 심전도 밴드가 지금 상태를 말하고, 그 아래
 * 한 줄이 이번 달 근거를 댄다. "회원 42명"만 나열하는 통계 블록과 다른 점이다.
 *
 * 단어(심장 폭발 / 꾸준한 페이스 / 가벼운 조깅 / 완전 휴식)는 러닝 페이스·존 은유다
 * (`lib/team-pulse.ts`의 `TEAM_PULSE_SCALE`) — 프로필 카드의 개인 컨디션 어휘와는 분리돼 있다,
 * 심전도 그래픽·BPM에 맞춘 운동 톤이 목적이라서.
 *
 * **심전도는 전폭 어두운 띠 위에 올린다.** `--pulse-neon`은 board 존과 같은 야간값이라
 * 라이트/다크 공통인데(테마를 안 따른다), 흰 지면 위에 얹으면 glow가 발광이 아니라 뿌옇게
 * 번지기만 한다 — 네온은 어두운 판이 있어야 빛난다. 그래서 이 존은 프로필 카드 스크린 존과
 * 같은 `bg-board`를 깐다(§globals.css의 `--pulse-neon` 주석이 원래 전제한 구조다).
 * 카드로 띄우지 않고 **화면 좌우 끝까지** 붙이는 이유: 흰 지면 중간에 떠 있는 검은 상자는
 * 광고 배너로 읽히지만, 지면을 가로지르는 띠는 끼워 넣은 계기 출력물로 읽힌다.
 * `--board-amber`는 여전히 스크린 존 전용이라 여기서 쓰지 않는다 — 청록 하나만 빌려온다.
 *
 * **수치 격자(2x2, 28px 네 개)는 걷어냈다.** 주인공인 심박(22px 하나)보다 조연이 시각적으로
 * 네 배 무거워 위계가 뒤집혀 있었다. 게다가 `회원`은 크루 총량(기간 무관)이고 나머지는 이번 달
 * 값이라, 똑같이 생긴 칸에 시간 기준이 두 개 섞여 있었다 — 그걸 수습하려고 "M월 합계"라는
 * 각주가 필요했던 것이다. 근거를 이번 달 3개로 좁히고 기간을 줄 맨 앞에 한 번만 쓰니 각주가
 * 저절로 사라졌다.
 *
 * **회원 수는 숫자가 아니라 리드문으로 옮겼다.** "얼마나 뛰었나"가 아니라 "누가 있나"라
 * 성격이 다르고, 거의 변하지 않는다. 큰 숫자로 세우면 심박과 경쟁하지만 리드문 안에서는
 * 심박의 *모집단*을 알려주는 배경이 된다. 존 리드 슬롯이 원래 "안 변하는 설명"을 맡는
 * 자리라는 점도 맞아떨어진다(다른 존: "요즘 안 보이는 얼굴들 — 현상수배 중").
 *
 * **상태 멘트는 리드가 아니라 밴드 캡션이다.** 리드 슬롯은 매주 바뀌는 값이 아니라 고정
 * 설명을 담는 자리라, 멘트를 거기 넣으면 존마다 슬롯 직무가 어긋난다. 대신 밴드 바로 아래
 * **우측정렬**로 건다 — 밴드 우측의 `BPM / 한 단어`와 같은 오른쪽 끝에 맞물려, 그 숫자에 딸린
 * 캡션으로 읽힌다. 왼쪽에 두면 밴드와 무관한 별개 문장처럼 떠 있다.
 */
export function StoryPulse({ overview }: { overview: TeamOverview }) {
  // 캐시에 남은 옛 payload에는 weeks/months 필드 자체가 아예 없을 수 있다(RPC를 바꿔도
  // unstable_cache는 최대 1시간 옛 모양을 그대로 준다). 타입상 배열이어도 런타임엔
  // undefined일 수 있어, 필드가 없는 경우만 지면 한 칸 때문에 /story 전체가 죽지 않게
  // 통째로 접는다. `weeks`가 빈 배열([])인 것과는 다르다 — 빈 배열은 JS에서 truthy라
  // 여기 안 걸리고 아래로 흘러가 `getTeamPulse`가 무데이터 멘트를 보여준다(RPC는 항상
  // 8주치를 채워 주므로 실제로는 거의 없지만, 있다면 접지 않고 보여주는 게 맞는 경우다).
  if (!overview.weeks) return null;

  const weeks = overview.weeks;
  const months = overview.months ?? [];

  // 지수는 여전히 주 단위 판정(이번 주 vs 직전 4주)이지만, 보여주는 수치는 이번 달 합계다.
  // 주 단위는 크루가 작을 때 0~1을 오가 상태를 못 담는다.
  const pulse = getTeamPulse(weeks);
  const active = months.at(-1);

  // 기간은 수치가 실제로 덮는 달에서 뽑는다(오늘이 아니라) — RPC가 준 달과 화면 라벨이
  // 어긋나지 않게. months가 비면(RPC 미배포) 이번 달로 적는다.
  const monthLabel = active
    ? dayjs(active.m_start).format("M월")
    : nowKST().format("M월");

  // 근거 수치 — 전부 이번 달 값으로 통일한다(기간 기준이 하나여야 각주가 필요 없다).
  // months가 비면 0으로 그린다 — 수치만 비고 심박은 살아 있다.
  const stats = [
    { label: "모임", value: active?.gthr_cnt ?? 0 },
    { label: "참석", value: active?.attd_cnt ?? 0 },
    { label: "기록", value: active?.rec_cnt ?? 0 },
  ];

  // mem_cnt가 0이면 조회 실패이거나 아직 아무도 없는 것이다 — "기강인 0명"은 고장으로
  // 읽히므로 숫자 없는 리드로 물러난다.
  const lead =
    overview.mem_cnt > 0
      ? `기강인 ${overview.mem_cnt}명의 이번 주 심박`
      : "이번 주 기강 심박";

  return (
    <section className="flex flex-col">
      {/* 본문(밴드)이 화면 전폭이라 섹션에 px-6이 없다 — 헤더가 스스로 지면 여백을 잡는다 */}
      <StoryZoneHeader
        bleed
        label="Team Pulse"
        lead={lead}
        action={
          <HelpTip title="기강 오버뷰">
            심박수는 이번 주 기강 활동량을 지난 4주 평균과 견줘 나타내요. 아래
            수치는 이번 달 합계이고, 기록은 대회 기록과 운동 기록을 합한 값이에요.
          </HelpTip>
        }
      />

      {/* 계기 출력물 — 왼쪽에 파형, 오른쪽에 판독값. 실제 심전도 모니터의 배치다.
          파형은 남는 폭을 전부 먹고(flex-1 + min-w-0), 판독값은 안 줄어든다.
          beats=2 — 1박자만 그리면 스파이크가 가로로 늘어져 물렁해진다.

          **좌우는 존 괘선과 같은 폭(mx-6)이다.** 화면 끝까지 빼봤더니 이 지면의 24px 여백
          격자를 이 밴드만 깨서, 계기 출력물이 아니라 어긋난 요소로 읽혔다. 헤더 괘선·아래
          수치 줄과 좌우가 맞물려야 "이 존에 속한 판"이 된다.

          테두리는 **다크에서만** 넣는다. board(0.19)와 다크 지면(0.145)이 너무 가까워 판
          경계가 사라지고, 계기 출력물이 아니라 정체불명의 옅은 사각형으로 읽힌다. 라이트에선
          흰 지면과 대비가 커서 선이 필요 없고, 넣으면 오히려 끝이 뭉개져 얼룩처럼 보인다 —
          선이 일을 하는 테마에만 세운다. */}
      <div className="mx-6 mt-4 bg-board px-4 py-3 dark:border dark:border-board-line">
        <div className="flex items-center gap-4">
          <HeartRate
            bpm={pulse.bpm}
            beats={2}
            className="h-11 min-w-0 flex-1 text-pulse-neon"
          />
          <div className="flex shrink-0 flex-col items-end gap-1">
            <div className="flex items-baseline gap-1">
              {/* 숫자도 파형과 같은 네온으로 — 모니터는 판독값을 형광선과 같은 색으로 찍는다 */}
              <span className="font-numeric text-[30px] font-medium leading-none text-pulse-neon tabular-nums">
                {pulse.bpm}
              </span>
              <span className="font-numeric text-[10px] uppercase tracking-wide text-board-muted">
                bpm
              </span>
            </div>
            <span className="text-[13px] leading-none text-board-foreground">
              {pulse.label}
            </span>
          </div>
        </div>
      </div>

      {/* 밴드 캡션 — 우측정렬로 판독값 아래에 맞물린다(§파일 상단 주석) */}
      <p className="px-6 pt-2.5 text-right text-[12px] leading-relaxed text-muted-foreground">
        {pulse.message}
      </p>

      {/* 근거 한 줄 — 기간을 맨 앞에 한 번만 쓰고 이번 달 수치 셋을 오른쪽으로 벌린다 */}
      {/* 기간 라벨은 `dt`/`dd` 쌍이 아니라 목록 전체에 붙는 머리말이라 dl 밖에 둔다 —
          dl의 직접 자식은 dt·dd(또는 이를 감싼 div)만 허용돼, span을 넣으면 보조기술이
          정의 목록 구조를 어긋나게 읽는다. 가로 정렬은 바깥 flex가 맡는다. */}
      <div className="flex items-baseline gap-4 px-6 pt-3">
        <span className="shrink-0 font-numeric text-[11px] tracking-wide text-muted-foreground">
          {monthLabel}
        </span>
        <dl className="flex flex-1 items-baseline justify-between">
          {stats.map((s) => (
            <div key={s.label} className="flex items-baseline gap-1.5">
              <dt className="text-[11px] text-muted-foreground">{s.label}</dt>
              <dd className="font-numeric text-[15px] font-medium text-foreground tabular-nums">
                {s.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
