/**
 * 모임 계열 조건 평가 — 신규 25종 중 모임 데이터를 보는 것들.
 *
 * 설계: docs/design/2026-07-30-신규-칭호-후보-모임-깅스타그램.md §7.1
 *
 * 두 가지 규칙이 이 파일 전체를 관통한다:
 *
 * 1. **판정 기준은 "모임이 실제로 열린 날"(`gthr_mst.stt_at`)이다.** 신청·취소 시각이
 *    아니다(§7.5). 취소 계열도 마찬가지 — 8/20 모임을 8/13에 취소해도 그 모임은 적용일
 *    이후에 열리므로 인정된다. 사건의 주인공은 취소 버튼이 아니라 모임이다.
 *
 * 2. **`stt_at`은 timestamptz라 KST로 환산한 뒤 날짜·시각·요일을 본다.** UTC로 세면
 *    `미라클`(새벽 7시 이전)이 전날 저녁으로 밀린다(§8).
 */

import { dayjs } from "@/lib/dayjs";
import { selectInChunks } from "@/lib/titles/query-chunk";

import type {
  CondAttendOnBirthday,
  CondGthrAttendInMonth,
  CondGthrAttendStreak,
  CondGthrCancelCount,
  CondGthrCancelReason,
  CondGthrLastSlot,
  CondGthrMonthAttendRate,
  CondGthrSameDayCount,
} from "./types";

const KST = "Asia/Seoul";

/** `evaluators.ts`의 DB 타입과 같은 것(순환 import를 피해 구조로만 받는다). */
type DB = {
  from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

/** 참석한 모임 한 건 — 모든 참석 계열이 이 모양을 공유한다. */
type AttendedGathering = {
  gthrId: string;
  /** 모임 시작 시각(KST) */
  startKst: dayjs.Dayjs;
};

/**
 * 한 멤버를 평가하는 동안 살아 있는 조회 캐시.
 *
 * ⚠️ **이게 없으면 같은 조회를 조건마다 다시 한다.** 한 멤버의 모임 칭호는 6종인데
 * (미라클·오픈런·올빼미·3연벙·하루에두번·생일축하해) 전부 같은 참석 목록을 본다 —
 * 캐시가 없으면 **멤버당 6번 같은 쿼리**가 나가고, 200명이면 1,200번이다.
 * 실제로 dev에서 배치가 30초를 넘겼다.
 *
 * 수명은 **멤버 하나**다(엔진이 멤버마다 새로 만든다). 배치 전체로 늘리면 빨라지지만
 * 그건 팀 단위 프리페치로 가는 게 맞다 — 여기서 오래 들고 있으면 그만큼 메모리에 쌓인다.
 */
export type GatheringCache = Map<string, unknown>;

/** 이 조건이 볼 수 있는 모임의 시작 시각 상한(KST). 일 배치의 3일 유예가 여기로 들어온다. */
export type GatheringWindow = {
  /** 이 날짜(YYYY-MM-DD, KST)까지 **시작한** 모임만 본다. null이면 지금까지 전부. */
  asOfDt: string | null;
  /** 칭호 적용 시작일(YYYY-MM-DD, KST). null이면 소급 제한 없음. */
  effStartDt: string | null;
  /** 같은 멤버의 조건들이 조회를 나눠 쓰는 캐시. 없으면 매번 새로 조회한다. */
  cache?: GatheringCache;
};

/** 캐시가 있으면 재사용하고, 없으면 조회해서 채운다. */
async function cached<T>(win: GatheringWindow, key: string, load: () => Promise<T>): Promise<T> {
  const k = `${key}|${win.asOfDt ?? ""}|${win.effStartDt ?? ""}`;
  const hit = win.cache?.get(k);
  if (hit !== undefined) return hit as T;
  const value = await load();
  win.cache?.set(k, value);
  return value;
}

/**
 * `YYYY-MM-DD` date 문자열에서 `MM-DD`를 뽑는다.
 *
 * date 컬럼(`_dt`)이라 타임존 변환은 필요 없지만(§8), 날짜 포맷팅에 `.slice()`를 쓰지
 * 않는다는 규칙(CLAUDE.md)을 지켜 dayjs 포맷으로 뽑는다.
 */
function monthDay(dt: string): string {
  return dayjs(dt).format("MM-DD");
}

/**
 * 캐시 키에 붙이는 **창 서명**.
 *
 * ⚠️ 창(`effStartDt`·`asOfDt`)은 **칭호마다 다르다**(`ttl_mst.eff_stt_dt`). 그런데 캐시는
 * 멤버·배치 단위로 공유되므로, 창을 키에서 빼면 **먼저 평가된 칭호가 걸러 놓은 목록을
 * 다음 칭호가 물려받는다** — 적용일이 이른 칭호가 늦은 칭호의 결과를 조용히 부풀리거나
 * 그 반대가 된다. 캐시가 창 안에서 거르는 함수는 전부 이 서명을 키에 붙인다.
 */
function winSig(win: GatheringWindow): string {
  return `${win.effStartDt ?? "all"}~${win.asOfDt ?? "now"}`;
}

/** 모임 시작 시각(KST)이 이 조건의 창 안에 드는가. */
function inWindow(startKst: dayjs.Dayjs, win: GatheringWindow): boolean {
  const d = startKst.format("YYYY-MM-DD");
  if (win.effStartDt && d < win.effStartDt) return false;
  if (win.asOfDt && d > win.asOfDt) return false;
  return true;
}

/**
 * 이 멤버가 참석한(=신청하고 취소하지 않은) 모임 목록.
 *
 * ⚠️ **"참석"은 출석이 아니라 신청 상태다** — `gthr_attd_rel`에 출석 체크 컬럼이 없다.
 * 운영진이 안 나온 사람을 사후에 취소 처리하므로, 일 배치가 3일 유예(`asOfDt`)를 줘서
 * 명단이 정리된 뒤에 센다(§4.1).
 */
function loadAttended(
  db: DB,
  memId: string,
  teamId: string,
  win: GatheringWindow,
): Promise<AttendedGathering[]> {
  // 모임 칭호 6종이 전부 이 목록을 본다 — 캐시가 이 조회를 멤버당 1번으로 묶는다.
  return cached(win, `attended:${teamId}:${memId}:${winSig(win)}`, async () => {
    const { data } = await db
      .from("gthr_attd_rel")
      .select("gthr_id, gthr_mst!inner(stt_at, team_id, del_yn)")
      .eq("mem_id", memId)
      .eq("gthr_mst.team_id", teamId)
      .eq("gthr_mst.del_yn", false);

    return (data ?? [])
      .map((r: { gthr_id: string; gthr_mst: { stt_at: string } | { stt_at: string }[] }) => {
        const g = Array.isArray(r.gthr_mst) ? r.gthr_mst[0] : r.gthr_mst;
        return { gthrId: r.gthr_id, startKst: dayjs(g.stt_at).tz(KST) };
      })
      .filter((a: AttendedGathering) => inWindow(a.startKst, win));
  });
}

/** "HH:mm" 문자열을 그날의 분 단위로. 시각 비교를 문자열 파싱 없이 하기 위한 것. */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

// ---------------------------------------------------------------------------
// #1 gthr_attend_in_month — 미라클 · 올빼미 · 오픈런
// ---------------------------------------------------------------------------

/**
 * 한 달력월(KST) 안에 조건에 맞는 모임 참석 N회.
 *
 * **누적이 아니라 월 단위인 이유**: 누적이면 시간이 지나는 것만으로 쌓여 결국 전원이 받는다.
 * 월 안에 N번을 요구해야 "새벽형/밤형"이라는 **성향**을 말하는 칭호가 된다(§4.1).
 */
export async function evalGthrAttendInMonth(
  rule: CondGthrAttendInMonth,
  memId: string,
  teamId: string,
  win: GatheringWindow,
  db: DB,
): Promise<boolean> {
  let attended = await loadAttended(db, memId, teamId, win);

  if (rule.before_time) {
    const limit = toMinutes(rule.before_time);
    attended = attended.filter((a) => a.startKst.hour() * 60 + a.startKst.minute() < limit);
  }
  if (rule.after_time) {
    const limit = toMinutes(rule.after_time);
    attended = attended.filter((a) => a.startKst.hour() * 60 + a.startKst.minute() > limit);
  }

  if (rule.first_applicant) {
    const firstIds = await filterFirstApplicantGatherings(
      db,
      memId,
      attended.map((a) => a.gthrId),
    );
    attended = attended.filter((a) => firstIds.has(a.gthrId));
  }

  const byMonth = new Map<string, number>();
  for (const a of attended) {
    const ym = a.startKst.format("YYYY-MM");
    byMonth.set(ym, (byMonth.get(ym) ?? 0) + 1);
  }
  return [...byMonth.values()].some((n) => n >= rule.count);
}

/**
 * 그 모임의 **첫 신청자가 본인인** 모임만 골라낸다(오픈런).
 *
 * ⚠️ **개설자를 반드시 뺀다.** 모임 개설 시 개설자가 `gthr_attd_rel`에 자동 등록되므로
 * (`app/actions/gathering/manage-gathering.ts`), 빼지 않으면 첫 신청자가 언제나 개설자여서
 * 칭호가 "모임을 만든 사람"을 가리키게 된다(§4.1).
 */
async function filterFirstApplicantGatherings(
  db: DB,
  memId: string,
  gthrIds: string[],
): Promise<Set<string>> {
  if (!gthrIds.length) return new Set();

  // 청크마다 따로 정렬되지만, 한 모임의 신청 행은 한 청크 안에 모이므로 "모임별 첫 신청자"는 정확하다.
  const rows = await selectInChunks<{
    gthr_id: string;
    mem_id: string;
    gthr_mst: { crt_by: string } | { crt_by: string }[];
  }>(gthrIds, (chunk) =>
    db
      .from("gthr_attd_rel")
      .select("gthr_id, mem_id, crt_at, gthr_mst!inner(crt_by)")
      .in("gthr_id", chunk)
      .order("crt_at", { ascending: true }),
  );

  const firstByGthr = new Map<string, string>();
  for (const r of rows) {
    const g = Array.isArray(r.gthr_mst) ? r.gthr_mst[0] : r.gthr_mst;
    if (r.mem_id === g.crt_by) continue; // 개설자 자동 등록분은 후보에서 제외
    if (!firstByGthr.has(r.gthr_id)) firstByGthr.set(r.gthr_id, r.mem_id);
  }

  const mine = new Set<string>();
  for (const [gthrId, firstMemId] of firstByGthr) {
    if (firstMemId === memId) mine.add(gthrId);
  }
  return mine;
}

// ---------------------------------------------------------------------------
// #2 gthr_cancel_count — 다음엔꼭 · 회전문 · 월요병
// #10 gthr_cancel_reason — 칼퇴실패 · 구구절절
// ---------------------------------------------------------------------------

type SelfCancel = {
  gthrId: string;
  /** 취소한 시각(KST) */
  eventKst: dayjs.Dayjs;
  /** 그 모임이 열리는 시각(KST) — 적용일·요일 판정의 기준 */
  startKst: dayjs.Dayjs;
  reason: string | null;
};

/**
 * 본인이 **직접** 취소한 이력.
 *
 * ⚠️ **`actor_cd = 'self'`만 센다.** 운영진이 노쇼를 사후 정리하면 `gthr_attd_hist`에
 * **admin 취소 이력**이 남는데, self를 안 박으면 **그 정리 행위 자체가 그 사람에게 칭호를
 * 발급한다** — 월요일 모임에 안 나와서 지웠더니 `월요병`이 붙고, 운영진이 적은 취소 사유가
 * `칼퇴실패`·`구구절절`이 되는 식이다(§4.1).
 */
function loadSelfCancels(
  db: DB,
  memId: string,
  teamId: string,
  win: GatheringWindow,
): Promise<SelfCancel[]> {
  // 취소 계열 5종(다음엔꼭·회전문·월요병·칼퇴실패·구구절절)이 같은 목록을 본다.
  return cached(win, `cancels:${teamId}:${memId}:${winSig(win)}`, () =>
    loadSelfCancelsUncached(db, memId, teamId, win),
  );
}

async function loadSelfCancelsUncached(
  db: DB,
  memId: string,
  teamId: string,
  win: GatheringWindow,
): Promise<SelfCancel[]> {
  const { data } = await db
    .from("gthr_attd_hist")
    .select("gthr_id, evt_at, reason_txt, gthr_mst!inner(stt_at, team_id, del_yn)")
    .eq("mem_id", memId)
    .eq("actor_cd", "self")
    .eq("evt_cd", "cancel")
    .eq("gthr_mst.team_id", teamId)
    .eq("gthr_mst.del_yn", false);

  return (data ?? [])
    .map((r: {
      gthr_id: string;
      evt_at: string;
      reason_txt: string | null;
      gthr_mst: { stt_at: string } | { stt_at: string }[];
    }) => {
      const g = Array.isArray(r.gthr_mst) ? r.gthr_mst[0] : r.gthr_mst;
      return {
        gthrId: r.gthr_id,
        eventKst: dayjs(r.evt_at).tz(KST),
        startKst: dayjs(g.stt_at).tz(KST),
        reason: r.reason_txt,
      };
    })
    .filter((c: SelfCancel) => inWindow(c.startKst, win));
}

export async function evalGthrCancelCount(
  rule: CondGthrCancelCount,
  memId: string,
  teamId: string,
  win: GatheringWindow,
  db: DB,
): Promise<boolean> {
  let cancels = await loadSelfCancels(db, memId, teamId, win);

  // 당일 취소 — 취소일과 모임일을 **양쪽 다 KST로 환산해** 비교한다(§8).
  if (rule.same_day) {
    cancels = cancels.filter(
      (c) => c.eventKst.format("YYYY-MM-DD") === c.startKst.format("YYYY-MM-DD"),
    );
  }
  if (rule.weekday !== undefined) {
    cancels = cancels.filter((c) => c.startKst.day() === rule.weekday);
  }

  // 회전문 — "같은 모임에서 N건"이라 모임별로 센다(전체 누적이 아니다).
  if (rule.same_gathering) {
    const byGthr = new Map<string, number>();
    for (const c of cancels) byGthr.set(c.gthrId, (byGthr.get(c.gthrId) ?? 0) + 1);
    return [...byGthr.values()].some((n) => n >= rule.count);
  }

  return cancels.length >= rule.count;
}

export async function evalGthrCancelReason(
  rule: CondGthrCancelReason,
  memId: string,
  teamId: string,
  win: GatheringWindow,
  db: DB,
): Promise<boolean> {
  const cancels = await loadSelfCancels(db, memId, teamId, win);
  const hit = cancels.filter((c) => {
    const reason = c.reason?.trim();
    if (!reason) return false;
    if (rule.keyword && !reason.includes(rule.keyword)) return false;
    if (rule.min_length !== undefined && reason.length < rule.min_length) return false;
    return true;
  });
  return hit.length >= rule.count;
}

// ---------------------------------------------------------------------------
// #3 gthr_attend_streak — 3연벙
// ---------------------------------------------------------------------------

/**
 * 참석한 **날짜**가 N일 연속.
 *
 * "연속된 모임 N개"가 아니라 **날짜 기준**이다 — 월 16개가 열리고 하루에 둘이 열리는 날도
 * 있어서 "연속된 모임"은 모집단 정의가 안 선다. 날짜로 보면 그 문제가 통째로 사라지고,
 * 하루에 여러 개 나가도 그날은 1일로 센다(§4 표).
 */
export async function evalGthrAttendStreak(
  rule: CondGthrAttendStreak,
  memId: string,
  teamId: string,
  win: GatheringWindow,
  db: DB,
): Promise<boolean> {
  const attended = await loadAttended(db, memId, teamId, win);
  const days = [...new Set(attended.map((a) => a.startKst.format("YYYY-MM-DD")))].sort();
  if (days.length < rule.days) return false;

  let run = 1;
  for (let i = 1; i < days.length; i++) {
    const prev = dayjs.tz(days[i - 1], KST);
    const cur = dayjs.tz(days[i], KST);
    run = cur.diff(prev, "day") === 1 ? run + 1 : 1;
    if (run >= rule.days) return true;
  }
  return run >= rule.days;
}

// ---------------------------------------------------------------------------
// #4 gthr_month_attend_rate — 프로참석러
// ---------------------------------------------------------------------------

/**
 * 한 달력월(KST) 모임 참석률이 기준 이상.
 *
 * **분모는 "취소된 모임만 뺀 그 달 전체"다.** 가입 시점도, 정원 마감으로 신청조차 못 한
 * 모임도 따지지 않는다 — 늦게 들어온 달에 못 받는 건 맞는 결과지 보정할 일이 아니다(§4.1).
 *
 * ⚠️ **달이 끝나야 확정된다.** 달 중간에 75%였다가 남은 모임을 빠지면 최종은 70% 아래인데
 * 엔진이 비회수라 먼저 준 칭호는 안 돌아온다 — 그래서 월 마감 배치에서만 판정한다(§7.2).
 */
export async function evalGthrMonthAttendRate(
  rule: CondGthrMonthAttendRate,
  memId: string,
  teamId: string,
  win: GatheringWindow,
  db: DB,
): Promise<boolean> {
  const attended = await loadAttended(db, memId, teamId, win);
  if (!attended.length) return false;

  // 분모: 그 달에 열린 팀 모임 전체(취소분 제외).
  // ⚠️ **팀 공통 데이터라 캐시 키에 memId를 넣지 않는다** — 배치가 캐시를 공유하면
  // 멤버 수만큼 반복되던 조회가 1번이 된다(월 배치 20초의 주범이었다).
  const heldByMonth = await cached(win, `team-gatherings:${teamId}:${winSig(win)}`, async () => {
    const { data: allRows } = await db
      .from("gthr_mst")
      .select("stt_at")
      .eq("team_id", teamId)
      .eq("del_yn", false);

    const byMonth = new Map<string, number>();
    for (const r of (allRows ?? []) as { stt_at: string }[]) {
      const startKst = dayjs(r.stt_at).tz(KST);
      if (!inWindow(startKst, win)) continue;
      const ym = startKst.format("YYYY-MM");
      byMonth.set(ym, (byMonth.get(ym) ?? 0) + 1);
    }
    return byMonth;
  });

  const mineByMonth = new Map<string, number>();
  for (const a of attended) {
    const ym = a.startKst.format("YYYY-MM");
    mineByMonth.set(ym, (mineByMonth.get(ym) ?? 0) + 1);
  }

  for (const [ym, held] of heldByMonth) {
    if (held < rule.min_gatherings) continue; // 모임이 적은 달은 판정 제외
    const mine = mineByMonth.get(ym) ?? 0;
    if (mine / held >= rule.min_rate) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// #5 gthr_same_day_count — 하루에두번
// ---------------------------------------------------------------------------

export async function evalGthrSameDayCount(
  rule: CondGthrSameDayCount,
  memId: string,
  teamId: string,
  win: GatheringWindow,
  db: DB,
): Promise<boolean> {
  const attended = await loadAttended(db, memId, teamId, win);
  const byDay = new Map<string, number>();
  for (const a of attended) {
    const d = a.startKst.format("YYYY-MM-DD");
    byDay.set(d, (byDay.get(d) ?? 0) + 1);
  }
  const qualifyingDays = [...byDay.values()].filter((n) => n >= rule.per_day).length;
  return qualifyingDays >= rule.count;
}

// ---------------------------------------------------------------------------
// #6 gthr_last_slot — 막차
// ---------------------------------------------------------------------------

/**
 * 정원이 있는 모임에서 **신청한 그 순간** 순번이 정확히 정원 번째.
 *
 * 나머지 참석 계열과 달리 **신청 즉시 판정**한다 — 이건 출석이 아니라 **신청 순번의
 * 사건**이고, 3일 뒤로 미루면 그 사이 노쇼 한 명이 지워져 "정확히 정원 번째" 행이 아예
 * 사라진다(미루면 오히려 아무도 못 딴다, §7.2).
 *
 * 나중에 정원이 늘어 새 마지막이 나와도 **둘 다 인정**한다(회수 없음) — 이미 "그때 막차를
 * 탔다"는 사실은 변하지 않는다(§4.1).
 */
export async function evalGthrLastSlot(
  rule: CondGthrLastSlot,
  memId: string,
  teamId: string,
  win: GatheringWindow,
  db: DB,
): Promise<boolean> {
  const { data: myRows } = await db
    .from("gthr_attd_rel")
    .select("gthr_id, crt_at, gthr_mst!inner(stt_at, max_prt_cnt, team_id, del_yn)")
    .eq("mem_id", memId)
    .eq("gthr_mst.team_id", teamId)
    .eq("gthr_mst.del_yn", false)
    .not("gthr_mst.max_prt_cnt", "is", null);

  type MyRow = {
    gthr_id: string;
    crt_at: string;
    gthr_mst: { stt_at: string; max_prt_cnt: number } | { stt_at: string; max_prt_cnt: number }[];
  };
  const mine = ((myRows ?? []) as MyRow[])
    .map((r) => {
      const g = Array.isArray(r.gthr_mst) ? r.gthr_mst[0] : r.gthr_mst;
      return {
        gthrId: r.gthr_id,
        myCrtAt: r.crt_at,
        cap: g.max_prt_cnt,
        startKst: dayjs(g.stt_at).tz(KST),
      };
    })
    .filter((r) => inWindow(r.startKst, win));

  if (!mine.length) return false;

  // 각 모임의 신청 순번을 매긴다. 취소로 빠진 사람은 행이 없어 순번이 당겨지는데,
  // 그건 "지금 명단 기준 마지막"이라는 뜻이라 이 조건의 취지에 맞다.
  // 청크마다 따로 정렬되지만, 한 모임의 신청 행은 한 청크 안에 모이므로 순번은 정확하다.
  const allRows = await selectInChunks<{ gthr_id: string; mem_id: string }>(
    mine.map((m) => m.gthrId),
    (chunk) =>
      db
        .from("gthr_attd_rel")
        .select("gthr_id, mem_id, crt_at")
        .in("gthr_id", chunk)
        .order("crt_at", { ascending: true }),
  );

  const orderByGthr = new Map<string, string[]>();
  for (const r of allRows) {
    const list = orderByGthr.get(r.gthr_id) ?? [];
    list.push(r.mem_id);
    orderByGthr.set(r.gthr_id, list);
  }

  let hits = 0;
  for (const m of mine) {
    const order = orderByGthr.get(m.gthrId) ?? [];
    if (order[m.cap - 1] === memId) hits += 1;
  }
  return hits >= rule.count;
}

// ---------------------------------------------------------------------------
// #22 attend_on_birthday — 생일축하해
// ---------------------------------------------------------------------------

/**
 * 생일(월·일)에 **크루와 같이 나갔나** — 모임 참석 또는 대회 출전.
 *
 * 깅스타그램·마일리지런처럼 **혼자 올리는 기록으로는 못 받는다.** 생일에 축하받는 자리는
 * 같이 있는 자리지 혼자 사진 올리는 게 아니다(§4.1).
 *
 * **윤년은 고려하지 않는다** — 2/29 생일은 평년에 안 열린다. 4년에 한 번 제대로 붙는 것으로
 * 충분하고, 2/28로 당기는 예외를 두면 그 사람만 매년 받는다.
 */
export async function evalAttendOnBirthday(
  rule: CondAttendOnBirthday,
  memId: string,
  teamId: string,
  win: GatheringWindow,
  db: DB,
): Promise<boolean> {
  const { data: mem } = await db
    .from("mem_mst")
    .select("birth_dt")
    .eq("mem_id", memId)
    .maybeSingle();

  const birthDt = (mem as { birth_dt: string | null } | null)?.birth_dt;
  if (!birthDt) return false; // 생일 미입력이면 영원히 판정 불가
  // "MM-DD" — date 컬럼이라 KST 변환이 필요 없다(§8). 문자열을 자르지 않고 포맷으로 뽑는다.
  const mmdd = monthDay(birthDt);

  const onBirthday = new Set<string>();

  // ① 모임 참석 — stt_at은 timestamptz라 KST로 환산해야 한다
  const attended = await loadAttended(db, memId, teamId, win);
  for (const a of attended) {
    const d = a.startKst.format("YYYY-MM-DD");
    if (a.startKst.format("MM-DD") === mmdd) onBirthday.add(d);
  }

  // ② 대회 출전 — race_dt는 date 컬럼이라 그대로 안전하다.
  //
  // ⚠️ **`vers = 0` · `del_yn = false`를 반드시 건다.** `rec_race_hist`는 버전 테이블이라
  // 안 걸면 수정 이력과 지운 기록까지 딸려 와, **생일에 뛴 대회를 삭제해도 칭호가 붙는다**.
  // 같은 계열인 `evalRaceTimeExactHour`·`evalRacePairReversal`은 이미 걸고 있었다.
  const { data: races } = await db
    .from("rec_race_hist")
    .select("race_dt")
    .eq("mem_id", memId)
    .eq("vers", 0)
    .eq("del_yn", false);
  for (const r of (races ?? []) as { race_dt: string }[]) {
    if (!r.race_dt) continue;
    if (win.effStartDt && r.race_dt < win.effStartDt) continue;
    if (win.asOfDt && r.race_dt > win.asOfDt) continue;
    if (monthDay(r.race_dt) === mmdd) onBirthday.add(r.race_dt);
  }

  return onBirthday.size >= rule.count;
}
