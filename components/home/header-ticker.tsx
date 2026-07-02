"use client";

import { useEffect, useState } from "react";

import Link from "next/link";

/** 헤더 중앙 롤링에 표시할 참석 예정 모임 (라벨은 서버에서 계산해 전달) */
export type HeaderUpcoming = {
  /** 모임 상세 딥링크 (/?gthr=gthr_id — uuid를 넘겨야 병렬 1 RTT 패스트패스를 탄다) */
  href: string;
  /** 오늘 | 내일 | D-n */
  dLabel: string;
  /** 예: "수 19:30" */
  timeLabel: string;
  title: string;
};

// 칩을 먼저 4초 보여주고 슬로건 8초 → 반복 (슬로건이 기본 상태, 칩은 리마인드)
const CHIP_MS = 4000;
const SLOGAN_MS = 8000;

function Slogan() {
  return (
    <>
      <p className="font-sans text-[6px] uppercase tracking-[0.15em] text-muted-foreground">
        Since 2024.04.23
      </p>
      <p className="font-sans text-[13px] font-black italic uppercase leading-tight tracking-[-0.03em] text-foreground">
        No time to be weak
      </p>
    </>
  );
}

type Face = "chip" | "slogan";

/**
 * 홈 헤더 중앙 슬로건 자리 — 참석 예정 모임(D-5 이내)이 있으면
 * 슬로건과 모임 칩을 슬롯처럼 위로 굴려가며 교차 표시한다.
 * 없으면 기존과 동일하게 슬로건 고정 (세로 공간 변화 없음).
 */
export function HeaderTicker({ upcoming }: { upcoming: HeaderUpcoming | null }) {
  // 첫 페인트에 칩부터 보여준다 (앱을 열자마자 다가오는 모임을 확인)
  const [active, setActive] = useState<Face>("chip");
  // 다음에 등장할 면 — 전환 없이 아래에 대기시켰다가 다음 프레임에 위로 올라오게 한다
  const [entering, setEntering] = useState<Face | null>(null);

  useEffect(() => {
    if (!upcoming) return;
    const timer = setTimeout(
      () => {
        const next: Face = active === "chip" ? "slogan" : "chip";
        setEntering(next);
        // 대기 위치(translate-y-3)가 페인트된 뒤 전환을 시작해야 "아래→위" 슬롯 롤이 된다
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            setActive(next);
            setEntering(null);
          }),
        );
      },
      active === "chip" ? CHIP_MS : SLOGAN_MS,
    );
    return () => clearTimeout(timer);
  }, [active, upcoming]);

  if (!upcoming) {
    return (
      <div className="pointer-events-none absolute left-0 right-0 flex flex-col items-center justify-center">
        <Slogan />
      </div>
    );
  }

  const faceClass = (face: Face) =>
    face === active
      ? "translate-y-0 opacity-100 transition-all duration-500 ease-in-out motion-reduce:transition-none"
      : face === entering
        ? "translate-y-3 opacity-0"
        : "-translate-y-3 opacity-0 transition-all duration-500 ease-in-out motion-reduce:transition-none";

  return (
    <div className="pointer-events-none absolute left-0 right-0 flex justify-center">
      <div className="relative h-8 w-56">
        <div className={`absolute inset-0 flex flex-col items-center justify-center ${faceClass("slogan")}`}>
          <Slogan />
        </div>
        <div className={`absolute inset-0 flex items-center justify-center ${faceClass("chip")}`}>
          <Link
            href={upcoming.href}
            className={`flex flex-col items-center ${active === "chip" ? "pointer-events-auto" : ""}`}
          >
            <p className="font-sans text-[6px] uppercase tracking-[0.15em] text-primary">
              Next Run · {upcoming.dLabel}
            </p>
            <p className="max-w-52 truncate font-sans text-[13px] font-black leading-tight tracking-[-0.03em] text-foreground">
              {upcoming.timeLabel} · {upcoming.title}
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
}
