// lib/pb-class-teams.ts — PB 클래스 점수판 「Teams」 칸(#621)의 순수 계산
//
// 게임팀마다 「누가 있나 + 팀이 어떻게 뛰고 있나」를 한 장에 모은다. 오너 결정(2026-11-05):
// A안(팀 구성 + 팀 단위 출석) + 크루 한 줄 · 순위/이번 주 점수 · 전원 출석 연속 · 팀 출석 막대 ·
// 팀원별 빨라진 만큼 · 팀원 사진 · 팀원 목표 공개.
//
// ## 지키는 선
// - **이름 옆에 출석을 적지 않는다.** 출석은 팀 단위 숫자(「n/m명」)와 막대(출석률)로만 나간다 —
//   출석표(이름 × 회차)를 걷은 결정(오너 2026-10-08) 그대로다. 그래서 팀원 행엔 출석 필드가 아예 없다.
// - **다시 계산하지 않는다.** 순위·팀 점수는 코어(`computeScoreboard`)가, 주차별 증분은
//   `buildPbTeamSeries`가, 회차 칸 상태는 `buildSessStrip`(을 감싼 `buildPbCrewAttd`)이, 예상 10K 는
//   `predicted10k`가 낸 값을 그대로 쓴다 — 점수판·10K 트랙·누적 출석과 같은 숫자를 말하게.
// - **못한 것은 세지 않는다.** 빨라진 사람만 「▲」를 달고, 전원 출석 연속이 0이면 안 그린다.
// - 승인된 참가자만 센다(입금 대기자는 아직 참가자가 아니다 — 점수판·트랙과 같은 경계).

import { crewGlance, predicted10k, type PbCrewAttd, type PbTeamSeries } from "@/lib/pb-class-chart";
import type { PbRule, PbScoreboard, PbScoreMember } from "@/lib/pb-class-score";

/** 전원 출석 연속 배지의 이모지 — JSX 본문에 직접 치지 않는다(Tailwind 스캐너가 서로게이트 페어를 깨뜨린다) */
export const PB_STREAK_EMOJI = "🔥";

/** 팀 카드에 거는 사진 수 */
export const PB_TEAM_PHOTO_CNT = 4;

type TeamPrtLike = Pick<PbScoreMember, "prtId" | "memId" | "memNm" | "joinWkNo" | "late" | "grpId" | "goalSec" | "recs"> & {
  aprvYn: boolean;
  trnGrpCd: string | null;
  avatarUrl: string | null;
};

export type PbTeamMember = {
  memId: string;
  memNm: string;
  avatarUrl: string | null;
  isMe: boolean;
  /** 실제 훈련팀(고정 ?? 자동) — `PbGameParticipant.trnGrpCd` 그대로 */
  trnGrpCd: string | null;
  /** 예상 10K(초) — 기록이 없으면 null */
  pred10kSec: number | null;
  /** 1주차 기준(1주차 5K × 환산 계수)보다 빨라진 초 — 빨라졌을 때만, 아니면 null */
  fasterSec: number | null;
  /** 목표 10K(초) — 오너 2026-11-05 승인 참가자끼리 공개. 없으면 null */
  goalSec: number | null;
  joinWkNo: number;
  late: boolean;
};

export type PbTeamBar = {
  /** 축 눈금 — "1" … "12" / "측정"(누적 출석 그래프와 같은 눈금) */
  tick: string;
  /** "1주차" / "측정" */
  label: string;
  /** 출석률 0~1. 열린 회차인데 팀에 합류해 있던 사람이 없거나, 열리지 않은 회차면 null */
  rate: number | null;
  /** 한파 등으로 취소된 회차 */
  canceled: boolean;
};

export type PbTeamCard = {
  grpId: string;
  grpNm: string;
  colorNo: number | null;
  isMine: boolean;
  /** 점수판 순위·총점 — 코어 값 그대로 */
  rank: number;
  total: number;
  /** 마지막으로 열린 회차의 팀 출석 — 그 회차에 합류해 있던 팀원이 없으면 null */
  recent: { label: string; attdCnt: number; eligibleCnt: number } | null;
  /** 마지막으로 점수가 난 주차에 얻은 점수와 그 주 순위 변동(+ 오름 / − 내림 / 0). 점수가 없으면 null */
  week: { wkNo: number; gain: number; rankMove: number } | null;
  /** 가장 최근 회차부터 거슬러 센 전원 출석 연속 주 — 0이면 안 그린다 */
  allAttendStreak: number;
  /** 첫 회차 ~ 마지막으로 열린 회차 */
  bars: PbTeamBar[];
  members: PbTeamMember[];
};

export type PbTeams = {
  /** 크루 한 줄 — 열린 회차가 없으면 null */
  glance: {
    label: string;
    attdCnt: number;
    eligibleCnt: number;
    all: boolean;
    /** 크루 평균 10K 가 1주차보다 빨라진 초 — 빨라지지 않았거나 비교할 사람이 없으면 null */
    fasterSec: number | null;
  } | null;
  /** 점수판 순위 순서 그대로 */
  teams: PbTeamCard[];
  /** 게임팀이 없거나(미배정) 늦은 합류라 팀전 밖인 승인 참가자 */
  noTeam: PbTeamMember[];
};

/** 1주차 기준 예상 10K = 1주차 5K × 환산 계수(점수 코어·트랙과 같은 식). 기준기록이 없으면 null */
function baseline10k(p: Pick<PbScoreMember, "recs">, rule: Pick<PbRule, "tenKFactor">): number | null {
  const base = p.recs.BASE_5K?.sec;
  return base && base > 0 ? Math.round(base * rule.tenKFactor) : null;
}

/**
 * 예상 10K 와 1주차 대비 빨라진 만큼.
 * 지금 예상이 곧 1주차 기록에서 나온 값이면(새 기록 없음) 비교할 게 없다 — 0초 빨라짐이 아니라 비운다.
 */
function paceOf(p: TeamPrtLike, rule: Pick<PbRule, "tenKFactor" | "midWkNo">) {
  const pred = predicted10k(p, rule);
  const base = baseline10k(p, rule);
  const comparable = !!pred && pred.src !== "BASE_5K" && base !== null;
  return {
    pred10kSec: pred?.sec ?? null,
    base,
    comparable,
    fasterSec: comparable && pred!.sec < base! ? base! - pred!.sec : null,
  };
}

/** 나를 맨 앞에, 나머지는 이름순 — 기록순으로 세우면 팀 안 줄 세우기가 된다 */
function byMeThenName(a: PbTeamMember, b: PbTeamMember): number {
  if (a.isMe !== b.isMe) return a.isMe ? -1 : 1;
  return a.memNm.localeCompare(b.memNm, "ko");
}

/** 점수 → 순위(공동 순위) — 코어 `computeScoreboard`와 같은 매김(높은 점수 먼저, 같으면 같은 등수) */
function rankOf(total: number, all: readonly number[]): number {
  return 1 + all.filter((t) => t > total).length;
}

export function buildPbTeams(args: {
  participants: readonly TeamPrtLike[];
  scoreboard: PbScoreboard;
  rule: Pick<PbRule, "tenKFactor" | "midWkNo">;
  /** 누적 출석 보드 — 회차 칸 상태·팀 출석의 원천(`buildPbCrewAttd`) */
  crew: PbCrewAttd;
  /** 팀 점수 시리즈(`buildPbTeamSeries`) — 팀 발표 전·점수 전이면 null */
  series: PbTeamSeries | null;
  /** 열린(삭제 안 됨·시작 지남) 공식훈련·측정 회차의 주차 — 전원 출석 연속을 거슬러 셀 때 */
  heldWkNos: readonly number[];
  myMemId: string;
  myGrpId: string | null;
}): PbTeams {
  const { participants, scoreboard, rule, crew, series, heldWkNos, myMemId, myGrpId } = args;
  const approved = participants.filter((p) => p.aprvYn);
  const inGameByPrt = new Map(scoreboard.members.map((m) => [m.prtId, m.inGame]));
  const cellsByMem = new Map(crew.rows.map((r) => [r.memId, r.cells]));

  const toMember = (p: TeamPrtLike): PbTeamMember => {
    const pace = paceOf(p, rule);
    return {
      memId: p.memId,
      memNm: p.memNm,
      avatarUrl: p.avatarUrl,
      isMe: p.memId === myMemId,
      trnGrpCd: p.trnGrpCd,
      pred10kSec: pace.pred10kSec,
      fasterSec: pace.fasterSec,
      goalSec: p.goalSec && p.goalSec > 0 ? p.goalSec : null,
      joinWkNo: p.joinWkNo,
      late: p.late,
    };
  };

  const heldDesc = [...new Set(heldWkNos)].sort((a, b) => b - a);
  const lastIdx = crew.lastHeldIdx;
  const seriesLast = series ? series.weeks.length - 1 : -1;
  const prevTotals = series && seriesLast > 0 ? series.teams.map((t) => t.cum[seriesLast - 1]) : null;

  const teams: PbTeamCard[] = scoreboard.groups.map((g) => {
    const team = approved.filter((p) => p.grpId === g.grpId && inGameByPrt.get(p.prtId) === true);
    const cellsOf = team.map((p) => cellsByMem.get(p.memId) ?? []);

    // 열마다 팀 출석 — 상태 판정은 `buildSessStrip` 칸 그대로(합류 전은 분모에서 뺀다)
    const attdAt = (i: number) => {
      const eligible = cellsOf.filter((c) => c[i] !== undefined && c[i] !== "before_join").length;
      const attd = cellsOf.filter((c) => c[i] === "attended").length;
      return { attd, eligible };
    };
    const bars: PbTeamBar[] = crew.columns.slice(0, lastIdx + 1).map((col, i) => {
      if (col.state !== "held") return { tick: col.tick, label: col.label, rate: null, canceled: col.state === "canceled" };
      const { attd, eligible } = attdAt(i);
      return { tick: col.tick, label: col.label, rate: eligible > 0 ? attd / eligible : null, canceled: false };
    });
    let recent: PbTeamCard["recent"] = null;
    if (lastIdx >= 0) {
      const { attd, eligible } = attdAt(lastIdx);
      if (eligible > 0) recent = { label: crew.columns[lastIdx].label, attdCnt: attd, eligibleCnt: eligible };
    }

    // 전원 출석 연속 — 코어가 판정한 주(`allAttendWeeks`)를 최근 회차부터 거슬러 센다. 취소된 주는 열린 회차가 아니라
    // 목록에 없으니 끊지도 세지도 않는다(그 주엔 누구도 나올 수 없었다)
    const bonus = new Set(g.allAttendWeeks);
    let allAttendStreak = 0;
    for (const wk of heldDesc) {
      if (!bonus.has(wk)) break;
      allAttendStreak += 1;
    }

    let week: PbTeamCard["week"] = null;
    const st = series?.teams.find((t) => t.grpId === g.grpId);
    if (series && st && seriesLast >= 0) {
      const prevRank = prevTotals ? rankOf(st.cum[seriesLast - 1], prevTotals) : g.rank;
      week = { wkNo: series.weeks[seriesLast], gain: st.gain[seriesLast], rankMove: prevRank - g.rank };
    }

    return {
      grpId: g.grpId,
      grpNm: g.grpNm,
      colorNo: g.colorNo,
      isMine: g.grpId === myGrpId,
      rank: g.rank,
      total: g.total,
      recent,
      week,
      allAttendStreak,
      bars,
      members: team.map(toMember).sort(byMeThenName),
    };
  });

  const noTeam = approved
    .filter((p) => inGameByPrt.get(p.prtId) !== true)
    .map(toMember)
    .sort(byMeThenName);

  // 크루 평균 10K — 1주차 기준과 지금 예상을 **같은 사람끼리** 견준다(새 기록을 올린 사람만 분모에 넣는다).
  // 사람마다 다른 집합으로 평균을 내면 기록을 올린 사람 구성만 바뀌어도 「빨라졌다」가 오르내린다.
  const g0 = crewGlance(crew);
  let glance: PbTeams["glance"] = null;
  if (g0) {
    const pairs = approved.map((p) => paceOf(p, rule)).filter((x) => x.comparable);
    let fasterSec: number | null = null;
    if (pairs.length > 0) {
      const avgBase = pairs.reduce((s, x) => s + x.base!, 0) / pairs.length;
      const avgNow = pairs.reduce((s, x) => s + x.pred10kSec!, 0) / pairs.length;
      const diff = Math.round(avgBase - avgNow);
      fasterSec = diff > 0 ? diff : null;
    }
    glance = { label: g0.label, attdCnt: g0.attdCnt, eligibleCnt: g0.eligibleCnt, all: g0.all, fasterSec };
  }

  return { glance, teams, noTeam };
}

/**
 * 팀마다 최근 사진 N장 — 입력은 이미 최신순(활동일 → 작성 시각)으로 정렬된 사진 글이다.
 * 팀 밖 사람(팀 없음·입금 대기·참가자 아님)의 글은 버린다.
 */
export function pickTeamPhotos<T extends { mem_id: string }>(
  posts: readonly T[],
  grpOfMem: ReadonlyMap<string, string>,
  n = PB_TEAM_PHOTO_CNT,
): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const p of posts) {
    const grp = grpOfMem.get(p.mem_id);
    if (!grp) continue;
    const list = out.get(grp) ?? [];
    if (list.length >= n) continue;
    list.push(p);
    out.set(grp, list);
  }
  return out;
}
