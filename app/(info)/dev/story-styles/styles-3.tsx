"use client";

import { useState } from "react";

import { Avatar } from "@/components/common/avatar";

import { MOCK_PLEDGES } from "./mock";

import type { CSSProperties } from "react";

/* ══════════════════════════════════════════════════════════════════
   각오 띄우기 — 3안.

   공통 문제: 각오는 "쓰고 끝"이면 아무도 안 쓴다. 남이 보는 게 확실해야,
   그리고 **띄우는 행위 자체가 재밌어야** 쓴다. 그래서 셋 다 "발행하는 순간의 동작"이
   시안의 핵심이고, 목록은 부차적이다.

   재료 선택: 이 지면은 이미 신문(newsprint 텍스처·명조·괘선)이다. J는 그 종이를 그대로
   접어서 쓰고, K는 러너의 세계(코스 팻말)에서, L은 프로필 카드의 전광판 언어에서 가져온다.
   ══════════════════════════════════════════════════════════════════ */

/* ──────────────────────────────────────────────────────────────────
   J. 종이비행기 — 배너 견인
   신문지를 접어 날린 비행기가 각오 배너를 끌고 지면을 가로지른다.
   "날아가는 글씨는 못 읽는다"는 문제를 해변 광고비행기 방식으로 푼다.
   ────────────────────────────────────────────────────────────────── */
export function StylePledgePlane() {
  const [opened, setOpened] = useState<string | null>(null);
  const flying = MOCK_PLEDGES.slice(0, 3);

  return (
    <div className="bg-background pb-8 text-foreground">
      <header className="newsprint relative px-6 pb-3 pt-4">
        <h1 className="text-center font-serif text-[30px] leading-none tracking-[0.02em]">
          기강이야기
        </h1>
        <div className="rule-masthead mt-3" />
      </header>

      <section className="px-6 pt-6">
        <div className="rule-section pb-2">
          <h2 className="font-numeric text-[11px] uppercase tracking-[0.2em]">
            Pledges
          </h2>
        </div>
        <p className="pt-2.5 font-serif text-[15px] text-muted-foreground">
          기강인들이 접어 날린 각오
        </p>
      </section>

      {/* 하늘 — 지면 위 여백을 비행 구역으로 쓴다. 잘라내야 화면 밖에서 들어오는 게 자연스럽다 */}
      <div className="newsprint relative my-4 h-44 overflow-hidden border-y border-border">
        {flying.map((p, i) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setOpened(p.id)}
            aria-label={`${p.mem_nm}의 각오 보기`}
            style={
              {
                top: `${14 + i * 30}%`,
                animationDuration: `${16 + i * 5}s`,
                animationDelay: `${i * -6}s`,
              } as CSSProperties
            }
            className="pledge-fly absolute left-0 flex items-center gap-2 focus-visible:outline-none"
          >
            {/* 종이비행기 — clip-path 다트 실루엣. 이미지 0바이트 */}
            <span
              aria-hidden
              className="size-5 shrink-0 bg-foreground"
              style={{ clipPath: "polygon(0 0, 100% 50%, 0 100%, 26% 50%)" }}
            />
            {/* 견인 배너 — 이게 있어야 날면서도 읽힌다 */}
            <span className="whitespace-nowrap rounded-sm border border-border bg-background/85 px-2 py-1 text-[12px] shadow-sm backdrop-blur-[1px]">
              {p.text}
              <span className="pl-1.5 text-[10px] text-muted-foreground">
                — {p.mem_nm}
              </span>
            </span>
          </button>
        ))}
      </div>

      <div className="px-6">
        {/* 발행 동작 — 누르면 카드가 세 번 접혀 날아간다(시안에서는 정지 상태) */}
        <button
          type="button"
          className="flex w-full items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-border py-3.5 text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-muted/40"
        >
          <span aria-hidden>✈</span> 각오 접어 날리기
        </button>

        {/* 착륙장 — 오래된 각오는 낮게 날다 내려앉아 여기 쌓인다(자연스러운 아카이브) */}
        <div className="rule-section mt-7 pb-2">
          <h3 className="font-numeric text-[11px] uppercase tracking-[0.2em]">
            착륙장
          </h3>
        </div>
        <ul className="flex flex-col pt-1">
          {MOCK_PLEDGES.slice(3).map((p) => (
            <li key={p.id} className="rule-row flex items-center gap-3 py-2.5">
              <Avatar seed={p.mem_id} size="sm" />
              <span className="min-w-0 flex-1 truncate text-[13px]">{p.text}</span>
              <span className="shrink-0 font-numeric text-[10px] text-muted-foreground">
                {p.when}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* 탭하면 접힌 종이가 펼쳐지듯 열린다 */}
      {opened && (
        <div className="px-6 pt-5">
          <div className="pledge-unfold rounded-sm border border-border bg-background p-4 shadow-sm">
            <p className="font-serif text-[17px] leading-relaxed">
              {MOCK_PLEDGES.find((p) => p.id === opened)?.text}
            </p>
            <p className="mt-2 text-[11px] text-muted-foreground">
              — {MOCK_PLEDGES.find((p) => p.id === opened)?.mem_nm} ·{" "}
              {MOCK_PLEDGES.find((p) => p.id === opened)?.when}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
   K. 코스 응원 팻말
   마라톤 코스변 손팻말. 스크롤이 곧 달리는 것이고, 각오가 옆을 스쳐 지나간다.
   러너라면 다 아는 물건이라 설명이 필요 없다.
   ────────────────────────────────────────────────────────────────── */
export function StylePledgeSign() {
  return (
    <div className="bg-background pb-8 text-foreground">
      <header className="newsprint relative px-6 pb-3 pt-4">
        <h1 className="text-center font-serif text-[30px] leading-none tracking-[0.02em]">
          기강이야기
        </h1>
        <div className="rule-masthead mt-3" />
      </header>

      <section className="px-6 pt-6">
        <div className="rule-section pb-2">
          <h2 className="font-numeric text-[11px] uppercase tracking-[0.2em]">
            Course Signs
          </h2>
        </div>
        <p className="pt-2.5 font-serif text-[15px] text-muted-foreground">
          코스에 꽂아둔 각오 — 옆으로 밀어 지나가세요
        </p>
      </section>

      {/* 코스변 — 가로 스크롤. 팻말은 손으로 든 것처럼 조금씩 기울어 있다 */}
      <div className="mt-5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex items-end gap-4 px-6">
          {MOCK_PLEDGES.map((p, i) => (
            <button
              key={p.id}
              type="button"
              style={{ transform: `rotate(${[-3, 2, -1.5, 3, -2][i % 5]}deg)` }}
              className="flex w-[150px] shrink-0 flex-col items-center focus-visible:outline-none"
            >
              {/* 팻말 판 — 손글씨 느낌을 명조로 대신한다(별도 폰트 로드 없이) */}
              <span className="flex min-h-[92px] w-full items-center justify-center rounded-md border-[2.5px] border-foreground bg-background px-3 py-3 text-center font-serif text-[14px] leading-snug shadow-sm">
                {p.text}
              </span>
              {/* 손잡이 막대 */}
              <span aria-hidden className="h-9 w-1.5 bg-foreground/70" />
              <span className="pt-1.5 text-[10px] text-muted-foreground">
                {p.mem_nm}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* 지면(아스팔트) 선 — 팻말이 땅에 꽂혀 있다는 걸 한 선으로 말한다 */}
      <div className="mx-6 -mt-8 border-t-2 border-dashed border-border" />

      <div className="px-6 pt-10">
        <button
          type="button"
          className="flex w-full items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-border py-3.5 text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-muted/40"
        >
          내 팻말 만들어 꽂기
        </button>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
   L. 솔라리 플립보드
   공항 안내판. 프로필 카드의 `--board-*` 앰버 언어를 재사용한다.
   구현 비용이 가장 낮지만, 프로필 카드가 이미 전광판이라 **중복 위험**이 있다.
   ────────────────────────────────────────────────────────────────── */
export function StylePledgeFlip() {
  const current = MOCK_PLEDGES[0];

  return (
    <div className="bg-background pb-8 text-foreground">
      <header className="newsprint relative px-6 pb-3 pt-4">
        <h1 className="text-center font-serif text-[30px] leading-none tracking-[0.02em]">
          기강이야기
        </h1>
        <div className="rule-masthead mt-3" />
      </header>

      <section className="px-6 pt-6">
        <div className="rule-section pb-2">
          <h2 className="font-numeric text-[11px] uppercase tracking-[0.2em]">
            Departures
          </h2>
        </div>
        <p className="pt-2.5 font-serif text-[15px] text-muted-foreground">
          출발 안내판에 걸린 각오
        </p>
      </section>

      {/* 안내판 — 항상 야간(board 토큰). 글자 타일이 하나씩 철컥철컥 넘어간다 */}
      <div className="mx-6 mt-4 rounded-lg bg-board p-4">
        <div className="flex items-center justify-between border-b border-board-line pb-2">
          <span className="font-numeric text-[10px] uppercase tracking-[0.2em] text-board-muted">
            Pledge
          </span>
          <span className="board-blink font-numeric text-[10px] text-board-amber">
            NOW
          </span>
        </div>

        <div className="flex flex-wrap gap-[3px] pt-3">
          {[...current.text].map((ch, i) => (
            <span
              key={`${current.id}-${i}`}
              style={{ animationDelay: `${i * 45}ms` }}
              className="pledge-flip inline-flex h-8 min-w-[22px] items-center justify-center rounded-[2px] bg-black/35 px-[3px] font-numeric text-[16px] text-board-amber"
            >
              {ch === " " ? " " : ch}
            </span>
          ))}
        </div>

        <p className="pt-3 text-right font-numeric text-[11px] text-board-muted">
          — {current.mem_nm}
        </p>
      </div>

      {/* 대기 목록 — 안내판 아래 다음 편들 */}
      <ul className="mt-5 flex flex-col px-6">
        {MOCK_PLEDGES.slice(1).map((p) => (
          <li key={p.id} className="rule-row flex items-center gap-3 py-2.5">
            <span className="w-10 shrink-0 font-numeric text-[11px] text-muted-foreground tabular-nums">
              {p.when}
            </span>
            <span className="min-w-0 flex-1 truncate text-[13px]">{p.text}</span>
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {p.mem_nm}
            </span>
          </li>
        ))}
      </ul>

      <div className="px-6 pt-6">
        <button
          type="button"
          className="flex w-full items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-border py-3.5 text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-muted/40"
        >
          안내판에 각오 올리기
        </button>
      </div>
    </div>
  );
}
