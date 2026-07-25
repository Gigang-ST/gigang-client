import { cn } from "@/lib/utils";
import { BPM_MIN, BPM_MAX } from "@/lib/team-pulse";

/**
 * 팀 심박수 — 크루 컨디션을 심전도(ECG) 파형으로.
 *
 * 웃는 표정(`MoodFace`)을 "팀 펄스(pulse)"라는 이름에 맞춰 심박수 모니터로 바꾼 것.
 * **BPM 하나가 모양·속도를 다 정한다**: `getTeamPulse`가 ratio를 log 매핑해 낸 연속 BPM
 * (50~200)을 받아, 높을수록 파형을 빠르고 크게, 낮을수록 느리고 작게 그린다.
 * 50 근처는 느리고 얕게(그래도 뛴다) — 완전 평선은 만들지 않는다(§beatPath).
 *
 * **파형은 한 개다. 통째로 흐르지 않고, 실제 심전도 모니터처럼 좌→우로 그려졌다 사라진다.**
 * `stroke-dasharray`/`dashoffset`으로, 짧은 "보이는 구간"이 경로를 따라 좌에서 우로 훑고
 * 지나가며 선을 긋고 뒤로 지운다(`.ecg-trace`, globals.css). 스크롤(파형이 옆으로 미끄러짐)이
 * 아니라 **그리기 애니메이션**이라, 파형은 제자리에 한 개만 있고 빛이 그 위를 지나가는 셈이다.
 * `pathLength="1"`로 경로 길이를 1로 정규화해 dash 값을 실제 픽셀과 무관하게 0~1로 다룬다.
 *
 * 선은 `currentColor`라 테마를 따르고, 색은 부모가 정한다(청록 네온 등).
 */

// BPM 범위(50~200)는 `lib/team-pulse.ts`가 정본 — 여기서 재정의하지 않고 가져온다.
// 한쪽만 바꾸면 진폭·속도 매핑이 조용히 어긋나므로 값은 한 곳에만 둔다.

/**
 * BPM → 정규화 강도 0~1. BPM_MIN에서 0(평선), BPM_MAX에서 1(최대 진폭·최고 속도).
 * 파형 진폭·훑기 속도가 공유하는 하나의 축.
 */
function intensityOf(bpm: number): number {
  const clamped = Math.min(BPM_MAX, Math.max(BPM_MIN, bpm));
  return (clamped - BPM_MIN) / (BPM_MAX - BPM_MIN);
}

/** 한 번 훑는 시간(ms) — 심박이 빠를수록 짧다. BPM_MIN≈2600ms → BPM_MAX≈900ms */
function sweepMs(bpm: number): number {
  return Math.round(2600 - intensityOf(bpm) * 1700);
}

/** viewBox 크기 — 파형 하나가 이 폭을 꽉 채운다 */
const VB_W = 200;
const VB_H = 40;
/** 기준선(baseline) y — 위로 갈수록 y가 작아진다 */
const MID = 20;

/**
 * 심전도 한 마디를 그린다 — 참고 이미지의 PQRST 모양.
 *
 * 평선 → 작은 아래 딥 → 작은 위 봉우리(P) → **큰 위 스파이크(R)** → **더 깊은 아래 스파이크(S)**
 * → 작은 위 봉우리(T) → 평선. R은 위로 가장 높고 S는 아래로 가장 깊어, 위아래로 크게 요동친다.
 * 진폭은 `intensity`(0~1) 하나가 정한다 — 높을수록 크게, 낮을수록 작게.
 *
 * 스파이크를 폭의 가운데(x≈70~110)에 몰아 두고 양옆을 긴 평선으로 둬, 훑는 빛이 평선을
 * 지나다 가운데서 확 튀어오르게 한다.
 *
 * **완전 평선(flatline)은 만들지 않는다.** 최소 강도(BPM 50)에서도 진폭 바닥값(0.30)을 둔다 —
 * 활동이 적은 것(작게 뛰는 심장)과 죽은 것(평선)은 다르고, 여기 최소 단계는 전자다.
 */
function beatPath(intensity: number): string {
  // 진폭은 강도에 비례하되 바닥값을 넉넉히 둔다 — 최소 강도(BPM 50)에서도 밋밋하지 않게
  // 확실히 뛴다(0.30).
  const a = 0.3 + 0.7 * intensity; // 0.30(BPM 50) ~ 1.0(BPM 200)
  // 위(-)로 솟는 봉우리·스파이크, 아래(+)로 파이는 딥·스파이크
  const r = MID - 17 * a; // R — 큰 위 스파이크
  const s = MID + 19 * a; // S — 더 깊은 아래 스파이크
  const p = MID - 5 * a; // P — 작은 앞 봉우리
  const t = MID - 6 * a; // T — 작은 뒤 봉우리
  const dip = MID + 4 * a; // Q — R 직전 얕은 딥

  return [
    `M0 ${MID}`,
    `L60 ${MID}`,
    `L70 ${p}`, // P (작은 위 봉우리)
    `L80 ${MID}`,
    `L86 ${dip}`, // Q (얕은 아래 딥)
    `L94 ${r}`, // R (큰 위 스파이크)
    `L104 ${s}`, // S (더 깊은 아래 스파이크)
    `L112 ${MID}`,
    `L126 ${t}`, // T (작은 위 봉우리)
    `L140 ${MID}`,
    `L${VB_W} ${MID}`,
  ].join(" ");
}

type Props = {
  /** 심박수(BPM). getTeamPulse가 준 연속값(50~200). 모양·속도를 이 하나가 정한다 */
  bpm: number;
  className?: string;
};

/**
 * 심전도 파형(한 개, 좌→우로 그려졌다 사라짐). 크기·색은 className으로 부모가 정한다.
 */
export function HeartRate({ bpm, className }: Props) {
  const d = beatPath(intensityOf(bpm));

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      fill="none"
      preserveAspectRatio="none"
      aria-hidden
      className={cn("ecg shrink-0 overflow-hidden", className)}
      style={{ ["--ecg-dur" as string]: `${sweepMs(bpm)}ms` }}
    >
      {/* 훑고 지나가는 선 — pathLength=1로 정규화해 dasharray를 0~1로 다룬다.
          희미한 바탕선을 깔지 않는 이유: 참고 이미지처럼 "지나간 자리는 비어 있다"가
          모니터 느낌이라, 선은 훑는 순간에만 존재한다. */}
      <path
        className="ecg-trace"
        d={d}
        pathLength={1}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
