import type { SupabaseClient } from "@supabase/supabase-js";

import { validateCancelReason } from "@/lib/gathering/cancel-reason";
import { parseCancelResult } from "@/lib/gathering/cancel-result";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

/**
 * 모임 노쇼 처리 코어(#759) — 관리자 서버 액션과 운영 MCP(`mark_gathering_noshow`)가 공유한다.
 *
 * 노쇼 = 참석을 눌러 놓고 오지 않은 사람을 운영진이 **참석에서 빼고 사유를 남긴** 것.
 * 새 테이블 없이 취소 이력(`gthr_attd_hist`)의 `noshow_yn` 표시로 남긴다 — 누가(`actor_mem_id`)·언제(`evt_at`)·
 * 어떤 사유(`reason_txt`)로 뺐는지는 그 테이블이 이미 든다. 참석 행(`gthr_attd_rel`)이 지워지므로 출석·PB클래스
 * 집계(참석 행을 센다)는 빠진 참석을 세지 않는다.
 *
 * 클라이언트를 주입받는다(액션=관리자 클라이언트, MCP=서비스 클라이언트). `next/*` 부수효과(캐시 무효화·
 * 승급 알림)는 호출부가 맡는다.
 */

/** 화면·도구가 사유 칸에 기본으로 채워 주는 말. */
export const NOSHOW_DEFAULT_REASON = "노쇼";

export type NoshowResult =
  | { ok: true; promoted: string[]; notifyOpenSeat: boolean }
  | { ok: false; code: "reason_required" | "reason_too_long" | "not_found" | "not_attending" | "failed"; message: string };

/** 사유 필수 검증 — 빈 값은 거부(취소 사유와 달리 선택이 아니다). */
export function validateNoshowReason(reason: string | null | undefined):
  | { ok: true; value: string }
  | { ok: false; code: "reason_required" | "reason_too_long"; message: string } {
  const checked = validateCancelReason(reason);
  if (!checked.ok) return { ok: false, code: "reason_too_long", message: checked.message };
  if (!checked.value) return { ok: false, code: "reason_required", message: "노쇼 처리에는 사유가 필요해요." };
  return { ok: true, value: checked.value };
}

/** `noshow_gthr_attendance` RPC 호출(service_role 전용 — 타입 미생성이라 느슨한 클라이언트). */
export async function applyGatheringNoshow(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  untyped: SupabaseClient<any, any, any>,
  input: { gthrId: string; memId: string; teamId: string; actorMemId: string; reason: string },
): Promise<NoshowResult> {
  const checked = validateNoshowReason(input.reason);
  if (!checked.ok) return checked;

  const { data, error } = await untyped.rpc("noshow_gthr_attendance", {
    p_gthr_id: input.gthrId,
    p_mem_id: input.memId,
    p_team_id: input.teamId,
    p_actor_mem_id: input.actorMemId,
    p_reason: checked.value,
  });
  if (error) return { ok: false, code: "failed", message: "노쇼 처리에 실패했어요." };

  const status = (data as { status?: string } | null)?.status;
  if (status === "not_found") return { ok: false, code: "not_found", message: "모임을 찾을 수 없어요." };
  if (status === "not_attending" || status === "no_application" || status === "not_active") {
    return { ok: false, code: "not_attending", message: "이 모임에 참석 중인 회원이 아니에요." };
  }
  if (status !== "ok") return { ok: false, code: "failed", message: "노쇼 처리에 실패했어요." };

  const { promoted, notifyOpenSeat } = parseCancelResult(data);
  return { ok: true, promoted, notifyOpenSeat };
}

export type NoshowEntry = {
  gthr_id: string;
  gthr_nm: string;
  /** 모임 시작 시각(UTC ISO). */
  stt_at: string;
  /** 처리 시각(UTC ISO). */
  evt_at: string;
  reason: string | null;
  actor_mem_id: string | null;
};

export type MemberNoshow = {
  mem_id: string;
  count: number;
  /** 최근 것부터. */
  entries: NoshowEntry[];
};

type NoshowHistRow = {
  hist_id: string;
  mem_id: string;
  evt_at: string;
  reason_txt: string | null;
  actor_mem_id: string | null;
  gthr_mst: { gthr_id: string; gthr_nm: string; stt_at: string; team_id: string } | { gthr_id: string; gthr_nm: string; stt_at: string; team_id: string }[] | null;
};

/**
 * 팀의 회원별 노쇼 횟수·내역(나중 정예·패널티 판단용). 횟수 많은 순.
 * 팀 전체를 읽는 조회라 `fetchAllRows` 로 끝까지 읽는다(PostgREST 1000행 절단 방지).
 */
export async function listMemberNoshows(
  db: SupabaseClient,
  teamId: string,
  opts: { memId?: string } = {},
): Promise<MemberNoshow[]> {
  const rows = await fetchAllRows<NoshowHistRow>(
    () => {
      let q = db
        .from("gthr_attd_hist")
        .select("hist_id, mem_id, evt_at, reason_txt, actor_mem_id, gthr_mst!inner(gthr_id, gthr_nm, stt_at, team_id)")
        .eq("noshow_yn", true)
        .eq("gthr_mst.team_id", teamId);
      if (opts.memId) q = q.eq("mem_id", opts.memId);
      return q.order("hist_id", { ascending: true }) as never;
    },
    { label: "gthr_attd_hist:noshow" },
  );

  const byMem = new Map<string, MemberNoshow>();
  for (const r of rows) {
    const g = Array.isArray(r.gthr_mst) ? r.gthr_mst[0] : r.gthr_mst;
    if (!g) continue;
    const cur = byMem.get(r.mem_id) ?? { mem_id: r.mem_id, count: 0, entries: [] };
    cur.count += 1;
    cur.entries.push({
      gthr_id: g.gthr_id,
      gthr_nm: g.gthr_nm,
      stt_at: g.stt_at,
      evt_at: r.evt_at,
      reason: r.reason_txt,
      actor_mem_id: r.actor_mem_id,
    });
    byMem.set(r.mem_id, cur);
  }
  const list = [...byMem.values()];
  for (const m of list) m.entries.sort((a, b) => b.evt_at.localeCompare(a.evt_at));
  return list.sort((a, b) => b.count - a.count || a.mem_id.localeCompare(b.mem_id));
}
