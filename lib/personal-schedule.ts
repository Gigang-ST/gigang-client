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
