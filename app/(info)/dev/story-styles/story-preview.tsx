"use client";

import { cn } from "@/lib/utils";

import {
  MOCK_ACTV,
  MOCK_DATELINE,
  MOCK_FLEX,
  MOCK_GHOSTS,
  MOCK_LEDE,
  MOCK_NEWBIES,
  MOCK_PLEDGES,
  MOCK_RACE,
  MOCK_RECORDS,
  MOCK_WEATHER,
} from "./mock";

import type { SkinConfig } from "./skins";

/**
 * 지면 미리보기 — **모든 테마가 공유하는 하나의 구조.**
 *
 * 존의 종류와 순서는 여기서만 정하고(현재 기강이야기와 동일), 테마는 `SkinConfig`로
 * "어떻게 보이는가"만 바꾼다. 그래야 9종을 나란히 놓았을 때 구조가 아니라 톤만 비교된다.
 * 존을 추가·삭제할 일이 생기면 이 파일 한 곳만 고치면 9종에 동시에 반영된다.
 *
 * 미리보기라 실동작은 없다: 리드는 1건 고정(스와이프 없음), 각오는 정지된 목록(비행 없음),
 * 떠다니는 아바타 오버레이·응원 카운트업은 생략. 비교 대상이 "톤"이라 정지 화면으로 충분하다.
 */
export function StoryPreview({ skin }: { skin: SkinConfig }) {
  return (
    <div className={cn("relative flex flex-col break-keep pb-10", skin.frameClass)}>
      {/* 질감 오버레이(망점 등) — 자체 opacity를 갖는 텍스처는 본문 위에 따로 깐다 */}
      {skin.overlayClass && (
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 text-foreground",
            skin.overlayClass,
          )}
        />
      )}

      {/* ① 제호 */}
      <header className="px-6 pb-3 pt-4">
        <h1 className={skin.mastheadClass}>기강이야기</h1>
        <p className={skin.datelineClass}>{MOCK_DATELINE}</p>
        <div className={skin.mastheadRuleClass} />
      </header>

      {/* ② 1면 리드 */}
      <Lede skin={skin} />

      <div className="flex flex-col gap-8 pt-6">
        {/* ③ 기강 기상대 */}
        <Section skin={skin} label="Weather" lead="크루 분위기와 근거 수치">
          <Weather skin={skin} />
        </Section>

        {/* ④ 각오 */}
        <Section skin={skin} label="Pledges" lead="기강인들이 날린 각오">
          <ul className="flex flex-col pt-1">
            {MOCK_PLEDGES.slice(0, 4).map((p) => (
              <li key={p.id} className={skin.rowClass}>
                <span className={skin.rowLeadClass}>{p.text}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {p.mem_nm} · {p.when}
                </span>
              </li>
            ))}
          </ul>
        </Section>

        {/* ⑤ 기록 자랑 팻말 */}
        <Section skin={skin} label="Course Signs" lead="코스에 꽂아둔 기록">
          <div className="flex gap-3 overflow-x-auto pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {MOCK_FLEX.map((f) => (
              <div key={f.id} className="w-[150px] shrink-0">
                {/* 사진 자리 — 미리보기라 placeholder */}
                <div className="flex aspect-square w-full items-center justify-center rounded-sm border border-current/25 bg-current/5">
                  <span className={cn("text-[11px] opacity-60")}>{f.sport}</span>
                </div>
                <p className="mt-1.5 line-clamp-2 text-[12px] leading-snug">
                  {f.comment}
                </p>
                <p className="mt-0.5 text-[10px] opacity-60">
                  {f.mem_nm} · {f.date} · {f.dist}
                </p>
              </div>
            ))}
          </div>
        </Section>

        {/* ⑥ 새 얼굴 */}
        <Section skin={skin} label="New Members" lead="최근 30일, 3명이 기강에 합류">
          <ul className="flex flex-col pt-1">
            {MOCK_NEWBIES.map((n) => (
              <li key={n.mem_id} className={skin.rowClass}>
                <span className={skin.rowLeadClass}>{n.mem_nm}</span>
                <span className={skin.rowTrailClass}>{n.joined}</span>
              </li>
            ))}
          </ul>
        </Section>

        {/* ⑦ 다가오는 대회 */}
        <Section skin={skin} label="Upcoming Races">
          <div className={cn(skin.rowClass, "mt-1")}>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className={skin.rowLeadClass}>{MOCK_RACE.comp_nm}</span>
              <span className="text-[11px] opacity-60">
                {MOCK_RACE.date} · {MOCK_RACE.reg_cnt}명 출전
              </span>
            </span>
            <span className={cn(skin.rowTrailClass, skin.accentClass)}>
              {MOCK_RACE.dday}
            </span>
          </div>
        </Section>

        {/* ⑧ 최근 기록 */}
        <Section skin={skin} label="Results" lead="가장 최근에 올라온 기록부터">
          <ul className="flex flex-col pt-1">
            {MOCK_RECORDS.map((r) => (
              <li key={r.mem_id + r.time} className={skin.rowClass}>
                <span className={skin.rowLeadClass}>{r.label}</span>
                <span className="flex shrink-0 items-baseline gap-2">
                  <span className={skin.rowTrailClass}>{r.time}</span>
                  <span className="text-[12px] opacity-60">{r.mem_nm}</span>
                </span>
              </li>
            ))}
          </ul>
        </Section>

        {/* ⑨ 활동량 */}
        <Section skin={skin} label="Activity Index" lead="7월 기강 활동량">
          <ul className="flex flex-col pt-1">
            {MOCK_ACTV.map((a) => (
              <li key={a.mem_id} className={skin.rowClass}>
                <span className="w-4 shrink-0 font-numeric text-[13px] opacity-60 tabular-nums">
                  {a.rank}
                </span>
                <span className={skin.rowLeadClass}>{a.mem_nm}</span>
                <span className={skin.rowTrailClass}>{a.score}</span>
              </li>
            ))}
          </ul>
        </Section>

        {/* ⑩ 현상수배 */}
        <Section skin={skin} label="Wanted" lead="요즘 통 안 보이는 얼굴들">
          <ul className="flex flex-col pt-1">
            {MOCK_GHOSTS.map((g) => (
              <li key={g.mem_id} className={skin.rowClass}>
                <span className={skin.rowLeadClass}>{g.mem_nm}</span>
                <span className={skin.rowTrailClass}>{g.days}일째</span>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  );
}

/** 섹션 껍데기 — 라벨 + 괘선 + 리드문. 모든 존이 이걸 쓴다(구조 통일의 핵심) */
function Section({
  skin,
  label,
  lead,
  children,
}: {
  skin: SkinConfig;
  label: string;
  lead?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col px-6">
      <div className={skin.sectionRuleClass}>
        <h2 className={skin.sectionLabelClass}>{label}</h2>
      </div>
      {lead && <p className={skin.sectionLeadClass}>{lead}</p>}
      <div className="pt-1">{children}</div>
    </section>
  );
}

/** 기상대 — 분위기 한 단어 + 수치 격자 + 8주 추세 막대 */
function Weather({ skin }: { skin: SkinConfig }) {
  return (
    <div className="flex flex-col gap-4 pt-2">
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className={cn(skin.figureClass, skin.accentClass)}>
            {MOCK_WEATHER.mood}
          </span>
          <span className="text-[11px] opacity-60">
            직전 4주 평균 대비 {Math.round(MOCK_WEATHER.ratio * 100)}%
          </span>
        </div>
        {/* 8주 추세 — 막대 */}
        <div className="flex h-10 items-end gap-1">
          {MOCK_WEATHER.trend.map((v, i) => (
            <span
              key={i}
              className="w-1.5 bg-current opacity-40"
              style={{ height: `${Math.max(8, v * 100)}%` }}
            />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        {MOCK_WEATHER.stats.map((s) => (
          <div key={s.label} className="flex items-baseline justify-between gap-2">
            <span className="text-[12px] opacity-60">{s.label}</span>
            <span className={skin.rowTrailClass}>{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 1면 리드 — 테마 성격이 가장 크게 갈리는 자리라 판형을 몇 가지로 나눈다.
 * 담는 내용(킥커·헤드라인·부제·기록·인물)은 어느 판형이든 같다.
 */
function Lede({ skin }: { skin: SkinConfig }) {
  const d = MOCK_LEDE;

  if (skin.ledeVariant === "tabloid") {
    return (
      <div className="px-6 pt-5">
        <span className={skin.sectionLabelClass}>{d.kicker}</span>
        <h2 className={cn(skin.headlineClass, "mt-3")}>{d.headline}</h2>
        <div className="mt-4 flex items-end justify-between gap-3 bg-foreground px-4 py-3">
          <span className="text-[12px] font-bold uppercase tracking-widest text-background">
            {d.figureLabel}
          </span>
          <span className="font-numeric text-[34px] font-extrabold leading-none text-background tabular-nums">
            {d.figure}
          </span>
        </div>
        <p className="mt-2 text-[13px] opacity-70">{d.standfirst}</p>
      </div>
    );
  }

  if (skin.ledeVariant === "magazine") {
    return (
      <div className="px-6 pt-6">
        <span className={skin.sectionLabelClass}>{d.kicker}</span>
        <p className={cn(skin.figureClass, "mt-2")}>{d.figure}</p>
        <p className={cn("mt-1 text-[11px] uppercase tracking-[0.2em]", skin.accentClass)}>
          {d.figureLabel}
        </p>
        <h2 className={cn(skin.headlineClass, "mt-4")}>{d.headline}</h2>
        <p className="mt-1 text-[13px] opacity-60">{d.standfirst}</p>
      </div>
    );
  }

  if (skin.ledeVariant === "stat") {
    return (
      <div className="px-6 pt-6">
        <span className={skin.sectionLabelClass}>{d.kicker}</span>
        <p className={cn(skin.figureClass, "mt-2")}>{d.figure}</p>
        <h2 className={cn(skin.headlineClass, "mt-3")}>{d.headline}</h2>
        <p className="mt-1 text-[12px] opacity-60">
          {d.standfirst} · {d.figureLabel}
        </p>
      </div>
    );
  }

  if (skin.ledeVariant === "board") {
    return (
      <div className="px-6 pt-5">
        <div className="border border-board-line p-4">
          <span className={skin.sectionLabelClass}>{d.kicker}</span>
          <h2 className={cn(skin.headlineClass, "mt-2")}>{d.headline}</h2>
          <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-board-line pt-3">
            <span className="font-numeric text-[10px] uppercase tracking-[0.2em] text-board-muted">
              {d.figureLabel}
            </span>
            <span className={skin.figureClass}>{d.figure}</span>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-board-muted">{d.standfirst}</p>
      </div>
    );
  }

  if (skin.ledeVariant === "minimal") {
    return (
      <div className="px-6 pt-5">
        <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
          <span className={skin.sectionLabelClass}>{d.kicker}</span>
          <h2 className={skin.headlineClass}>{d.headline}</h2>
          <p className="text-[13px] text-muted-foreground">{d.standfirst}</p>
          <div className="flex items-baseline justify-between gap-3 border-t border-border pt-3">
            <span className="text-[12px] text-muted-foreground">{d.figureLabel}</span>
            <span className={skin.figureClass}>{d.figure}</span>
          </div>
        </div>
      </div>
    );
  }

  if (skin.ledeVariant === "brand") {
    return (
      <div className="px-6 pt-8">
        {/* 큰 사진 자리 — 브랜드 톤의 핵심 */}
        <div className="flex aspect-[4/3] w-full items-center justify-center border border-border">
          <span className="text-[10px] uppercase tracking-[0.3em] opacity-40">
            {d.figureLabel}
          </span>
        </div>
        <span className={cn(skin.sectionLabelClass, "mt-6 block")}>{d.kicker}</span>
        <h2 className={cn(skin.headlineClass, "mt-3")}>{d.headline}</h2>
        <p className="mt-2 text-[13px] tracking-wide opacity-60">{d.standfirst}</p>
        <p className={cn(skin.figureClass, "mt-4")}>{d.figure}</p>
      </div>
    );
  }

  // editorial (기본) — 명조 헤드라인 + 우측 기록
  return (
    <div className="flex items-start gap-4 px-6 pt-5">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className={skin.sectionLabelClass}>{d.kicker}</span>
        <h2 className={skin.headlineClass}>{d.headline}</h2>
        <p className="text-[13px] opacity-60">{d.standfirst}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end">
        <span className={skin.figureClass}>{d.figure}</span>
        <span className="text-[10px] uppercase tracking-[0.16em] opacity-60">
          {d.figureLabel}
        </span>
      </div>
    </div>
  );
}
