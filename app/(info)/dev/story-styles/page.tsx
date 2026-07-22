"use client";

import { useState } from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";

import {
  StyleBoard,
  StyleEditorial,
  StyleMagazine,
  StyleMinimal,
  StyleTabloid,
} from "./styles";
import {
  StyleBrand,
  StyleBusinessweek,
  StyleHalftone,
  StyleSpeed,
} from "./styles-2";

/**
 * 기강이야기 스타일 비교 — 개발 전용 페이지(`/dev/story-styles`).
 *
 * 목업 데이터로 같은 내용을 5가지 톤으로 그린다. 실데이터·실동작(스와이프·리액션)은 없다.
 * 스타일이 정해지면 이 폴더는 통째로 지운다.
 */
const STYLES = [
  {
    key: "editorial",
    name: "A. 에디토리얼",
    desc: "명조 헤드라인 + 괘선. 현재 적용된 스타일 (The Athletic 계열)",
    render: () => <StyleEditorial />,
  },
  {
    key: "tabloid",
    name: "B. 타블로이드",
    desc: "굵은 제호, 반전 블록, 큰 숫자. 스포츠 신문 1면. 임팩트 최대",
    render: () => <StyleTabloid />,
  },
  {
    key: "magazine",
    name: "C. 매거진",
    desc: "거대 숫자 주도, 색 블록, 막대 그래프. Strava 연말결산 계열",
    render: () => <StyleMagazine />,
  },
  {
    key: "board",
    name: "D. 야간 전광판",
    desc: "경기장 LED 보드. 항상 야간 + 앰버 수치 (이전 시안)",
    render: () => <StyleBoard />,
  },
  {
    key: "minimal",
    name: "E. 미니멀 카드",
    desc: "라운드 카드 + 산세리프. 앱 나머지 페이지와 가장 잘 붙는다",
    render: () => <StyleMinimal />,
  },
  {
    key: "businessweek",
    name: "F. 비즈니스위크",
    desc: "숫자가 헤드라인보다 크다. 색 최소, 선 굵기 3종으로만 위계 (Bloomberg 계열)",
    render: () => <StyleBusinessweek />,
  },
  {
    key: "brand",
    name: "G. 러닝 브랜드",
    desc: "넓은 여백 + 큰 사진 자리 + 넓은 자간. 프리미엄 스포츠 브랜드 톤",
    render: () => <StyleBrand />,
  },
  {
    key: "halftone",
    name: "H. 인쇄 망점",
    desc: "halftone 텍스처로 진짜 인쇄물 질감. 사진 제판 + 2단 조판 (CSS만, 이미지 0바이트)",
    render: () => <StyleHalftone />,
  },
  {
    key: "speed",
    name: "I. 스피드",
    desc: "숫자를 기울여 속도감. 스포츠 타이포 문법 + 다크 기준",
    render: () => <StyleSpeed />,
  },
] as const;

/**
 * 테마 전환에 반응하지 않는 시안.
 *
 * D·I는 `--board-*`(라이트/다크 공통 야간값)를 쓴다. 의도된 설계지만
 * 테마 버튼을 눌러도 안 바뀌면 고장으로 읽히므로 UI에 명시한다.
 */
const FIXED_DARK = new Set(["board", "speed"]);

/** 미리보기 모드 — 앱 테마 따라가기 / 라이트 고정 / 다크 고정 / 좌우 동시 비교 */
type ViewMode = "app" | "light" | "dark" | "split";

/**
 * 테마 고정 프레임.
 *
 * next-themes는 `<html>`에 `.dark`를 붙이지만, 여기서는 한 화면에 라이트·다크를
 * 동시에 띄워야 해서 이 컨테이너에 직접 클래스를 건다. 토큰(`--background` 등)이
 * `.dark` 하위에서 재정의되므로 `bg-background`를 함께 줘야 배경까지 따라온다.
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
  const [active, setActive] = useState<(typeof STYLES)[number]["key"]>("editorial");
  const [mode, setMode] = useState<ViewMode>("app");
  const current = STYLES.find((s) => s.key === active) ?? STYLES[0];

  return (
    <div className="flex flex-col">
      {/* 스타일 전환 바 — 실제 페이지엔 없는 개발용 UI */}
      <div className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
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
          {current.desc}
          {FIXED_DARK.has(current.key) && (
            <span className="text-warning">
              {" "}
              · 이 시안은 항상 야간이라 테마 전환에 반응하지 않습니다.
            </span>
          )}
        </p>
      </div>

      {/* 미리보기 — key로 감싸 스타일·모드 전환 시 상태를 초기화한다 */}
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
          목업 데이터입니다. 실제 기록·이름이 아니며, 스와이프·리액션도 동작하지 않습니다.
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
