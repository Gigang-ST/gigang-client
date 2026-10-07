// lib/pb-class-score.ts — PB 클래스 2·3단계: 목표·기록·게임팀 점수 순수 계산
//
// 점수는 **저장하지 않고 원천에서 매번 다시 계산한다**(벙·참석·기록·미션 판정 → 점수).
// 이슈(#577 보강 2번)가 바란 건 "배점이 바뀌어도 다시 계산되게"였고, 개인 점수는 전부 벙 기록에서
// 자동으로 나오므로 장부 테이블을 따로 쌓으면 원천과 장부가 갈라질 자리만 생긴다.
// 관리자가 손으로 넣는 건 팀 미션 성공 여부 하나뿐이다(evt_pb_msn_rslt_rel).
//
// 화면·관리자·(향후)MCP가 전부 이 파일을 부른다 — 복사 금지.

import type { PbSessType } from "@/lib/pb-class";

// ─────────────────────────────────────────
// 기록
// ─────────────────────────────────────────

export const PB_REC_TYPES = ["BASE_5K", "MID_5K", "FINAL_10K", "DAEGU_10K"] as const;
export type PbRecType = (typeof PB_REC_TYPES)[number];

export const PB_REC_TYPE_LABEL: Record<PbRecType, string> = {
  BASE_5K: "W1 5K TT · 기준",
  MID_5K: "W6 5K TT · 중간점검",
  FINAL_10K: "10K TT · 최종",
  DAEGU_10K: "대구마라톤 10K",
};

/**
 * "45:30" · "1:02:03" · "4530"(= 45:30) · "10203"(= 1:02:03) → 초. 못 읽으면 null.
 *
 * **숫자만 들어오면 초가 아니라 시계 표기로 읽는다.** 폰 숫자 키패드(`inputMode="numeric"`)에는
 * `:`가 없어서 25:30을 `2530`으로 칠 수밖에 없는데, 그걸 2530초(42:10)로 저장하면 기록 점수가
 * 통째로 틀어진다(리뷰 P1). 끝 두 자리가 초, 그 앞 두 자리가 분, 남는 앞자리가 시간이다.
 */
export function parseTimeInput(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) {
    if (s.length < 3 || s.length > 6) return null;
    const sec = Number(s.slice(-2));
    const min = Number(s.slice(-4, -2));
    const hr = s.length > 4 ? Number(s.slice(0, -4)) : 0;
    if (sec >= 60 || (s.length > 4 && min >= 60)) return null;
    const total = hr * 3600 + min * 60 + sec;
    return total > 0 ? total : null;
  }
  const parts = s.split(":").map((p) => p.trim());
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
  const nums = parts.map(Number);
  const [h, m, sec] = nums.length === 3 ? nums : [0, nums[0], nums[1]];
  if (m >= 60 && nums.length === 3) return null;
  if (sec >= 60) return null;
  const total = h * 3600 + m * 60 + sec;
  return total > 0 ? total : null;
}

/** 초 → "45:30" / "1:02:03" */
export function formatSec(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return "--:--";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

// ─────────────────────────────────────────
// 규칙(배점) — evt_pb_cfg.rule_json. 숫자는 전부 관리자 설정값, 아래는 기본값(#577 보강 3번)
// ─────────────────────────────────────────

export type PbRule = {
  /** 개인 목표 상한(초) — 60분 이내 */
  goalMaxSec: number;
  /** 회원이 목표를 고칠 수 있는 마지막 주차(그 주 화요일 23:59 KST까지) */
  goalEditUntilWk: number;
  /** 중간점검(5K TT) 주차 */
  midWkNo: number;
  /** 5K → 10K 환산 계수(Riegel 1.06: 2^1.06) */
  tenKFactor: number;
  pt: {
    /** 공식훈련·측정 출석 1회 */
    attend: number;
    /** 공식훈련 외 앱 벙 참석 1회(종류 무관) */
    join: number;
    /**
     * 일정 참여로 인정하는 최소 참석 인원(본인 포함). 혼자 연 벙에 혼자 참석해 점수를 무한히
     * 쌓는 걸 막는다 — 「모임에 잘 나와라」가 취지라 혼자 뛴 건 모임이 아니다(리뷰 P2).
     */
    joinMinAttd: number;
    /** 본인이 연 벙에 본인 포함 hostMinAttd명 이상 참석 */
    host: number;
    hostMinAttd: number;
    /** 기록 1% 단축마다 */
    improvePerPct: number;
    improveMidMax: number;
    improveFinalMax: number;
    /** 측정 10K ≤ 개인 목표 */
    goal: number;
    /** 팀 보너스: 그 주 등록 팀원 전원 공식훈련 출석 */
    allAttend: number;
  };
};

export const PB_DEFAULT_RULE: PbRule = {
  goalMaxSec: 3600,
  goalEditUntilWk: 2,
  midWkNo: 6,
  tenKFactor: 2.085,
  pt: {
    attend: 10,
    join: 3,
    joinMinAttd: 2,
    host: 5,
    hostMinAttd: 3,
    improvePerPct: 3,
    improveMidMax: 15,
    improveFinalMax: 30,
    goal: 20,
    allAttend: 20,
  },
};

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;

/** DB jsonb → 규칙. 빠지거나 잘못된 값은 기본값으로 채운다(설정이 일부만 저장돼도 화면이 서게) */
export function ruleFromJson(json: unknown): PbRule {
  const src = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const pt = (src.pt && typeof src.pt === "object" ? src.pt : {}) as Record<string, unknown>;
  const pick = <T extends Record<string, number>>(base: T, from: Record<string, unknown>): T => {
    const out = { ...base };
    for (const k of Object.keys(base) as (keyof T)[]) {
      const v = from[k as string];
      if (isNum(v)) out[k] = v as T[keyof T];
    }
    return out;
  };
  const { pt: _ignored, ...topBase } = PB_DEFAULT_RULE;
  return { ...pick(topBase, src), pt: pick(PB_DEFAULT_RULE.pt, pt) };
}

// ─────────────────────────────────────────
// 점수 코드
// ─────────────────────────────────────────

export const PB_PT_CDS = ["ATTEND", "JOIN", "HOST", "IMPROVE_MID", "IMPROVE_FINAL", "GOAL"] as const;
export type PbPtCd = (typeof PB_PT_CDS)[number];

export const PB_PT_LABEL: Record<PbPtCd | "ALL_ATTEND" | "MISSION", string> = {
  ATTEND: "공식훈련 출석",
  JOIN: "일정 참여",
  HOST: "일정 개설",
  IMPROVE_MID: "중간점검 향상",
  IMPROVE_FINAL: "최종 향상",
  GOAL: "목표 달성",
  ALL_ATTEND: "팀 전원 출석",
  MISSION: "팀 미션",
};

/** 1% 단축마다 perPct점, 상한 max. 느려졌거나 같으면 0. 퍼센트는 내림 */
export function improvementPts(baseSec: number, newSec: number, perPct: number, max: number): number {
  if (!(baseSec > 0) || !(newSec > 0) || newSec >= baseSec) return 0;
  // 부동소수 오차로 정확히 5%가 4.9999…%로 떨어지지 않게 아주 작은 여유를 둔다
  const pct = Math.floor(((baseSec - newSec) / baseSec) * 100 + 1e-9);
  return Math.min(max, pct * perPct);
}

// ─────────────────────────────────────────
// 입력 / 출력
// ─────────────────────────────────────────

export type PbRecValue = { sec: number; cnfm: boolean };

export type PbScoreMember = {
  prtId: string;
  memId: string;
  memNm: string;
  joinWkNo: number;
  /** 늦은 합류(W6+) — 팀전 제외, 기록 점수 없음(목표 달성 배지만) */
  late: boolean;
  grpId: string | null;
  goalSec: number | null;
  recs: Partial<Record<PbRecType, PbRecValue>>;
};

/** 프로젝트 기간 안에 **이미 열린**(삭제 안 됨·시작 지남) 팀 벙 한 건 */
export type PbScoreGathering = {
  gthrId: string;
  /** 공식훈련·측정이면 연결의 wk_no, 아니면 벙 시작 시각의 주차 */
  wkNo: number;
  crtBy: string;
  attendeeMemIds: readonly string[];
  /** 프로젝트에 연결된 벙이면 종류, 아니면 null(= 일정 참여·개설 대상) */
  linked: PbSessType | null;
};

export type PbScoreGroup = { grpId: string; grpNm: string; colorNo: number | null };
export type PbScoreMission = {
  msnId: string;
  wkNo: number | null;
  msnNm: string;
  pt: number;
  succGrpIds: readonly string[];
};

export type PbScoreInput = {
  members: readonly PbScoreMember[];
  gatherings: readonly PbScoreGathering[];
  groups: readonly PbScoreGroup[];
  missions: readonly PbScoreMission[];
  rule: PbRule;
  /** 측정 벙의 주차(연결 전이면 null — 최종 기록 점수는 측정이 연결돼야 붙는다) */
  measureWkNo: number | null;
};

export type PbPtEntry = { ptCd: PbPtCd; wkNo: number; pt: number; gthrId?: string };

export type PbMemberScore = {
  prtId: string;
  memId: string;
  memNm: string;
  grpId: string | null;
  /** 팀전 대상인가(승인·늦은 합류 아님·게임팀 배정) — 아니면 점수 0, 팀 평균에도 안 들어간다 */
  inGame: boolean;
  total: number;
  byCd: Record<PbPtCd, number>;
  entries: PbPtEntry[];
  /** 측정 10K가 목표 이내인가 — 늦은 합류자의 「목표 달성 배지」도 이걸로 */
  goalAchieved: boolean;
};

export type PbGroupScore = {
  grpId: string;
  grpNm: string;
  colorNo: number | null;
  memberCnt: number;
  /** Σ주차별(그 주 등록 팀원의 1인당 평균 개인점수) */
  avgSum: number;
  allAttendWeeks: number[];
  allAttendBonus: number;
  missionBonus: number;
  total: number;
  rank: number;
};

export type PbScoreboard = { members: PbMemberScore[]; groups: PbGroupScore[] };

const round1 = (n: number) => Math.round(n * 10) / 10;
const emptyByCd = (): Record<PbPtCd, number> => ({
  ATTEND: 0,
  JOIN: 0,
  HOST: 0,
  IMPROVE_MID: 0,
  IMPROVE_FINAL: 0,
  GOAL: 0,
});

/** 그 주에 팀에 「등록돼 있던」 사람인가 — 합류 전 주차엔 분모에도 없다(#577 보강 2번) */
const registeredAt = (m: PbScoreMember, wk: number) => m.joinWkNo <= wk;

function memberEntries(m: PbScoreMember, input: PbScoreInput): PbPtEntry[] {
  const { gatherings, rule, measureWkNo } = input;
  const out: PbPtEntry[] = [];

  for (const g of gatherings) {
    if (g.wkNo < m.joinWkNo) continue; // 합류 전 주차는 세지 않는다
    const attended = g.attendeeMemIds.includes(m.memId);
    if (g.linked) {
      if (attended) out.push({ ptCd: "ATTEND", wkNo: g.wkNo, pt: rule.pt.attend, gthrId: g.gthrId });
      continue; // 공식훈련·측정 벙은 일정 참여·개설 대상이 아니다(#577 리뷰 3번)
    }
    if (attended && g.attendeeMemIds.length >= rule.pt.joinMinAttd) {
      out.push({ ptCd: "JOIN", wkNo: g.wkNo, pt: rule.pt.join, gthrId: g.gthrId });
    }
    // 개설 점수는 빈 벙을 열어 점수를 따는 걸 막으려고 **본인 포함** N명 이상일 때만 —
    // 개설자가 정작 안 나온 벙은 「본인 포함」이 아니다
    if (g.crtBy === m.memId && attended && g.attendeeMemIds.length >= rule.pt.hostMinAttd) {
      out.push({ ptCd: "HOST", wkNo: g.wkNo, pt: rule.pt.host, gthrId: g.gthrId });
    }
  }

  const rec = (t: PbRecType) => {
    const r = m.recs[t];
    return r && r.cnfm ? r.sec : null;
  };
  const base = rec("BASE_5K");
  const mid = rec("MID_5K");
  const fin = rec("FINAL_10K");

  // 중간점검 향상은 W1 기준기록이 있는 정식 참가자만 — W2~W5 합류자는 W6이 곧 기준기록이다
  if (m.joinWkNo === 1 && base && mid) {
    const pt = improvementPts(base, mid, rule.pt.improvePerPct, rule.pt.improveMidMax);
    if (pt > 0) out.push({ ptCd: "IMPROVE_MID", wkNo: rule.midWkNo, pt });
  }

  if (measureWkNo !== null && fin) {
    const base5k = m.joinWkNo === 1 ? base : mid;
    if (base5k) {
      const pt = improvementPts(base5k * rule.tenKFactor, fin, rule.pt.improvePerPct, rule.pt.improveFinalMax);
      if (pt > 0) out.push({ ptCd: "IMPROVE_FINAL", wkNo: measureWkNo, pt });
    }
    if (m.goalSec && fin <= m.goalSec) out.push({ ptCd: "GOAL", wkNo: measureWkNo, pt: rule.pt.goal });
  }

  return out;
}

/**
 * 점수판 계산.
 *
 * - 개인 점수: 팀전 대상(늦은 합류 아님 · 게임팀 배정)만. 늦은 합류자는 0점이고 목표 달성 여부만 낸다.
 * - 팀 점수 = Σ주차(그 주 등록 팀원 1인당 평균) + 전원 출석 보너스 + 미션.
 *   주마다 평균을 내는 이유: 중간 합류자는 합류 전 주에 0점이라 시즌 평균이면 합류자를 받은 팀이 손해다.
 *   합계가 아니라 평균이라 인원 많은 팀이 유리하지 않다.
 * - 전원 출석: 그 주에 열린 공식훈련·측정 벙이 있고, 그 주 등록 팀원이 1명 이상이며 전원 참석.
 *   한파로 취소된 주는 벙이 없어 보너스도 없다.
 */
export function computeScoreboard(input: PbScoreInput): PbScoreboard {
  const { groups, missions, gatherings, rule } = input;
  const grpIds = new Set(groups.map((g) => g.grpId));

  const members: PbMemberScore[] = input.members.map((m) => {
    const inGame = !m.late && m.grpId !== null && grpIds.has(m.grpId);
    const entries = inGame ? memberEntries(m, input) : [];
    const byCd = emptyByCd();
    for (const e of entries) byCd[e.ptCd] += e.pt;
    const fin = m.recs.FINAL_10K;
    return {
      prtId: m.prtId,
      memId: m.memId,
      memNm: m.memNm,
      grpId: m.grpId,
      inGame,
      total: entries.reduce((s, e) => s + e.pt, 0),
      byCd,
      entries,
      goalAchieved: !!(fin && fin.cnfm && m.goalSec && fin.sec <= m.goalSec),
    };
  });

  const scoreByPrt = new Map(members.map((s) => [s.prtId, s]));
  const linkedByWk = new Map<number, PbScoreGathering>();
  for (const g of gatherings) if (g.linked) linkedByWk.set(g.wkNo, g);

  const groupScores: PbGroupScore[] = groups.map((grp) => {
    const team = input.members.filter((m) => m.grpId === grp.grpId && scoreByPrt.get(m.prtId)?.inGame);

    // 점수가 난 주차만 돌면 된다 — 점수 없는 주의 평균은 0이라 합에 영향이 없다
    const weeks = new Set<number>();
    for (const m of team) for (const e of scoreByPrt.get(m.prtId)!.entries) weeks.add(e.wkNo);
    let avgSum = 0;
    for (const wk of weeks) {
      const reg = team.filter((m) => registeredAt(m, wk));
      if (reg.length === 0) continue;
      const sum = reg.reduce(
        (s, m) =>
          s +
          scoreByPrt
            .get(m.prtId)!
            .entries.filter((e) => e.wkNo === wk)
            .reduce((a, e) => a + e.pt, 0),
        0,
      );
      avgSum += sum / reg.length;
    }

    const allAttendWeeks: number[] = [];
    for (const [wk, g] of [...linkedByWk.entries()].sort((a, b) => a[0] - b[0])) {
      const reg = team.filter((m) => registeredAt(m, wk));
      if (reg.length > 0 && reg.every((m) => g.attendeeMemIds.includes(m.memId))) allAttendWeeks.push(wk);
    }
    const allAttendBonus = allAttendWeeks.length * rule.pt.allAttend;
    const missionBonus = missions
      .filter((ms) => ms.succGrpIds.includes(grp.grpId))
      .reduce((s, ms) => s + ms.pt, 0);

    return {
      grpId: grp.grpId,
      grpNm: grp.grpNm,
      colorNo: grp.colorNo,
      memberCnt: team.length,
      avgSum: round1(avgSum),
      allAttendWeeks,
      allAttendBonus,
      missionBonus,
      total: round1(avgSum + allAttendBonus + missionBonus),
      rank: 0,
    };
  });

  const sorted = [...groupScores].sort((a, b) => b.total - a.total);
  sorted.forEach((g, i) => {
    g.rank = i > 0 && g.total === sorted[i - 1].total ? sorted[i - 1].rank : i + 1;
  });

  return { members, groups: sorted };
}

/**
 * 회원이 목표를 고칠 수 있는 마지막 주차 — 기본은 goalEditUntilWk(W2)지만 **늦게 합류한 사람은 자기 합류 주차까지.**
 * 전역 잠금만 두면 W3 이후 합류자는 목표를 스스로 한 번도 못 넣는다(관리자만 넣을 수 있게 된다).
 */
export function goalEditLastWk(rule: PbRule, joinWkNo = 1): number {
  return Math.max(rule.goalEditUntilWk, joinWkNo);
}

/** 회원이 지금 목표를 고칠 수 있나 — goalEditLastWk 주차가 끝날 때까지 */
export function canEditGoal(currentWkNo: number, rule: PbRule, joinWkNo = 1): boolean {
  return currentWkNo <= goalEditLastWk(rule, joinWkNo);
}

/** #577 보강 4번의 기본 팀 미션 7개 — 관리자 「기본 미션 불러오기」가 넣는다 */
export const PB_DEFAULT_MISSIONS: { wkNo: number | null; msnNm: string; pt: number }[] = [
  { wkNo: 2, msnNm: "팀 결성 — 팀 이름·팀 색 정하고 단체사진", pt: 10 },
  { wkNo: 4, msnNm: "팀 전원 「기강 포즈」 단체사진", pt: 10 },
  { wkNo: 6, msnNm: "중간점검에서 팀원 절반 이상이 기준기록보다 빨라짐", pt: 20 },
  { wkNo: 9, msnNm: "올해 마지막 런 — 팀 응원 영상 15초", pt: 20 },
  { wkNo: 10, msnNm: "팀원이 앱에 벙을 열고 팀원 3명 이상 참석(공식훈련 밖)", pt: 20 },
  { wkNo: 12, msnNm: "마지막 공식훈련 팀 전원 참석", pt: 20 },
  { wkNo: null, msnNm: "측정 일정 — 팀 전원 완주", pt: 30 },
];

/**
 * W6 미션 「절반 이상이 기준기록보다 빨라짐」 자동 판정 보조(#577 리뷰 9번).
 * 분모는 **기준기록이 W1인 팀원만**(W2~W5 합류자는 W6이 곧 기준이라 비교 불가). 대상 0명이면 null.
 */
export function midImprovedRatio(team: readonly PbScoreMember[]): { improved: number; eligible: number } | null {
  const eligible = team.filter((m) => !m.late && m.joinWkNo === 1 && m.recs.BASE_5K?.cnfm && m.recs.MID_5K?.cnfm);
  if (eligible.length === 0) return null;
  const improved = eligible.filter((m) => m.recs.MID_5K!.sec < m.recs.BASE_5K!.sec).length;
  return { improved, eligible: eligible.length };
}
