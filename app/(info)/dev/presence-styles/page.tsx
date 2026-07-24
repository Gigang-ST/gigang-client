"use client";

import { useState } from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";

import {
  PresenceDock,
  PresenceMargin,
  PresenceMasthead,
  PresenceSection,
} from "./styles";

/**
 * 접속자 표시 시안 비교 — 개발 전용 페이지(`/dev/presence-styles`).
 *
 * "지금 이 지면을 누가 같이 보고 있나"를 네 가지 강도로 그린다. 목업이라 실제 접속자는
 * 붙어 있지 않다. 방식이 정해지면 이 폴더는 통째로 지운다.
 */
const STYLES = [
  {
    key: "margin",
    name: "A. 여백의 독자",
    desc: "각자 읽는 위치의 왼쪽 여백에 아바타가 붙고, 상대가 스크롤하면 따라 움직인다. 구글 시트 커서의 모바일 번역 — 가장 은은하고, 아무도 없으면 여백이 그냥 여백으로 남는다",
    render: () => <PresenceMargin />,
  },
  {
    key: "masthead",
    name: "B. 제호 열독 카운터",
    desc: "제호 아래에 얼굴 스택 + \"지금 3명이 이 면을 읽는 중\". 위치는 안 알리고 인원만. 구현이 가장 싸고 감시받는 느낌이 가장 적다",
    render: () => <PresenceMasthead />,
  },
  {
    key: "section",
    name: "C. 섹션 점등",
    desc: "섹션 헤더 우측에 그 섹션을 보고 있는 얼굴이 뜬다. 위치가 고정이라 여백 레일보다 덜 산만하지만 섹션 단위라 해상도가 거칠다",
    render: () => <PresenceSection />,
  },
  {
    key: "dock",
    name: "D. 하단 띠",
    desc: "구글 문서식 하단 알약. \"같이 보는 중\" 감각이 가장 강하다. 대신 하단 탭바·설치 배너·푸시 배너와 자리를 다툰다",
    render: () => <PresenceDock />,
  },
] as const;

/** 미리보기 모드 — 앱 테마 따라가기 / 라이트 고정 / 다크 고정 / 좌우 동시 비교 */
type ViewMode = "app" | "light" | "dark" | "split";

function ThemeFrame({
  theme,
  label,
  className,
  children,
}: {
  theme: "light" | "dark";
  label?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(theme === "dark" && "dark", "bg-background", className)}>
      {label && (
        <div className="border-b border-border px-3 py-1.5 text-center font-numeric text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </div>
      )}
      {children}
    </div>
  );
}

export default function PresenceStylesPage() {
  const [active, setActive] = useState<(typeof STYLES)[number]["key"]>("margin");
  const [mode, setMode] = useState<ViewMode>("app");
  const [howOpen, setHowOpen] = useState(false);
  const current = STYLES.find((s) => s.key === active) ?? STYLES[0];

  return (
    <div className="flex flex-col">
      {/* BackHeader(`sticky top-0 z-40 h-12`) 아래에 붙인다 — top-0이면 윗줄이 헤더에 가린다 */}
      <div className="sticky top-12 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex gap-1.5 overflow-x-auto px-4 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {STYLES.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setActive(s.key)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active === s.key
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {s.name}
            </button>
          ))}
        </div>

        <div className="flex gap-1.5 px-4 pb-2.5">
          {(
            [
              { k: "app", l: "앱 테마" },
              { k: "light", l: "라이트" },
              { k: "dark", l: "다크" },
              { k: "split", l: "동시 비교" },
            ] as const
          ).map((m) => (
            <button
              key={m.k}
              type="button"
              onClick={() => setMode(m.k)}
              className={cn(
                "rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                mode === m.k
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {m.l}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setHowOpen((v) => !v)}
            aria-expanded={howOpen}
            className={cn(
              "ml-auto rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              howOpen
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            어떻게 동작하나
          </button>
        </div>

        <p className="px-4 pb-3 text-[11px] leading-snug text-muted-foreground">
          {current.desc}
        </p>
      </div>

      {howOpen && <HowItWorks />}

      {mode === "split" ? (
        <div key={`${current.key}-split`} className="grid grid-cols-2">
          <ThemeFrame theme="light" label="라이트">
            {current.render()}
          </ThemeFrame>
          <ThemeFrame theme="dark" label="다크" className="border-l border-border">
            {current.render()}
          </ThemeFrame>
        </div>
      ) : mode === "app" ? (
        <div key={`${current.key}-app`}>{current.render()}</div>
      ) : (
        <ThemeFrame key={`${current.key}-${mode}`} theme={mode}>
          {current.render()}
        </ThemeFrame>
      )}

      <div className="flex flex-col items-center gap-3 px-6 py-8">
        <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
          목업입니다. 실제 접속자가 붙어 있지 않고, 아바타도 고정 위치에 있습니다.
        </p>
        <div className="flex gap-2">
          <Link
            href="/dev/story-styles"
            className="rounded-full border border-border px-4 py-2 text-[12px] font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            지면 스타일 비교
          </Link>
          <Link
            href="/story"
            className="rounded-full border border-border px-4 py-2 text-[12px] font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            기강이야기로
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * 구현 방식 설명 패널.
 *
 * "어떻게 하는 건지"가 시안 선택의 절반이다 — 서버를 새로 세워야 하는지, 비용이 드는지,
 * 프라이버시 문제가 있는지를 모르면 어느 안도 못 고른다. 그래서 화면 안에 같이 둔다.
 */
function HowItWorks() {
  return (
    <div className="border-b border-border bg-muted/30 px-5 py-5">
      <h2 className="font-serif text-[18px] text-foreground">어떻게 동작하나</h2>

      <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
        서버를 새로 세우지 않는다. 이미 쓰고 있는 <b>Supabase Realtime</b>의 Presence
        기능이 정확히 이 용도다 — DB에 아무것도 안 쓰고, 채널에 붙어 있는 동안만 메모리에
        상태가 살아 있다가 나가면 자동으로 사라진다. 테이블도 정리 배치도 필요 없다.
      </p>

      <ol className="mt-4 flex flex-col gap-3">
        {[
          {
            n: "1",
            t: "팀별 채널 하나에 접속",
            d: "전광판에 들어오면 `story:{teamId}` 채널을 구독한다. 페이지를 벗어나면 자동으로 빠진다.",
          },
          {
            n: "2",
            t: "내 상태를 track()",
            d: "멤버 id·이름·아바타, 그리고 지금 보고 있는 섹션·스크롤 비율을 올린다. 브라우저 탭을 닫거나 끊기면 서버가 알아서 제거한다(하트비트 기반).",
          },
          {
            n: "3",
            t: "sync / join / leave 수신",
            d: "다른 사람이 들어오고 나갈 때마다 현재 명단 전체가 내려온다. 그걸 그대로 그리면 끝이다.",
          },
          {
            n: "4",
            t: "스크롤은 throttle",
            d: "스크롤마다 보내면 초당 수십 번이다. 200~300ms로 묶고, 섹션이 바뀔 때만 보내면 트래픽이 거의 안 는다.",
          },
        ].map((s) => (
          <li key={s.n} className="flex gap-3">
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-border font-numeric text-[10px] text-muted-foreground">
              {s.n}
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[13px] font-semibold text-foreground">{s.t}</span>
              <span className="text-[12px] leading-relaxed text-muted-foreground">
                {s.d}
              </span>
            </div>
          </li>
        ))}
      </ol>

      <pre className="mt-4 overflow-x-auto rounded-lg border border-border bg-background p-3 font-mono text-[11px] leading-relaxed text-foreground">
        {`const ch = supabase.channel(\`story:\${teamId}\`, {
  config: { presence: { key: memId } },
})

ch.on("presence", { event: "sync" }, () => {
  setReaders(Object.values(ch.presenceState()).flat())
})

ch.subscribe(async (status) => {
  if (status !== "SUBSCRIBED") return
  await ch.track({ mem_nm, avatar_url, section: "results" })
})

// 스크롤 시 (throttle 250ms, 섹션이 바뀔 때만)
ch.track({ mem_nm, avatar_url, section: nextSection })`}
      </pre>

      <div className="mt-4 flex flex-col gap-2">
        <h3 className="font-numeric text-[11px] uppercase tracking-[0.16em] text-foreground">
          정하고 가야 할 것
        </h3>
        {[
          [
            "비로그인은 어떻게 하나",
            "전광판은 비로그인도 본다. 얼굴 없이 인원수에만 더하거나(“외 2명”), 아예 세지 않는 두 선택지가 있다. 세지 않는 쪽이 정직하다.",
          ],
          [
            "숨을 수 있어야 하나",
            "누가 보는지 알리고 싶지 않은 사람이 있다. 설정에 “접속 표시 끄기”가 없으면 A·C·D는 부담이 된다. B(인원만)는 이 문제가 가장 작다.",
          ],
          [
            "몇 명까지 그리나",
            "20명이 동시에 들어오면 여백이 아바타로 덮인다. 최대 3~5명 + “외 N명”으로 끊어야 한다.",
          ],
          [
            "비용",
            "Realtime 동시 접속·메시지 수가 요금제 한도에 걸린다. 크루 규모(수십 명)에서는 무료 구간이지만, 스크롤 throttle을 안 걸면 메시지 수가 빠르게 는다.",
          ],
        ].map(([q, a]) => (
          <div key={q} className="rounded-lg border border-border bg-background p-3">
            <p className="text-[12px] font-semibold text-foreground">{q}</p>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{a}</p>
          </div>
        ))}
      </div>

      <p className="mt-4 text-[12px] leading-relaxed text-muted-foreground">
        <b>추천:</b> B로 시작해서 A로 넓힌다. B는 하루면 붙고 프라이버시 논쟁이 거의 없다.
        사람들이 “누가 보고 있네”를 실제로 즐기는 게 확인되면 그때 위치까지 여는 게 순서다.
      </p>
    </div>
  );
}
