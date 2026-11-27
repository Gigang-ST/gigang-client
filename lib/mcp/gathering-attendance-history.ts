import type { SupabaseClient } from "@supabase/supabase-js";

import { classifyCancelTiming, minutesFromStart, type CancelTiming } from "@/lib/gathering/cancel-timing";
import type { OperatorContext } from "@/lib/mcp/auth";
import { toKstLabel } from "@/lib/mcp/kst-datetime";
import { ToolDeniedError, ToolInputError } from "@/lib/mcp/queries";
import type { Database } from "@/lib/supabase/database.types";

/**
 * 기강 운영 MCP — 읽기 도구 `list_gathering_attendance_history`(#758).
 *
 * 모임이 끝난 뒤 "시작 시각까지 취소하지 않고 안 온 사람(노쇼)"을 가리려면, 참석을 **언제** 취소했는지가
 * 보여야 한다. 모임별로 현재 참석자(신청 시각)와 취소 이력(취소 시각·주체·사유)을 돌려주고, 각 취소가
 * 모임 시작 시각 **전/후**인지 구분해 준다.
 *
 * - **admin 전용.** 앱도 취소 이력은 관리자 화면에서 운영 판단용으로 본다. 거부는 조회 이전에 일어난다.
 * - **읽기 전용.** 쓰지 않는다. 팀 경계는 `team_id = ctx.team_id` 로 건다(service-role 이라 RLS 가 없다).
 * - 신청 시각(`applied_at`)은 현재 참석자는 `gthr_attd_rel.crt_at`, 취소된 사람은 취소 이력의 `reg_at`
 *   (#758 이후 취소분부터 기록 — 그 전 이력은 null)이다.
 * - 이력은 같은 사람이 여러 번 취소했으면 **전부** 돌려준다. `rejoined` 는 지금 다시 참석 중인지.
 */

type Db = SupabaseClient<Database>;

export class ListAttendanceHistoryDeniedError extends ToolDeniedError {
  constructor(message = "참석 신청·취소 이력은 운영진(admin)만 조회할 수 있습니다.") {
    super(message);
    this.name = "ListAttendanceHistoryDeniedError";
  }
}

export type AttendanceHistoryAttendee = {
  mem_id: string;
  mem_nm: string | null;
  /** 참석(신청) 시각 KST 라벨. */
  applied_at: string | null;
};

export type AttendanceHistoryCancellation = {
  mem_id: string;
  mem_nm: string | null;
  /** 취소 전 신청 시각 KST 라벨 — #758 이전 이력은 null. */
  applied_at: string | null;
  canceled_at: string;
  /** 시작 시각 기준 전/후. 시작 뒤 취소는 노쇼 후보다. */
  timing: CancelTiming;
  /** 시작 시각으로부터 몇 분(시작 후 +, 시작 전 −). */
  minutes_from_start: number;
  /** 취소한 주체. admin 이면 운영진이 뺀 것(노쇼 처리 포함). */
  by: "self" | "admin";
  by_mem_nm: string | null;
  reason: string | null;
  /** 지금 다시 참석 중인가(취소 뒤 재신청). */
  rejoined: boolean;
};

export type AttendanceHistoryResult = {
  gathering: { gthr_id: string; gthr_nm: string; start_at: string | null; end_at: string | null };
  attendees: AttendanceHistoryAttendee[];
  cancellations: AttendanceHistoryCancellation[];
  summary: {
    attending_count: number;
    canceled_count: number;
    canceled_before_start: number;
    canceled_after_start: number;
  };
};

type HistRow = {
  mem_id: string;
  evt_at: string;
  reg_at: string | null;
  actor_cd: string;
  actor_mem_id: string | null;
  reason_txt: string | null;
};

export async function listGatheringAttendanceHistory(
  supabase: Db,
  ctx: OperatorContext,
  input: { gathering_id: string },
): Promise<AttendanceHistoryResult> {
  if (!ctx.is_admin) throw new ListAttendanceHistoryDeniedError();

  const { data: gthr } = await supabase
    .from("gthr_mst")
    .select("gthr_id, gthr_nm, stt_at, end_at")
    .eq("gthr_id", input.gathering_id)
    .eq("team_id", ctx.team_id)
    .eq("del_yn", false)
    .maybeSingle();
  if (!gthr) throw new ToolInputError("모임을 찾을 수 없습니다.");

  const [{ data: rels }, { data: hist }] = await Promise.all([
    supabase.from("gthr_attd_rel").select("mem_id, crt_at").eq("gthr_id", input.gathering_id),
    supabase
      .from("gthr_attd_hist")
      .select("mem_id, evt_at, reg_at, actor_cd, actor_mem_id, reason_txt")
      .eq("gthr_id", input.gathering_id)
      .eq("evt_cd", "cancel")
      .order("evt_at", { ascending: true }),
  ]);

  const relRows = (rels ?? []) as { mem_id: string; crt_at: string }[];
  const histRows = (hist ?? []) as HistRow[];

  // 이름은 따로 한 번에 읽는다 — hist 는 mem_mst FK 가 둘(대상·행위자)이라 임베드가 모호하다.
  const ids = [
    ...new Set([
      ...relRows.map((r) => r.mem_id),
      ...histRows.flatMap((h) => (h.actor_mem_id ? [h.mem_id, h.actor_mem_id] : [h.mem_id])),
    ]),
  ];
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const { data: mems } = await supabase.from("mem_mst").select("mem_id, mem_nm").in("mem_id", ids);
    for (const m of (mems ?? []) as { mem_id: string; mem_nm: string }[]) names.set(m.mem_id, m.mem_nm);
  }

  const attending = new Set(relRows.map((r) => r.mem_id));
  const attendees: AttendanceHistoryAttendee[] = relRows
    .slice()
    .sort((a, b) => a.crt_at.localeCompare(b.crt_at))
    .map((r) => ({
      mem_id: r.mem_id,
      mem_nm: names.get(r.mem_id) ?? null,
      applied_at: toKstLabel(r.crt_at),
    }));

  const cancellations: AttendanceHistoryCancellation[] = histRows.map((h) => {
    const timing = classifyCancelTiming(h.evt_at, gthr.stt_at);
    return {
      mem_id: h.mem_id,
      mem_nm: names.get(h.mem_id) ?? null,
      applied_at: toKstLabel(h.reg_at),
      canceled_at: toKstLabel(h.evt_at) as string,
      timing,
      minutes_from_start: minutesFromStart(h.evt_at, gthr.stt_at),
      by: h.actor_cd === "admin" ? "admin" : "self",
      by_mem_nm: h.actor_mem_id ? (names.get(h.actor_mem_id) ?? null) : null,
      reason: h.reason_txt,
      rejoined: attending.has(h.mem_id),
    };
  });

  const afterStart = cancellations.filter((c) => c.timing === "after_start").length;
  return {
    gathering: {
      gthr_id: gthr.gthr_id,
      gthr_nm: gthr.gthr_nm,
      start_at: toKstLabel(gthr.stt_at),
      end_at: toKstLabel(gthr.end_at),
    },
    attendees,
    cancellations,
    summary: {
      attending_count: attendees.length,
      canceled_count: cancellations.length,
      canceled_before_start: cancellations.length - afterStart,
      canceled_after_start: afterStart,
    },
  };
}
