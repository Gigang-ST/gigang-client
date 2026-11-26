import type { SupabaseClient } from "@supabase/supabase-js";

import { dayjs, formatKST } from "@/lib/dayjs";
import { fetchKakaoRoomMembers } from "@/lib/kakao/notify";
import type { OperatorContext } from "@/lib/mcp/auth";
import { ToolDeniedError } from "@/lib/mcp/queries";
import type { Database } from "@/lib/supabase/database.types";

/**
 * 기강 운영 MCP — 읽기 도구 `list_kakao_room_members`(#749). 단톡방 참여자와 사이트 활성 회원을
 * **이름으로** 맞춰 누가 단톡에 있고 없는지 나눠 준다.
 *
 * - **admin 전용.** 참여자 이름은 개인정보다. 거부는 허브 호출 이전에 일어난다.
 * - **읽기 전용.** 허브에도 DB 에도 쓰지 않는다. 감사행도 만들지 않는다(다른 읽기 도구와 같다) —
 *   로그에는 건수만 남는다(`fetchKakaoRoomMembers`).
 * - **못 맞춘 건 숨기지 않는다.** 카톡 이름과 사이트 실명이 다르면 이름으로는 맞출 수 없다 — 그 사람은
 *   `not_in_room`(사이트 쪽)과 `room_only`(단톡 쪽)에 **둘 다** 나타나 사람이 눈으로 짝지을 수 있다.
 *   동명이인은 한쪽으로 단정하지 않고 `ambiguous` 로 뺀다. 이름을 모르는 참여자는 `room_unnamed_count`.
 * - **목록 완전성을 같이 준다**(`completeness`). 오픈채팅은 말하거나 태그된 적 없는 사람을 허브가 모를 수
 *   있어, `known < total` 이면 `not_in_room` 은 "아직 허브가 못 본 사람"일 수도 있다.
 */

type Db = SupabaseClient<Database>;

export class ListKakaoRoomMembersDeniedError extends ToolDeniedError {
  constructor(message = "단톡방 참여자 대조는 운영진(admin)만 조회할 수 있습니다.") {
    super(message);
    this.name = "ListKakaoRoomMembersDeniedError";
  }
}

export type SiteMemberSeed = { mem_id: string; mem_nm: string; join_dt: string | null };

export type RoomMatchMember = SiteMemberSeed;
export type RoomAmbiguous = {
  /** 맞대어 본 이름(사이트 표기). */
  name: string;
  /** 사이트에서 이 이름인 활성 회원 수. */
  site_count: number;
  /** 단톡방에서 이 이름인 참여자 수. */
  room_count: number;
  /** 사이트 쪽 해당 회원들. */
  site_members: RoomMatchMember[];
};

export type RoomReconciliation = {
  in_room: RoomMatchMember[];
  not_in_room: RoomMatchMember[];
  ambiguous: RoomAmbiguous[];
  /** 사이트 회원 이름과 안 맞는 단톡 참여자 이름(같은 이름이 둘이면 두 번 나온다). */
  room_only: string[];
  /** 허브가 이름을 모르는 참여자 수(말하거나 태그된 적이 없다). */
  room_unnamed_count: number;
};

/** 이름 비교용 정규화 — 유니코드 정규화·공백 접기·대소문자 무시. */
export function normalizeName(name: string): string {
  return name.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

/** 사이트 활성 회원과 단톡 참여자 이름을 맞댄다(순수 함수). */
export function reconcileRoomMembers(
  site: SiteMemberSeed[],
  roomNames: (string | null)[],
): RoomReconciliation {
  const siteByKey = new Map<string, SiteMemberSeed[]>();
  for (const m of site) {
    const key = normalizeName(m.mem_nm);
    if (!key) continue;
    siteByKey.set(key, [...(siteByKey.get(key) ?? []), m]);
  }
  const roomCount = new Map<string, number>();
  const roomDisplay = new Map<string, string[]>();
  let unnamed = 0;
  for (const raw of roomNames) {
    const key = raw ? normalizeName(raw) : "";
    if (!key) {
      unnamed += 1;
      continue;
    }
    roomCount.set(key, (roomCount.get(key) ?? 0) + 1);
    roomDisplay.set(key, [...(roomDisplay.get(key) ?? []), raw!.trim()]);
  }

  const out: RoomReconciliation = {
    in_room: [],
    not_in_room: [],
    ambiguous: [],
    room_only: [],
    room_unnamed_count: unnamed,
  };
  const ambiguousDone = new Set<string>();
  for (const m of site) {
    const key = normalizeName(m.mem_nm);
    const rc = key ? (roomCount.get(key) ?? 0) : 0;
    const group = key ? (siteByKey.get(key) ?? []) : [];
    if (rc === 0) {
      out.not_in_room.push(m);
    } else if (group.length === 1 && rc === 1) {
      out.in_room.push(m);
    } else if (!ambiguousDone.has(key)) {
      ambiguousDone.add(key);
      out.ambiguous.push({
        name: m.mem_nm,
        site_count: group.length,
        room_count: rc,
        site_members: group,
      });
    }
  }
  for (const [key, names] of roomDisplay) {
    if (!siteByKey.has(key)) out.room_only.push(...names);
  }
  return out;
}

async function fetchActiveSiteMembers(supabase: Db, teamId: string): Promise<SiteMemberSeed[]> {
  const { data, error } = await supabase
    .from("team_mem_rel")
    .select("mem_id, join_dt, mem_mst!inner(mem_nm)")
    .eq("team_id", teamId)
    .eq("del_yn", false)
    .eq("vers", 0)
    .eq("mem_st_cd", "active")
    .eq("mem_mst.del_yn", false);
  if (error) throw error;
  return (data ?? []).map((r) => {
    const mem = Array.isArray(r.mem_mst) ? r.mem_mst[0] : r.mem_mst;
    return {
      mem_id: r.mem_id as string,
      mem_nm: (mem as { mem_nm: string } | null)?.mem_nm ?? "",
      join_dt: (r.join_dt as string | null) ?? null,
    };
  });
}

export type ListKakaoRoomMembersResult =
  | {
      status: "ok";
      completeness: {
        /** 허브가 아는 참여자 수. */
        known: number;
        /** 카톡이 알려 준 전체 인원(모르면 null). */
        total: number | null;
        open_chat: boolean;
        /** 마지막 전체 동기화 시각(KST). 아직 없으면 null. */
        synced_at: string | null;
        /** `known < total` — 허브가 못 본 참여자가 있을 수 있다. 이때 `not_in_room` 은 확정이 아니다. */
        incomplete: boolean;
      };
      site_member_count: number;
      counts: Record<"in_room" | "not_in_room" | "ambiguous" | "room_only", number>;
      in_room: RoomMatchMember[];
      not_in_room: RoomMatchMember[];
      ambiguous: RoomAmbiguous[];
      room_only: string[];
      room_unnamed_count: number;
    }
  | {
      /** `skipped`: 노티봇 미설정 환경이거나 이 팀에 방이 없다. `failed`: 허브가 거절했거나 닿지 않았다. */
      status: "skipped" | "failed";
      skipped_reason: "disabled" | "no_room" | null;
      failure: { name: string; code: string | null; http_status: number | null; message: string; retryable: boolean } | null;
    };

/**
 * `list_kakao_room_members` 본체. admin 게이트 → 허브 참여자 조회 → 사이트 활성 회원과 대조.
 *
 * @throws ListKakaoRoomMembersDeniedError 비-admin — 허브도 DB 도 부르지 않는다.
 */
export async function listKakaoRoomMembers(
  supabase: Db,
  ctx: OperatorContext,
): Promise<ListKakaoRoomMembersResult> {
  if (!ctx.is_admin) throw new ListKakaoRoomMembersDeniedError();

  const room = await fetchKakaoRoomMembers(ctx.team_id);
  if (!room.ok) {
    return {
      status: room.skipped ? "skipped" : "failed",
      skipped_reason: room.skipped ?? null,
      failure: room.failure
        ? {
            name: room.failure.name,
            code: room.failure.code ?? null,
            http_status: room.failure.status ?? null,
            message: room.failure.message,
            retryable: room.failure.retryable,
          }
        : null,
    };
  }

  const site = await fetchActiveSiteMembers(supabase, ctx.team_id);
  const rec = reconcileRoomMembers(site, room.names);
  console.info("[mcp] list_kakao_room_members", {
    team_id: ctx.team_id,
    site: site.length,
    room_known: room.known,
    in_room: rec.in_room.length,
    not_in_room: rec.not_in_room.length,
    ambiguous: rec.ambiguous.length,
    room_only: rec.room_only.length,
  });

  return {
    status: "ok",
    completeness: {
      known: room.known,
      total: room.total,
      open_chat: room.openChat,
      synced_at:
        room.syncedAt === null
          ? null
          : formatKST(dayjs(room.syncedAt).toISOString(), "YYYY-MM-DD HH:mm") || null,
      incomplete: room.total !== null && room.known < room.total,
    },
    site_member_count: site.length,
    counts: {
      in_room: rec.in_room.length,
      not_in_room: rec.not_in_room.length,
      ambiguous: rec.ambiguous.length,
      room_only: rec.room_only.length,
    },
    in_room: rec.in_room,
    not_in_room: rec.not_in_room,
    ambiguous: rec.ambiguous,
    room_only: rec.room_only,
    room_unnamed_count: rec.room_unnamed_count,
  };
}
