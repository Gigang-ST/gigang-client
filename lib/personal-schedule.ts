import { dayjs, formatKST } from "@/lib/dayjs";

import type { CalendarRace } from "@/components/home/mini-calendar";

const KST = "Asia/Seoul";

/** 달력 그리드가 직접 읽는 개인 일정 컬럼 — 조회 select 와 이 타입이 한 쌍이다 */
export const MEM_SCH_SELECT = "mem_sch_id, mem_id, sch_nm, sch_dt, stt_tm, end_tm, cont_txt";

export type MemSchRow = {
  mem_sch_id: string;
  mem_id: string;
  sch_nm: string;
  sch_dt: string;
  stt_tm: string | null;
  end_tm: string | null;
  cont_txt: string | null;
};

/**
 * 날짜(date) + 시각(time, KST 벽시계) → timestamptz ISO.
 * 달력·리스트의 시간 표시와 정렬이 모두 `evt_stt_at`(ISO)을 보므로 개인 일정도 같은 모양으로 싣는다.
 * 리스트 RPC(get_schedule_paged)의 `(sch_dt + stt_tm) AT TIME ZONE 'Asia/Seoul'`과 같은 값이다.
 */
export function memSchTimeToIso(dt: string, tm: string | null): string | null {
  if (!tm) return null;
  return dayjs.tz(`${dt} ${tm}`, KST).toISOString();
}

export function memSchRowToRace(row: MemSchRow): CalendarRace {
  return {
    id: row.mem_sch_id,
    title: row.sch_nm,
    start_date: row.sch_dt,
    type: "personal",
    cont_txt: row.cont_txt,
    crt_by: row.mem_id,
    evt_stt_at: memSchTimeToIso(row.sch_dt, row.stt_tm),
    evt_end_at: memSchTimeToIso(row.sch_dt, row.end_tm),
  };
}

/** 폼 프리필용 — 달력 항목에서 시각(`HH:mm`, KST)을 되읽는다. 종일이면 null */
export function raceTimeKST(iso: string | null | undefined): string | null {
  return iso ? formatKST(iso, "HH:mm") : null;
}

/** 「최근 불러오기」 목록 한 줄 — 폼에 넣는 값(제목·시각·메모) + 목록 날짜 라벨 */
export type RecentPersonalSchedule = Pick<MemSchRow, "mem_sch_id" | "sch_nm" | "sch_dt" | "stt_tm" | "end_tm" | "cont_txt">;

/**
 * 최근 불러오기 목록의 중복 제거 — 모임의 `dedupeRecentGatherings`와 같은 규칙.
 * 같은 일정을 반복해서 넣는 사람을 위한 기능이라, 내용(제목·시각·메모)이 같으면 가장 최근 것 하나로 접는다.
 * 날짜는 시그니처에서 뺀다(새 일정 기준이라 폼에 넣지 않는다). 입력은 최신순이어야 한다.
 */
export function dedupeRecentPersonalSchedules(
  rows: RecentPersonalSchedule[],
  limit = 8,
): RecentPersonalSchedule[] {
  const seen = new Set<string>();
  const result: RecentPersonalSchedule[] = [];
  for (const r of rows) {
    const sig = [r.sch_nm, r.stt_tm ?? "", r.end_tm ?? "", r.cont_txt ?? ""].join("\u0000");
    if (seen.has(sig)) continue;
    seen.add(sig);
    result.push(r);
    if (result.length >= limit) break;
  }
  return result;
}

/** DB time(`HH:mm:ss`) → 폼 입력용 `HH:mm`. 종일(null)은 그대로 */
export function tmToHHmm(tm: string | null): string | null {
  return tm ? dayjs(`2000-01-01 ${tm}`).format("HH:mm") : null;
}
