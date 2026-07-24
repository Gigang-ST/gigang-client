"use client";

import { cn } from "@/lib/utils";

import { Avatar } from "@/components/common/avatar";

import { MOCK_READERS } from "./mock";

/* ══════════════════════════════════════════════════════════════════
   접속자 표시 — 4안.

   구글 시트는 커서로 서로를 안다. 모바일에는 커서가 없다. 그래서 "어디를 보고 있나"를
   커서 말고 **스크롤 위치**로 옮기는 게 이 문제의 핵심이다.

   네 시안은 강도 순: A(가장 은은) → D(가장 노골적).
   판단 기준은 "혼자 볼 때 거슬리는가" — 접속자가 0명일 때 화면이 조용해야 한다.
   ══════════════════════════════════════════════════════════════════ */

/** 지면 더미 — 시안마다 같은 본문을 깔아야 표시 방식 차이만 보인다 */
function FakePage({ withMargin = false }: { withMargin?: boolean }) {
  const sections = [
    { label: "New Members", lines: 3 },
    { label: "Upcoming Races", lines: 2 },
    { label: "Results", lines: 4 },
    { label: "Activity Index", lines: 3 },
  ];

  return (
    <div className={cn("flex flex-col gap-6 pb-6", withMargin ? "pl-12 pr-6" : "px-6")}>
      {sections.map((s) => (
        <section key={s.label} className="flex flex-col">
          <div className="rule-section pb-2">
            <h3 className="font-numeric text-[11px] uppercase tracking-[0.2em]">
              {s.label}
            </h3>
          </div>
          <div className="flex flex-col gap-2 pt-3">
            {Array.from({ length: s.lines }).map((_, i) => (
              <span
                key={i}
                style={{ width: `${92 - i * 11}%` }}
                className="h-3 rounded-sm bg-muted"
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Masthead() {
  return (
    <header className="newsprint relative px-6 pb-3 pt-4">
      <h1 className="text-center font-serif text-[30px] leading-none tracking-[0.02em]">
        기강이야기
      </h1>
      <div className="rule-masthead mt-3" />
    </header>
  );
}

/* ──────────────────────────────────────────────────────────────────
   A. 여백의 독자 — 신문 여백에 독자가 붙는다
   각자가 읽는 지점의 왼쪽 여백에 아바타가 떠 있고, 상대가 스크롤하면 따라 움직인다.
   커서의 모바일 번역. 가장 은은하고, 0명이면 여백이 그냥 여백으로 남는다.
   ────────────────────────────────────────────────────────────────── */
export function PresenceMargin() {
  return (
    <div className="relative bg-background pb-8 text-foreground">
      <Masthead />

      {/* 여백 레일 — 본문 왼쪽을 비워두고 그 자리에 독자를 세운다 */}
      <div className="relative">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-[38px] w-px bg-border"
        />
        {MOCK_READERS.map((r) => (
          <div
            key={r.mem_id}
            style={{ top: `${r.at}%` }}
            className="presence-drift absolute left-2 flex flex-col items-center gap-0.5"
          >
            <span className="relative">
              <Avatar seed={r.mem_id} size="sm" />
              <span
                aria-hidden
                className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-background bg-success"
              />
            </span>
            <span className="max-w-[44px] truncate text-[9px] leading-tight text-muted-foreground">
              {r.mem_nm}
            </span>
          </div>
        ))}
        <FakePage withMargin />
      </div>

      <p className="px-6 text-[11px] leading-relaxed text-muted-foreground">
        아바타가 각자 읽는 위치에 붙어 있고, 상대가 스크롤하면 위아래로 따라 움직입니다.
        아무도 없으면 여백은 그냥 여백입니다.
      </p>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
   B. 제호 옆 열독 카운터
   신문 용어를 그대로 쓴다. 제호 아래 발행정보 줄에 "지금 3명이 읽는 중".
   위치 정보는 안 준다 — 인원만. 가장 싸고 가장 안 거슬린다.
   ────────────────────────────────────────────────────────────────── */
export function PresenceMasthead() {
  return (
    <div className="bg-background pb-8 text-foreground">
      <header className="newsprint relative px-6 pb-3 pt-4">
        <h1 className="text-center font-serif text-[30px] leading-none tracking-[0.02em]">
          기강이야기
        </h1>
        <p className="mt-2.5 text-center font-numeric text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          2026년 7월 23일 목요일
        </p>

        <div className="mt-3 flex items-center justify-center gap-2">
          <div className="flex">
            {MOCK_READERS.map((r, i) => (
              <span
                key={r.mem_id}
                className={cn("rounded-full ring-2 ring-background", i > 0 && "-ml-2")}
              >
                <Avatar seed={r.mem_id} size="sm" />
              </span>
            ))}
          </div>
          <span className="presence-pulse flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span aria-hidden className="size-1.5 rounded-full bg-success" />
            지금 {MOCK_READERS.length}명이 이 면을 읽는 중
          </span>
        </div>

        <div className="rule-masthead mt-3" />
      </header>

      <FakePage />

      <p className="px-6 text-[11px] leading-relaxed text-muted-foreground">
        인원과 얼굴만 알리고 위치는 말하지 않습니다. 구현이 가장 싸고, 감시받는 느낌도
        가장 적습니다.
      </p>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
   C. 섹션 점등 — 지금 이 면을 누가 읽는가
   섹션 헤더 우측에 그 섹션을 보고 있는 사람의 얼굴이 뜬다.
   "어디를 보는지"까지 알려주지만 여백 레일보다 위치가 고정적이라 덜 산만하다.
   ────────────────────────────────────────────────────────────────── */
export function PresenceSection() {
  const sections = [
    { label: "New Members", lines: 3 },
    { label: "Upcoming Races", lines: 2 },
    { label: "Results", lines: 4 },
    { label: "Activity Index", lines: 3 },
  ];
  /** 섹션 라벨 → 지금 그걸 보는 사람들 */
  const bySection: Record<string, typeof MOCK_READERS> = {
    "New Members": MOCK_READERS.filter((r) => r.section === "새 얼굴"),
    Results: MOCK_READERS.filter((r) => r.section === "최근 기록"),
    "Activity Index": MOCK_READERS.filter((r) => r.section === "활동량"),
  };

  return (
    <div className="bg-background pb-8 text-foreground">
      <Masthead />

      <div className="flex flex-col gap-6 px-6 pb-6 pt-5">
        {sections.map((s) => {
          const here = bySection[s.label] ?? [];
          return (
            <section key={s.label} className="flex flex-col">
              <div className="rule-section flex items-center justify-between gap-2 pb-2">
                <h3 className="font-numeric text-[11px] uppercase tracking-[0.2em]">
                  {s.label}
                </h3>
                {here.length > 0 && (
                  <span className="presence-pop flex items-center gap-1">
                    {here.map((r) => (
                      <span
                        key={r.mem_id}
                        title={`${r.mem_nm} 읽는 중`}
                        className="rounded-full ring-2 ring-background"
                      >
                        <Avatar seed={r.mem_id} size="sm" />
                      </span>
                    ))}
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-2 pt-3">
                {Array.from({ length: s.lines }).map((_, i) => (
                  <span
                    key={i}
                    style={{ width: `${92 - i * 11}%` }}
                    className="h-3 rounded-sm bg-muted"
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <p className="px-6 text-[11px] leading-relaxed text-muted-foreground">
        섹션 헤더에 붙어서 위치가 고정입니다. 여백 레일보다 덜 산만하지만, 섹션 단위라
        해상도가 거칩니다.
      </p>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
   D. 하단 띠 — 구글 문서식
   화면 하단에 떠 있는 알약. 들어오고 나갈 때 토스트처럼 알린다.
   가장 노골적이고 가장 "같이 보고 있다"는 감각이 강하다. 대신 탭바와 자리를 다툰다.
   ────────────────────────────────────────────────────────────────── */
export function PresenceDock() {
  return (
    <div className="relative bg-background pb-24 text-foreground">
      <Masthead />
      <FakePage />

      {/* 하단 알약 — 실제로는 fixed지만 시안에서는 컨테이너 기준 absolute */}
      <div className="absolute inset-x-0 bottom-4 flex justify-center px-6">
        <div className="presence-rise flex items-center gap-2.5 rounded-full border border-border bg-background/95 py-2 pl-2.5 pr-4 shadow-lg backdrop-blur">
          <div className="flex">
            {MOCK_READERS.map((r, i) => (
              <span
                key={r.mem_id}
                className={cn("rounded-full ring-2 ring-background", i > 0 && "-ml-2")}
              >
                <Avatar seed={r.mem_id} size="sm" />
              </span>
            ))}
          </div>
          <span className="text-[12px] font-semibold">
            {MOCK_READERS[0].mem_nm} 외 {MOCK_READERS.length - 1}명이 함께 보는 중
          </span>
        </div>
      </div>

      <p className="absolute inset-x-0 bottom-0 px-6 pb-1 text-[11px] leading-relaxed text-muted-foreground">
        존재감이 가장 큽니다. 다만 하단 탭바·설치 배너와 자리를 다투므로 표시 우선순위를
        정해야 합니다.
      </p>
    </div>
  );
}
