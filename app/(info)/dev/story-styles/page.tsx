"use client";

import { useState } from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";

import { SKINS } from "./skins";
import { StoryPreview } from "./story-preview";
import {
  StylePledgeFlip,
  StylePledgePlane,
  StylePledgeSign,
} from "./styles-3";

/**
 * 기강이야기 스타일 비교 — 개발 전용 페이지(`/dev/story-styles`).
 *
 * **모든 지면 톤이 같은 구조를 그린다.** 존의 종류·순서·목업은 `StoryPreview` 한 곳이 정하고
 * (현재 기강이야기와 동일한 10존), 테마는 `skins.ts`의 `SkinConfig`로 보이는 것만 바꾼다.
 * 구조가 같아야 나란히 놓고 톤만 비교할 수 있다 — 조각 시안끼리 비교하면 구조 차이가
 * 톤 차이로 오인된다.
 *
 * 각오 J·K·L은 지면 톤이 아니라 **각오 존 전용 기능 시안**이라 전체 구조 대상이 아니다
 * (이미 J. 종이비행기로 채택됨 — 비교 기록으로만 남긴다).
 *
 * 실데이터·실동작(스와이프·리액션·실시간)은 없다. 톤이 정해지면 이 폴더는 통째로 지운다.
 */

/** 각오 존 기능 시안 — 지면 톤(A~I)과 비교 대상이 아니다 */
const PLEDGE_STYLES = [
  {
    key: "pledge-plane",
    name: "각오 J. 종이비행기",
    desc: "신문지를 접어 날린 비행기가 각오 배너를 끌고 지면을 가로지른다. 배너 방식이라 날면서도 읽힌다 (채택됨)",
    render: () => <StylePledgePlane />,
  },
  {
    key: "pledge-sign",
    name: "각오 K. 코스 팻말",
    desc: "마라톤 코스변 손팻말. 러너면 다 아는 물건이라 설명이 필요 없다 (기록 자랑이 이 형태를 물려받음)",
    render: () => <StylePledgeSign />,
  },
  {
    key: "pledge-flip",
    name: "각오 L. 솔라리 보드",
    desc: "공항 안내판. 프로필 카드의 앰버 전광판 언어를 재사용하지만 중복 위험",
    render: () => <StylePledgeFlip />,
  },
] as const;

/** 안내판 영역만 야간인 시안 — 전체가 고정 다크는 아니라 구분한다 */
const PARTIAL_DARK = new Set(["pledge-flip"]);

/** 미리보기 모드 — 앱 테마 따라가기 / 라이트 고정 / 다크 고정 / 좌우 동시 비교 */
type ViewMode = "app" | "light" | "dark" | "split";

/**
 * 테마 고정 프레임.
 *
 * next-themes는 `<html>`에 `.dark`를 붙이지만, 여기서는 한 화면에 라이트·다크를
 * 동시에 띄워야 해서 이 컨테이너에 직접 클래스를 건다.
 */
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

export default function StoryStylesPage() {
  const [active, setActive] = useState<string>(SKINS[0].key);
  const [mode, setMode] = useState<ViewMode>("app");

  const skin = SKINS.find((s) => s.key === active) ?? null;
  const pledge = PLEDGE_STYLES.find((p) => p.key === active) ?? null;
  const desc = skin?.desc ?? pledge?.desc ?? "";

  const render = () =>
    skin ? <StoryPreview skin={skin} /> : pledge ? pledge.render() : null;

  return (
    <div className="flex flex-col">
      {/* 스타일 전환 바 — 실제 페이지엔 없는 개발용 UI */}
      {/* `(info)` 레이아웃의 BackHeader가 `sticky top-0 z-40 h-12`라, 여기서도 top-0을 쓰면
          이 바의 윗줄(테마 칩)이 헤더 **밑으로 파고들어** 가려진다 — 아랫줄만 붙어 보이는 증상.
          헤더 높이(h-12)만큼 내려 붙이고 z는 헤더보다 낮게 둔다(겹치지 않으므로 충분). */}
      <div className="sticky top-12 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex gap-1.5 overflow-x-auto px-4 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {SKINS.map((s) => (
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
          {/* 구분 — 여기부터는 지면 톤이 아니라 각오 존 기능 시안 */}
          <span aria-hidden className="mx-1 w-px shrink-0 bg-border" />
          {PLEDGE_STYLES.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setActive(p.key)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active === p.key
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {p.name}
            </button>
          ))}
        </div>

        {/* 테마 전환 — 시안마다 라이트/다크가 다르게 먹으므로 여기서 바로 비교한다 */}
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
        </div>

        <p className="px-4 pb-3 text-[11px] leading-snug text-muted-foreground">
          {desc}
          {skin?.fixedDark && (
            <span className="text-warning">
              {" "}
              · 이 시안은 항상 야간이라 테마 전환에 반응하지 않습니다.
            </span>
          )}
          {PARTIAL_DARK.has(active) && (
            <span className="text-warning">
              {" "}
              · 안내판 영역만 항상 야간입니다(나머지는 테마를 따라갑니다).
            </span>
          )}
        </p>
      </div>

      {/* 미리보기 — key로 감싸 스타일·모드 전환 시 상태를 초기화한다 */}
      {mode === "split" ? (
        <div key={`${active}-split`} className="grid grid-cols-2">
          <ThemeFrame theme="light" label="라이트">
            {render()}
          </ThemeFrame>
          <ThemeFrame theme="dark" label="다크" className="border-l border-border">
            {render()}
          </ThemeFrame>
        </div>
      ) : mode === "app" ? (
        <div key={`${active}-app`}>{render()}</div>
      ) : (
        <ThemeFrame key={`${active}-${mode}`} theme={mode}>
          {render()}
        </ThemeFrame>
      )}

      <div className="flex flex-col items-center gap-3 px-6 py-8">
        <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
          목업 데이터입니다. 실제 기록·이름이 아니며, 스와이프·리액션·실시간도 동작하지 않습니다.
          <br />
          지면 톤 9종은 모두 <strong>같은 10개 존·같은 순서</strong>로 그려집니다(톤만 비교).
        </p>
        <Link
          href="/story"
          className="rounded-full border border-border px-4 py-2 text-[12px] font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          기강이야기로 돌아가기
        </Link>
      </div>
    </div>
  );
}
