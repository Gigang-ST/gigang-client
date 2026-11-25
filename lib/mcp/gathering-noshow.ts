import type { SupabaseClient } from "@supabase/supabase-js";

import { dayjs } from "@/lib/dayjs";
import { runPromotionFollowups } from "@/lib/gathering/promotion-followup";
import {
  applyGatheringNoshow,
  listMemberNoshows,
  validateNoshowReason,
} from "@/lib/gathering/noshow";
import type { OperatorContext } from "@/lib/mcp/auth";
import { toKstLabel } from "@/lib/mcp/kst-datetime";
import { ToolDeniedError, ToolInputError } from "@/lib/mcp/queries";
import type { Database } from "@/lib/supabase/database.types";

/**
 * 기강 운영 MCP — 노쇼 도구 2종(#759).
 *
 * - `mark_gathering_noshow`(쓰기): 모임 참석자 한 명을 **참석에서 빼고 사유를 남긴다**(노쇼 처리).
 *   참석 행이 지워지므로 출석·PB클래스 집계는 빠진 참석을 세지 않는다. 처리자·시각·사유는 취소 이력에 남는다.
 * - `list_member_noshows`(읽기): 회원별 노쇼 횟수·내역(나중 정예·패널티 판단용).
 *
 * 둘 다 **admin 전용**이다(앱에서도 관리자 화면에만 있는 기능). 거부는 조회·쓰기 이전에 일어난다.
 * 알림은 **기본으로 보내지 않는다** — `notify=true` 일 때만 이 취소로 자리가 나서 생기는 대기열 승급·빈 자리 알림이 나간다
 * (노쇼 당사자에게는 어떤 경우에도 알림을 보내지 않는다 — 앱의 관리자 참석 취소와 같다).
 * `dry_run=true` 면 대상과 결과 미리보기만 돌려주고 아무것도 쓰지 않는다. 쓰기는 감사행(`mcp_audit_log`)을 남긴다.
 */

type Db = SupabaseClient<Database>;

export class MarkNoshowDeniedError extends ToolDeniedError {
  constructor(message = "노쇼 처리·조회는 운영진(admin)만 할 수 있습니다.") {
    super(message);
    this.name = "MarkNoshowDeniedError";
  }
}

export type MarkNoshowInput = {
  gathering_id: string;
  member_id?: string | null;
  member_name?: string | null;
  reason: string;
  dry_run?: boolean;
  notify?: boolean;
};

export type MarkNoshowResult =
  | {
      status: "ambiguous_member";
      note: string;
      candidates: { mem_id: string; mem_nm: string }[];
    }
  | {
      status: "dry_run" | "removed";
      gathering: { gthr_id: string; gthr_nm: string; start_at: string | null; started: boolean };
      member: { mem_id: string; mem_nm: string | null; applied_at: string | null };
      reason: string;
      /** 이 처리 전 이 회원의 노쇼 횟수(누적). */
      noshow_count_before: number;
      /** 이 처리 뒤 횟수 — dry_run 이면 처리했을 때의 값. */
      noshow_count_after: number;
      warnings: string[];
      notify: boolean;
      /** 이 취소로 대기에서 참석이 된 회원 수. dry_run 이면 0. */
      promoted_cnt: number;
      audit_id: string | null;
    };

const normalizeName = (s: string) => s.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();

type AttendeeRow = { mem_id: string; crt_at: string; mem_mst: { mem_nm: string } | { mem_nm: string }[] | null };

export async function markGatheringNoshowViaMcp(
  supabase: Db,
  ctx: OperatorContext,
  input: MarkNoshowInput,
): Promise<MarkNoshowResult> {
  if (!ctx.is_admin) throw new MarkNoshowDeniedError();

  const memberId = input.member_id?.trim() || null;
  const memberName = input.member_name?.trim() || null;
  if (!memberId && !memberName) {
    throw new ToolInputError("노쇼 처리할 회원을 member_id 또는 member_name 으로 주세요.");
  }

  const reasonCheck = validateNoshowReason(input.reason);
  if (!reasonCheck.ok) throw new ToolInputError(reasonCheck.message);

  const { data: gthr } = await supabase
    .from("gthr_mst")
    .select("gthr_id, gthr_nm, stt_at")
    .eq("gthr_id", input.gathering_id)
    .eq("team_id", ctx.team_id)
    .eq("del_yn", false)
    .maybeSingle();
  if (!gthr) throw new ToolInputError("모임을 찾을 수 없습니다.");

  // 대상은 **이 모임의 현재 참석자** 중에서만 찾는다 — 참석 중이 아니면 뺄 것이 없다.
  const { data: relRaw } = await supabase
    .from("gthr_attd_rel")
    .select("mem_id, crt_at, mem_mst(mem_nm)")
    .eq("gthr_id", input.gathering_id);
  const attendees = ((relRaw ?? []) as unknown as AttendeeRow[]).map((r) => {
    const m = Array.isArray(r.mem_mst) ? r.mem_mst[0] : r.mem_mst;
    return { mem_id: r.mem_id, crt_at: r.crt_at, mem_nm: m?.mem_nm ?? null };
  });

  let target: (typeof attendees)[number] | undefined;
  if (memberId) {
    target = attendees.find((a) => a.mem_id === memberId);
    if (!target) throw new ToolInputError("이 모임에 참석 중인 회원이 아닙니다(이미 취소했거나 참석한 적이 없습니다).");
  } else {
    const key = normalizeName(memberName as string);
    const matches = attendees.filter((a) => a.mem_nm && normalizeName(a.mem_nm) === key);
    if (matches.length === 0) {
      throw new ToolInputError(`이 모임 참석자 중 이름이 '${memberName}' 인 회원이 없습니다.`);
    }
    if (matches.length > 1) {
      return {
        status: "ambiguous_member",
        note: "같은 이름의 참석자가 여럿입니다. 처리하지 않았습니다. candidates 에서 member_id 를 골라 다시 부르세요.",
        candidates: matches.map((m) => ({ mem_id: m.mem_id, mem_nm: m.mem_nm as string })),
      };
    }
    target = matches[0];
  }

  const prior = (await listMemberNoshows(supabase as unknown as SupabaseClient, ctx.team_id, { memId: target.mem_id }))[0];
  const before = prior?.count ?? 0;

  const started = !dayjs(gthr.stt_at).isAfter(dayjs());
  const warnings: string[] = [];
  if (!started) {
    warnings.push("모임이 아직 시작 전입니다. 노쇼는 시작 뒤에 안 온 사람에게 쓰는 처리예요 — 미리 빼는 거라면 앱 관리자 화면의 참석 취소를 쓰세요.");
  }

  const base = {
    gathering: {
      gthr_id: gthr.gthr_id,
      gthr_nm: gthr.gthr_nm,
      start_at: toKstLabel(gthr.stt_at),
      started,
    },
    member: { mem_id: target.mem_id, mem_nm: target.mem_nm, applied_at: toKstLabel(target.crt_at) },
    reason: reasonCheck.value,
    noshow_count_before: before,
    warnings,
    notify: input.notify === true,
  };

  if (input.dry_run) {
    return { status: "dry_run", ...base, noshow_count_after: before + 1, promoted_cnt: 0, audit_id: null };
  }

  const untyped = supabase as unknown as SupabaseClient;
  const result = await applyGatheringNoshow(untyped, {
    gthrId: gthr.gthr_id,
    memId: target.mem_id,
    teamId: ctx.team_id,
    actorMemId: ctx.mem_id,
    reason: reasonCheck.value,
  });
  if (!result.ok) throw new ToolInputError(result.message);

  // 알림은 notify 일 때만 — 이 취소로 대기열에서 올라온 사람·빈 자리 알림. 당사자(노쇼)에겐 안 보낸다.
  if (input.notify && (result.promoted.length > 0 || result.notifyOpenSeat)) {
    try {
      await runPromotionFollowups(untyped as never, {
        teamId: ctx.team_id,
        gthrId: gthr.gthr_id,
        gthrNm: gthr.gthr_nm,
        cause: "cancel",
        promoted: result.promoted,
        notifyOpenSeat: result.notifyOpenSeat,
      });
    } catch (e) {
      console.error("[mcp] mark_gathering_noshow 승급 알림 실패", e);
    }
  }

  const auditId = crypto.randomUUID();
  const { error: auditErr } = await supabase.from("mcp_audit_log").insert({
    audit_id: auditId,
    actor_mem_id: ctx.mem_id,
    team_id: ctx.team_id,
    tool_nm: "mark_gathering_noshow",
    params_json: {
      gthr_id: gthr.gthr_id,
      mem_id: target.mem_id,
      reason: reasonCheck.value,
      notify: input.notify === true,
      promoted_cnt: result.promoted.length,
    },
    result_summary: `mark_gathering_noshow ok: gthr_id=${gthr.gthr_id} mem_id=${target.mem_id}`,
  });
  if (auditErr) console.error("[mcp] mark_gathering_noshow 감사 기록 실패", auditErr.message);

  return {
    status: "removed",
    ...base,
    noshow_count_after: before + 1,
    promoted_cnt: result.promoted.length,
    audit_id: auditId,
  };
}

export type MemberNoshowsResult = {
  members: {
    mem_id: string;
    mem_nm: string | null;
    noshow_count: number;
    entries: { gthr_id: string; gthr_nm: string; gathering_start_at: string | null; processed_at: string | null; reason: string | null; by_mem_nm: string | null }[];
  }[];
};

export async function listMemberNoshowsViaMcp(
  supabase: Db,
  ctx: OperatorContext,
  input: { member_id?: string | null },
): Promise<MemberNoshowsResult> {
  if (!ctx.is_admin) throw new MarkNoshowDeniedError();

  const list = await listMemberNoshows(supabase as unknown as SupabaseClient, ctx.team_id, {
    memId: input.member_id?.trim() || undefined,
  });

  const ids = [...new Set(list.flatMap((m) => [m.mem_id, ...m.entries.flatMap((e) => (e.actor_mem_id ? [e.actor_mem_id] : []))]))];
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const { data } = await supabase.from("mem_mst").select("mem_id, mem_nm").in("mem_id", ids);
    for (const m of (data ?? []) as { mem_id: string; mem_nm: string }[]) names.set(m.mem_id, m.mem_nm);
  }

  return {
    members: list.map((m) => ({
      mem_id: m.mem_id,
      mem_nm: names.get(m.mem_id) ?? null,
      noshow_count: m.count,
      entries: m.entries.map((e) => ({
        gthr_id: e.gthr_id,
        gthr_nm: e.gthr_nm,
        gathering_start_at: toKstLabel(e.stt_at),
        processed_at: toKstLabel(e.evt_at),
        reason: e.reason,
        by_mem_nm: e.actor_mem_id ? (names.get(e.actor_mem_id) ?? null) : null,
      })),
    })),
  };
}
