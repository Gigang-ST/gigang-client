import { formatRecapNumber } from "@/lib/mileage-recap";
import { cn } from "@/lib/utils";

import type { CSSProperties } from "react";

/** 한 자리가 굴러가는 띠 — 0~9를 두 바퀴 세운다(목표는 두 번째 바퀴에서 멈춘다) */
const STRIP = Array.from({ length: 20 }, (_, i) => i % 10);

/**
 * 오도미터 숫자 — 자릿수가 굴러가 멈춘다. 순수 CSS라 서버 컴포넌트로 그린다.
 *
 * `autoplay`면 로드와 함께 돌고(첫 화면 히어로), 아니면 감싼 `RecapReveal`이 화면에 들어올 때
 * 돈다. 기본 상태가 이미 최종 숫자라 JS가 늦거나 모션을 꺼도 값은 맞게 서 있다.
 * 스크린리더엔 굴러가는 띠 대신 숫자 한 번만 읽힌다.
 */
export function RecapOdometer({
  value,
  digits = 0,
  autoplay = false,
  className,
}: {
  value: number;
  /** 최대 소수 자릿수 */
  digits?: number;
  autoplay?: boolean;
  className?: string;
}) {
  const text = formatRecapNumber(value, digits);
  let col = 0;
  return (
    <span className={cn("odo tabular-nums", autoplay && "odo-autoplay", className)}>
      <span className="sr-only">{text}</span>
      {[...text].map((ch, i) => {
        if (!/\d/.test(ch)) {
          return (
            <span key={i} aria-hidden>
              {ch}
            </span>
          );
        }
        const style = { "--d": Number(ch) + 10, "--i": col++ } as CSSProperties;
        return (
          <span key={i} className="odo-col" aria-hidden style={style}>
            <span className="odo-strip">
              {STRIP.map((d, j) => (
                <span key={j}>{d}</span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}
