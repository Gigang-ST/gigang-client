"use client";

import { Avatar } from "@/components/common/avatar";
import { cn } from "@/lib/utils";

import {
  MOCK_ACTV,
  MOCK_KING,
  MOCK_LEDE,
  MOCK_NEWBIES,
  MOCK_RACE,
  MOCK_RECORDS,
  MOCK_WEEK,
} from "./mock";

/* ══════════════════════════════════════════════════════════════════
   A. 절제된 에디토리얼 — 현재 적용된 스타일
   명조 헤드라인 + 괘선 위계. The Athletic 계열.
   ══════════════════════════════════════════════════════════════════ */
export function StyleEditorial() {
  return (
    <div className="bg-background pb-8 text-foreground">
      <header className="newsprint relative px-6 pb-3 pt-4">
        <h1 className="text-center font-serif text-[30px] leading-none tracking-[0.02em]">
          기강이야기
        </h1>
        <p className="mt-2.5 text-center font-numeric text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          2026년 7월 23일 목요일 · 이번 주 모임 {MOCK_WEEK.gthr_cnt}회
        </p>
        <div className="rule-masthead mt-3" />
      </header>

      <section className="px-6 pt-4">
        <span className="font-numeric text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {MOCK_LEDE.kicker}
        </span>
        <h2 className="mt-3 text-balance font-serif text-[26px] leading-[1.28]">
          {MOCK_LEDE.headline}
        </h2>
        <p className="mt-3 text-[13px] text-muted-foreground">
          {MOCK_LEDE.standfirst}
        </p>
        <div className="mt-3 flex items-center gap-3">
          <Avatar seed={MOCK_LEDE.person.mem_id} size="lg" />
          <div className="ml-auto flex flex-col items-end">
            <span className="font-numeric text-[27px] font-medium leading-none tabular-nums">
              {MOCK_LEDE.figure}
            </span>
            <span className="mt-1 text-[11px] text-muted-foreground">
              {MOCK_LEDE.figureLabel}
            </span>
          </div>
        </div>
        <div className="flex gap-2 pt-5">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={cn("h-0.5 flex-1", i === 0 ? "bg-foreground" : "bg-border")}
            />
          ))}
        </div>
      </section>

      <section className="px-6 pt-8">
        <div className="rule-section pb-2">
          <h3 className="font-numeric text-[11px] uppercase tracking-[0.2em]">
            New Members
          </h3>
        </div>
        <p className="pt-2.5 font-serif text-[15px] text-muted-foreground">
          최근 30일, 3명이 기강에 합류했다.
        </p>
        <ul className="pt-1">
          {MOCK_NEWBIES.map((n) => (
            <li key={n.mem_id} className="rule-row flex items-center gap-3 py-2.5">
              <Avatar seed={n.mem_id} size="sm" />
              <span className="flex-1 text-[14px] font-semibold">{n.mem_nm}</span>
              <span className="font-numeric text-[11px] text-muted-foreground tabular-nums">
                {n.joined}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="px-6 pt-8">
        <div className="rule-section pb-2">
          <h3 className="font-numeric text-[11px] uppercase tracking-[0.2em]">
            Activity Index
          </h3>
        </div>
        <ul className="pt-1">
          {MOCK_ACTV.map((a) => (
            <li key={a.mem_id} className="rule-row flex items-center gap-3 py-2.5">
              <span className="w-4 font-numeric text-[13px] text-muted-foreground tabular-nums">
                {a.rank}
              </span>
              <Avatar seed={a.mem_id} size="sm" />
              <span className="flex-1 text-[14px] font-semibold">{a.mem_nm}</span>
              <span className="font-numeric text-[15px] font-medium tabular-nums">
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
   B. 타블로이드 — 굵은 제호, 반전 블록, 큰 숫자
   스포츠 신문 1면. 임팩트 최대.
   ══════════════════════════════════════════════════════════════════ */
export function StyleTabloid() {
  return (
    <div className="bg-background pb-8 text-foreground">
      <header className="bg-foreground px-6 py-4 text-background">
        <h1 className="text-center font-serif text-[34px] font-bold leading-none tracking-tight">
          기강일보
        </h1>
        <p className="mt-2 text-center font-numeric text-[10px] uppercase tracking-[0.3em] opacity-70">
          2026.07.23 · 제 12 호
        </p>
      </header>

      <section className="border-b-4 border-foreground px-6 py-5">
        <span className="inline-block bg-destructive px-2 py-0.5 font-numeric text-[11px] font-bold uppercase tracking-[0.15em] text-white">
          속보
        </span>
        <h2 className="mt-3 text-balance font-serif text-[32px] font-bold leading-[1.15]">
          {MOCK_LEDE.headline}
        </h2>
        <p className="mt-2 text-[13px] font-medium text-muted-foreground">
          {MOCK_LEDE.standfirst}
        </p>
        <div className="mt-4 flex items-end gap-4">
          <Avatar seed={MOCK_LEDE.person.mem_id} size="xl" />
          <div className="flex-1">
            <span className="block font-numeric text-[44px] font-bold leading-none tabular-nums">
              {MOCK_LEDE.figure}
            </span>
            <span className="font-numeric text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              {MOCK_LEDE.figureLabel}
            </span>
          </div>
        </div>
      </section>

      <section className="px-6 pt-6">
        <h3 className="border-b-[3px] border-foreground pb-1.5 font-serif text-[20px] font-bold">
          새 얼굴
        </h3>
        <ul>
          {MOCK_NEWBIES.map((n) => (
            <li
              key={n.mem_id}
              className="flex items-center gap-3 border-b border-foreground/20 py-3"
            >
              <Avatar seed={n.mem_id} size="sm" />
              <span className="flex-1 font-serif text-[17px] font-bold">
                {n.mem_nm}
              </span>
              <span className="font-numeric text-[12px] tabular-nums text-muted-foreground">
                {n.joined}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6 bg-foreground px-6 py-5 text-background">
        <h3 className="font-numeric text-[11px] uppercase tracking-[0.25em] opacity-70">
          이달의 참가왕
        </h3>
        <div className="mt-3 flex items-center gap-4">
          <Avatar seed={MOCK_KING.mem_id} size="lg" />
          <span className="flex-1 font-serif text-[26px] font-bold">
            {MOCK_KING.mem_nm}
          </span>
          <div className="flex items-baseline gap-1">
            <span className="font-numeric text-[52px] font-bold leading-none tabular-nums">
              {MOCK_KING.attd_cnt}
            </span>
            <span className="text-[13px] opacity-70">회</span>
          </div>
        </div>
      </section>

      <section className="px-6 pt-6">
        <h3 className="border-b-[3px] border-foreground pb-1.5 font-serif text-[20px] font-bold">
          활동지수
        </h3>
        <ul>
          {MOCK_ACTV.map((a) => (
            <li
              key={a.mem_id}
              className="flex items-center gap-3 border-b border-foreground/20 py-2.5"
            >
              <span className="w-7 font-numeric text-[20px] font-bold tabular-nums">
                {a.rank}
              </span>
              <Avatar seed={a.mem_id} size="sm" />
              <span className="flex-1 font-serif text-[17px] font-bold">
                {a.mem_nm}
              </span>
              <span className="font-numeric text-[19px] font-bold tabular-nums">
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
   C. 스포츠 매거진 — 거대 숫자 주도, 여백 대담, 색 블록
   Strava 연말결산 계열. 기록·수치가 주인공.
   ══════════════════════════════════════════════════════════════════ */
export function StyleMagazine() {
  return (
    <div className="bg-background pb-8 text-foreground">
      <header className="px-6 pb-6 pt-8">
        <p className="font-numeric text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
          Gigang Weekly
        </p>
        <h1 className="mt-2 font-serif text-[40px] leading-[0.95] tracking-tight">
          이번 주
          <br />
          기강
        </h1>
      </header>

      {/* 주간 통계 — 거대 숫자 3개 */}
      <section className="grid grid-cols-3 gap-px bg-border">
        {[
          { v: MOCK_WEEK.gthr_cnt, l: "모임" },
          { v: MOCK_WEEK.attd_cnt, l: "참석" },
          { v: MOCK_WEEK.rec_cnt, l: "기록" },
        ].map((s) => (
          <div key={s.l} className="bg-background px-3 py-5 text-center">
            <span className="block font-numeric text-[36px] font-medium leading-none tabular-nums">
              {s.v}
            </span>
            <span className="mt-1.5 block font-numeric text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {s.l}
            </span>
          </div>
        ))}
      </section>

      {/* 리드 — 색 블록 위 큰 기록 */}
      <section className="mt-8 bg-primary px-6 py-7 text-primary-foreground">
        <span className="font-numeric text-[11px] uppercase tracking-[0.25em] opacity-80">
          {MOCK_LEDE.kicker}
        </span>
        <span className="mt-4 block font-numeric text-[54px] font-medium leading-none tabular-nums">
          {MOCK_LEDE.figure}
        </span>
        <h2 className="mt-4 font-serif text-[22px] leading-snug">
          {MOCK_LEDE.headline}
        </h2>
        <div className="mt-5 flex items-center gap-3">
          <Avatar seed={MOCK_LEDE.person.mem_id} size="md" />
          <span className="text-[13px] opacity-80">{MOCK_LEDE.standfirst}</span>
        </div>
      </section>

      <section className="px-6 pt-8">
        <h3 className="font-numeric text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
          Results
        </h3>
        <ul className="mt-4 flex flex-col gap-5">
          {MOCK_RECORDS.map((r) => (
            <li key={r.mem_id} className="flex items-baseline gap-3">
              <span className="font-numeric text-[28px] font-medium leading-none tabular-nums">
                {r.time}
              </span>
              <div className="flex flex-1 flex-col">
                <span className="text-[14px] font-semibold">{r.mem_nm}</span>
                <span className="text-[11px] text-muted-foreground">{r.label}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="px-6 pt-9">
        <h3 className="font-numeric text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
          Activity Index
        </h3>
        <ul className="mt-4 flex flex-col gap-3">
          {MOCK_ACTV.map((a) => {
            const pct = (a.score / MOCK_ACTV[0].score) * 100;
            return (
              <li key={a.mem_id} className="flex flex-col gap-1.5">
                <div className="flex items-baseline gap-2">
                  <span className="text-[14px] font-semibold">{a.mem_nm}</span>
                  <span className="ml-auto font-numeric text-[15px] font-medium tabular-nums">
                    {a.score}
                  </span>
                </div>
                {/* 막대 — 순위를 눈으로 비교 */}
                <span className="block h-1 w-full bg-muted">
                  <span
                    className="block h-full bg-foreground"
                    style={{ width: `${pct}%` }}
                  />
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   D. 야간 전광판 — 경기장 LED 보드 (이전 시안)
   항상 야간. 앰버 LED 수치.
   ══════════════════════════════════════════════════════════════════ */
export function StyleBoard() {
  return (
    <div className="bg-background pb-8">
      <section className="bg-board text-board-foreground">
        <div className="flex items-center gap-2 border-b border-board-line px-5 py-2">
          <span className="size-1.5 rounded-full bg-board-amber" />
          <span className="font-numeric text-[10px] font-bold uppercase tracking-[0.28em] text-board-amber">
            Live
          </span>
          <span className="ml-1 truncate font-numeric text-[10px] uppercase tracking-[0.18em] text-board-muted">
            이번 주 모임 {MOCK_WEEK.gthr_cnt}회 · 참석 {MOCK_WEEK.attd_cnt}명
          </span>
        </div>

        <div className="flex flex-col items-center gap-3 px-6 py-6">
          <span className="font-numeric text-[10px] font-bold uppercase tracking-[0.3em] text-board-amber">
            {MOCK_LEDE.kicker}
          </span>
          <Avatar seed={MOCK_LEDE.person.mem_id} size="xl" />
          <p className="text-center text-[17px] font-bold leading-snug">
            {MOCK_LEDE.headline}
          </p>
          <span className="font-numeric text-[30px] font-bold leading-none tabular-nums text-board-amber">
            {MOCK_LEDE.figure}
          </span>
          <span className="font-numeric text-[10px] uppercase tracking-[0.22em] text-board-muted">
            {MOCK_LEDE.figureLabel}
          </span>
        </div>

        <div className="flex justify-center gap-1.5 pb-4">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={cn(
                "size-1.5 rounded-full",
                i === 0 ? "bg-board-amber" : "bg-board-line",
              )}
            />
          ))}
        </div>
      </section>

      <section className="px-6 pt-6 text-foreground">
        <h3 className="text-[13px] font-bold">새 얼굴</h3>
        <ul className="mt-3 flex flex-col gap-2">
          {MOCK_NEWBIES.map((n) => (
            <li
              key={n.mem_id}
              className="flex items-center gap-3 rounded-2xl border-[1.5px] border-border p-3"
            >
              <Avatar seed={n.mem_id} size="md" />
              <span className="flex-1 text-[14px] font-semibold">{n.mem_nm}</span>
              <span className="font-numeric text-[11px] text-muted-foreground tabular-nums">
                {n.joined}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="px-6 pt-7 text-foreground">
        <h3 className="text-[13px] font-bold">기강 활동지수</h3>
        <ul className="mt-3 flex flex-col gap-1">
          {MOCK_ACTV.map((a) => (
            <li key={a.mem_id} className="flex items-center gap-2.5 py-1.5">
              <span className="w-5 text-center text-[13px]">
                {a.rank <= 3 ? ["🥇", "🥈", "🥉"][a.rank - 1] : (
                  <span className="font-numeric text-xs text-muted-foreground tabular-nums">
                    {a.rank}
                  </span>
                )}
              </span>
              <Avatar seed={a.mem_id} size="sm" />
              <span className="flex-1 text-[13px] font-semibold">{a.mem_nm}</span>
              <span className="font-numeric text-[13px] font-bold tabular-nums">
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
   E. 미니멀 카드 — 현재 앱 톤 유지 (비교 기준선)
   라운드 카드 + 산세리프. 기존 다른 페이지와 가장 잘 붙는다.
   ══════════════════════════════════════════════════════════════════ */
export function StyleMinimal() {
  return (
    <div className="bg-background pb-8 text-foreground">
      <div className="flex h-14 items-center px-6">
        <h1 className="text-[22px] font-bold">기강이야기</h1>
      </div>

      <section className="px-6">
        <div className="rounded-2xl border-[1.5px] border-border p-5">
          <span className="text-[11px] font-semibold text-primary">
            {MOCK_LEDE.kicker}
          </span>
          <h2 className="mt-2 text-[17px] font-bold leading-snug">
            {MOCK_LEDE.headline}
          </h2>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {MOCK_LEDE.standfirst}
          </p>
          <div className="mt-4 flex items-center gap-3">
            <Avatar seed={MOCK_LEDE.person.mem_id} size="md" />
            <span className="ml-auto font-numeric text-[24px] font-bold tabular-nums">
              {MOCK_LEDE.figure}
            </span>
          </div>
        </div>
      </section>

      <section className="px-6 pt-7">
        <h3 className="text-[13px] font-bold">새 얼굴</h3>
        <div className="mt-3 flex gap-3">
          {MOCK_NEWBIES.map((n) => (
            <div key={n.mem_id} className="flex flex-col items-center gap-1">
              <Avatar seed={n.mem_id} size="md" />
              <span className="text-[11px] text-muted-foreground">{n.mem_nm}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="px-6 pt-7">
        <h3 className="text-[13px] font-bold">다가오는 대회</h3>
        <div className="mt-3 flex items-center gap-3 rounded-2xl border-[1.5px] border-border p-3">
          <div className="flex-1">
            <span className="text-[14px] font-semibold">{MOCK_RACE.comp_nm}</span>
            <p className="text-[11px] text-muted-foreground">
              {MOCK_RACE.date} · {MOCK_RACE.reg_cnt}명 출전
            </p>
          </div>
          <span className="font-numeric text-[13px] font-bold text-info tabular-nums">
            {MOCK_RACE.dday}
          </span>
        </div>
      </section>

      <section className="px-6 pt-7">
        <h3 className="text-[13px] font-bold">기강 활동지수</h3>
        <ul className="mt-3 flex flex-col gap-1">
          {MOCK_ACTV.map((a) => (
            <li key={a.mem_id} className="flex items-center gap-2.5 py-1.5">
              <span className="w-5 text-center font-numeric text-xs text-muted-foreground tabular-nums">
                {a.rank}
              </span>
              <Avatar seed={a.mem_id} size="sm" />
              <span className="flex-1 text-[13px] font-semibold">{a.mem_nm}</span>
              <span className="font-numeric text-[13px] font-bold tabular-nums">
                {a.score}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
