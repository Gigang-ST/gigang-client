"use client";

import { Avatar } from "@/components/common/avatar";
import { cn } from "@/lib/utils";

import {
  MOCK_ACTV,
  MOCK_LEDE,
  MOCK_NEWBIES,
  MOCK_RACE,
  MOCK_RECORDS,
  MOCK_WEEK,
} from "./mock";

/* ══════════════════════════════════════════════════════════════════
   F. 비즈니스위크 — 극단적 크기 대비, 색 최소, 선과 크기로만 위계
   Bloomberg Businessweek 계열. 에디토리얼 중 가장 실험적.
   ══════════════════════════════════════════════════════════════════ */
export function StyleBusinessweek() {
  return (
    <div className="bg-background pb-10 text-foreground">
      {/* 제호 — 좌측 정렬, 극단적으로 크게, 자간 음수 */}
      <header className="px-5 pb-4 pt-6">
        <h1 className="font-serif text-[52px] leading-[0.85] tracking-[-0.03em]">
          기강
          <br />
          이야기
        </h1>
        <div className="mt-4 flex items-end justify-between border-t-[3px] border-foreground pt-1.5">
          <span className="font-numeric text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            No. 12
          </span>
          <span className="font-numeric text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            26.07.23
          </span>
        </div>
      </header>

      {/* 리드 — 숫자가 헤드라인보다 크다(크기 역전) */}
      <section className="px-5 pt-6">
        <span className="font-numeric text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
          {MOCK_LEDE.kicker}
        </span>
        <div className="mt-2 flex items-start gap-1">
          <span className="font-numeric text-[62px] font-medium leading-[0.82] tracking-[-0.04em] tabular-nums">
            {MOCK_LEDE.figure}
          </span>
        </div>
        <h2 className="mt-4 max-w-[22ch] font-serif text-[19px] leading-[1.3]">
          {MOCK_LEDE.headline}
        </h2>
        <div className="mt-4 flex items-center gap-2.5 border-t border-foreground pt-3">
          <Avatar seed={MOCK_LEDE.person.mem_id} size="sm" />
          <span className="text-[12px] text-muted-foreground">
            {MOCK_LEDE.standfirst}
          </span>
        </div>
      </section>

      {/* 데이터 표 — 선 굵기 3종으로만 구분 */}
      <section className="px-5 pt-9">
        <h3 className="border-b-[3px] border-foreground pb-1 font-numeric text-[10px] uppercase tracking-[0.28em]">
          Activity Index
        </h3>
        <table className="w-full">
          <tbody>
            {MOCK_ACTV.map((a) => (
              <tr key={a.mem_id} className="border-b border-foreground/15">
                <td className="w-7 py-2.5 font-numeric text-[11px] text-muted-foreground tabular-nums">
                  {String(a.rank).padStart(2, "0")}
                </td>
                <td className="py-2.5 text-[13px] font-medium">{a.mem_nm}</td>
                <td className="py-2.5 text-right font-numeric text-[19px] font-medium tabular-nums">
                  {a.score}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* 주간 통계 — 라벨은 극소, 숫자는 극대 */}
      <section className="mt-9 border-y-[3px] border-foreground px-5 py-5">
        <div className="grid grid-cols-3 gap-2">
          {[
            { v: MOCK_WEEK.gthr_cnt, l: "Gatherings" },
            { v: MOCK_WEEK.attd_cnt, l: "Attendance" },
            { v: MOCK_WEEK.rec_cnt, l: "Results" },
          ].map((s) => (
            <div key={s.l}>
              <span className="block font-numeric text-[40px] font-medium leading-none tracking-[-0.03em] tabular-nums">
                {s.v}
              </span>
              <span className="mt-1 block font-numeric text-[8px] uppercase tracking-[0.2em] text-muted-foreground">
                {s.l}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="px-5 pt-8">
        <h3 className="border-b-[3px] border-foreground pb-1 font-numeric text-[10px] uppercase tracking-[0.28em]">
          New Members
        </h3>
        <ul>
          {MOCK_NEWBIES.map((n) => (
            <li
              key={n.mem_id}
              className="flex items-baseline gap-3 border-b border-foreground/15 py-2.5"
            >
              <span className="font-serif text-[17px]">{n.mem_nm}</span>
              <span className="ml-auto font-numeric text-[11px] text-muted-foreground tabular-nums">
                {n.joined}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   G. 러닝 브랜드 — 넓은 여백, 큰 이미지 자리, 절제된 타이포
   Balmoral Running 계열. 프리미엄 스포츠 브랜드 톤.
   ══════════════════════════════════════════════════════════════════ */
export function StyleBrand() {
  return (
    <div className="bg-background pb-12 text-foreground">
      <header className="px-6 pb-10 pt-12 text-center">
        <span className="brand-track font-numeric text-[9px] uppercase text-muted-foreground">
          GIGANG
        </span>
        <h1 className="mt-6 font-serif text-[27px] font-normal leading-[1.35] tracking-[0.01em]">
          이번 주, 우리는
          <br />
          {MOCK_WEEK.attd_cnt}번 함께 달렸다
        </h1>
      </header>

      {/* 히어로 — 사진 자리(브랜드 사이트의 핵심). 지금은 아바타로 대체 */}
      <section className="px-6">
        <div className="relative flex aspect-[4/5] items-center justify-center overflow-hidden bg-muted">
          <Avatar seed={MOCK_LEDE.person.mem_id} size="xl" />
          <span className="absolute bottom-4 left-4 brand-track font-numeric text-[8px] uppercase text-muted-foreground">
            Photo
          </span>
        </div>
        <div className="pt-6">
          <span className="brand-track font-numeric text-[9px] uppercase text-muted-foreground">
            {MOCK_LEDE.kicker}
          </span>
          <h2 className="mt-4 font-serif text-[22px] leading-[1.4]">
            {MOCK_LEDE.headline}
          </h2>
          <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
            {MOCK_LEDE.standfirst}
          </p>
          <span className="mt-6 block font-numeric text-[15px] tracking-[0.1em] tabular-nums">
            {MOCK_LEDE.figure}
          </span>
        </div>
      </section>

      {/* 기록 — 여백을 크게, 선은 아주 얇게 */}
      <section className="px-6 pt-16">
        <span className="brand-track font-numeric text-[9px] uppercase text-muted-foreground">
          Results
        </span>
        <ul className="mt-7 flex flex-col gap-7">
          {MOCK_RECORDS.map((r) => (
            <li key={r.mem_id} className="border-b border-border pb-7 last:border-0">
              <span className="font-serif text-[19px]">{r.mem_nm}</span>
              <div className="mt-2.5 flex items-baseline justify-between">
                <span className="text-[12px] text-muted-foreground">{r.label}</span>
                <span className="font-numeric text-[15px] tracking-[0.08em] tabular-nums">
                  {r.time}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="px-6 pt-14">
        <span className="brand-track font-numeric text-[9px] uppercase text-muted-foreground">
          New Members
        </span>
        <div className="mt-7 flex flex-col gap-5">
          {MOCK_NEWBIES.map((n) => (
            <div key={n.mem_id} className="flex items-center gap-4">
              <Avatar seed={n.mem_id} size="md" />
              <span className="flex-1 font-serif text-[17px]">{n.mem_nm}</span>
              <span className="font-numeric text-[11px] tracking-[0.1em] text-muted-foreground tabular-nums">
                {n.joined}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   H. 인쇄 망점 — halftone 텍스처로 진짜 인쇄물 질감
   신문 사진 제판 + 망점 배경. CSS만으로 구현(이미지 0바이트).
   ══════════════════════════════════════════════════════════════════ */
export function StyleHalftone() {
  return (
    <div className="relative overflow-hidden bg-background pb-10 text-foreground">
      {/* 전면 망점 레이어 — 지면 전체에 인쇄 질감 */}
      <span
        aria-hidden
        className="halftone pointer-events-none absolute inset-0 text-foreground"
      />

      <header className="relative px-5 pb-3 pt-5">
        <div className="border-y-[3px] border-foreground py-2.5">
          <h1 className="text-center font-serif text-[32px] leading-none">
            기강신문
          </h1>
        </div>
        <p className="mt-2 text-center font-numeric text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
          2026.07.23 · 제 12 호 · 서울
        </p>
      </header>

      {/* 사진 자리 — 망점 제판 블록 */}
      <section className="relative px-5 pt-4">
        <div className="relative flex aspect-[3/2] items-center justify-center overflow-hidden border-2 border-foreground">
          <span
            aria-hidden
            className="halftone-plate absolute inset-0 opacity-40"
          />
          <Avatar seed={MOCK_LEDE.person.mem_id} size="xl" />
        </div>
        <p className="mt-1.5 border-b border-foreground/30 pb-1.5 text-[10px] text-muted-foreground">
          ▲ {MOCK_LEDE.person.mem_nm} 선수가 결승선을 통과하고 있다.
        </p>

        <span className="mt-4 inline-block border-2 border-foreground px-2 py-0.5 font-numeric text-[10px] font-bold uppercase tracking-[0.18em]">
          {MOCK_LEDE.kicker}
        </span>
        <h2 className="mt-2.5 text-balance font-serif text-[27px] font-bold leading-[1.18]">
          {MOCK_LEDE.headline}
        </h2>
        {/* 2단 조판 — 신문 컬럼 */}
        <p className="mt-3 columns-2 gap-4 text-[12px] leading-[1.7] text-muted-foreground">
          {MOCK_LEDE.standfirst}. 이날 기록은 {MOCK_LEDE.figure}로, 개인 최고
          기록을 경신했다. 크루원 {MOCK_WEEK.attd_cnt}명이 코스 곳곳에서 응원에
          나섰다.
        </p>
        <div className="mt-3 flex items-baseline gap-2 border-t-2 border-foreground pt-2">
          <span className="font-numeric text-[30px] font-bold leading-none tabular-nums">
            {MOCK_LEDE.figure}
          </span>
          <span className="font-numeric text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            {MOCK_LEDE.figureLabel}
          </span>
        </div>
      </section>

      <section className="relative px-5 pt-7">
        <h3 className="border-b-2 border-foreground pb-1 font-serif text-[18px] font-bold">
          새 얼굴
        </h3>
        <ul>
          {MOCK_NEWBIES.map((n) => (
            <li
              key={n.mem_id}
              className="flex items-center gap-2.5 border-b border-dotted border-foreground/40 py-2"
            >
              <span className="size-1 rounded-full bg-foreground" />
              <span className="flex-1 font-serif text-[15px]">{n.mem_nm}</span>
              <span className="font-numeric text-[11px] tabular-nums text-muted-foreground">
                {n.joined}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="relative px-5 pt-7">
        <h3 className="border-b-2 border-foreground pb-1 font-serif text-[18px] font-bold">
          활동지수
        </h3>
        <ul>
          {MOCK_ACTV.map((a) => (
            <li
              key={a.mem_id}
              className="flex items-center gap-2.5 border-b border-dotted border-foreground/40 py-2"
            >
              <span className="w-5 font-numeric text-[13px] font-bold tabular-nums">
                {a.rank}
              </span>
              <span className="flex-1 font-serif text-[15px]">{a.mem_nm}</span>
              <span className="font-numeric text-[15px] font-bold tabular-nums">
                {a.score}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   I. 스피드 — 이탤릭·기울기로 속도감. 스포츠 타이포 문법
   기록·순위 숫자에 skew. 다크 기준으로 설계.
   ══════════════════════════════════════════════════════════════════ */
export function StyleSpeed() {
  return (
    <div className="bg-board pb-10 text-board-foreground">
      <header className="px-5 pb-4 pt-6">
        <h1 className="speed-skew font-numeric text-[38px] font-bold uppercase leading-none tracking-[-0.02em]">
          Gigang
        </h1>
        <div className="mt-2 flex items-center gap-2">
          <span className="h-[3px] flex-1 bg-board-amber" />
          <span className="font-numeric text-[9px] uppercase tracking-[0.25em] text-board-muted">
            Week 30
          </span>
        </div>
      </header>

      {/* 리드 — 기울어진 거대 기록 */}
      <section className="px-5 pt-3">
        <span className="font-numeric text-[10px] font-bold uppercase tracking-[0.22em] text-board-amber">
          {MOCK_LEDE.kicker}
        </span>
        <div className="mt-3 overflow-hidden">
          <span className="speed-skew block origin-left font-numeric text-[54px] font-bold leading-[0.9] tracking-[-0.03em] text-board-amber tabular-nums">
            {MOCK_LEDE.figure}
          </span>
        </div>
        <h2 className="mt-4 text-[18px] font-bold leading-snug">
          {MOCK_LEDE.headline}
        </h2>
        <div className="mt-3 flex items-center gap-2.5">
          <Avatar seed={MOCK_LEDE.person.mem_id} size="md" />
          <span className="text-[12px] text-board-muted">
            {MOCK_LEDE.standfirst}
          </span>
        </div>
      </section>

      {/* 기록 — 사선 구분, 숫자 기울임 */}
      <section className="px-5 pt-9">
        <h3 className="font-numeric text-[10px] font-bold uppercase tracking-[0.22em] text-board-muted">
          Results
        </h3>
        <ul className="mt-3 flex flex-col">
          {MOCK_RECORDS.map((r) => (
            <li
              key={r.mem_id}
              className="flex items-center gap-3 border-b border-board-line py-3"
            >
              <span className="flex-1 text-[14px] font-bold">{r.mem_nm}</span>
              <span className="font-numeric text-[10px] uppercase tracking-[0.15em] text-board-muted">
                {r.label}
              </span>
              <span className="speed-skew font-numeric text-[19px] font-bold tabular-nums">
                {r.time}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* 랭킹 — 순위 숫자를 기울여 트랙 느낌 */}
      <section className="px-5 pt-9">
        <h3 className="font-numeric text-[10px] font-bold uppercase tracking-[0.22em] text-board-muted">
          Activity Index
        </h3>
        <ul className="mt-3 flex flex-col gap-2">
          {MOCK_ACTV.map((a) => {
            const pct = (a.score / MOCK_ACTV[0].score) * 100;
            return (
              <li key={a.mem_id} className="flex items-center gap-3">
                <span
                  className={cn(
                    "speed-skew w-8 font-numeric text-[24px] font-bold leading-none tabular-nums",
                    a.rank === 1 ? "text-board-amber" : "text-board-muted",
                  )}
                >
                  {a.rank}
                </span>
                <div className="flex-1">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[13px] font-bold">{a.mem_nm}</span>
                    <span className="font-numeric text-[13px] tabular-nums">
                      {a.score}
                    </span>
                  </div>
                  <span className="mt-1 block h-[3px] w-full bg-board-line">
                    <span
                      className={cn(
                        "block h-full",
                        a.rank === 1 ? "bg-board-amber" : "bg-board-muted",
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="px-5 pt-9">
        <h3 className="font-numeric text-[10px] font-bold uppercase tracking-[0.22em] text-board-muted">
          Next Race
        </h3>
        <div className="mt-3 flex items-center gap-3 border border-board-line p-3.5">
          <div className="flex-1">
            <span className="text-[15px] font-bold">{MOCK_RACE.comp_nm}</span>
            <p className="mt-0.5 text-[11px] text-board-muted">
              {MOCK_RACE.date} · {MOCK_RACE.reg_cnt}명 출전
            </p>
          </div>
          <span className="speed-skew font-numeric text-[26px] font-bold text-board-amber tabular-nums">
            {MOCK_RACE.dday}
          </span>
        </div>
      </section>
    </div>
  );
}
