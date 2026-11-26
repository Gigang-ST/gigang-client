import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { dayjs } from "@/lib/dayjs";

/**
 * 재가입·활동 재개 요청(`mem_reactv_req`, #767) — 저장·처리·조회 코어.
 *
 * 요청은 알림(`reactivate_req`)과 **같이** 남는다. 알림은 놓치거나 지우면 사라지지만 이 행은 남아
 * 회원관리 상단 목록의 근거가 된다. 운영진이 활성으로 바꾸면 같은 행을 `done` 으로 닫고
 * 운영진들의 알림도 읽음 처리한다("처리됨").
 *
 * 테이블이 생성 타입(database.types.ts)에 아직 없어 클라이언트를 느슨하게 받는다.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>;

export type ReactivationRequest = {
  reactvReqId: string;
  memId: string;
  /** 요청할 때의 상태 — left 면 재가입 요청, inactive 면 활동 재개 문의 */
  reqMemStCd: "left" | "inactive";
  crtAt: string;
};

/**
 * 대기 중인 요청을 만든다(회원당 한 건). 이미 대기 중이면 새로 만들지 않고 `created: false`.
 * 부분 유니크(uk_mem_reactv_req_pending)가 동시 요청의 중복을 막는다 — 충돌(23505)은 "이미 있음"이다.
 */
export async function createReactivationRequest(
  db: Db,
  input: { teamId: string; memId: string; memStCd: "left" | "inactive" },
): Promise<{ created: boolean }> {
  const { error } = await db.from("mem_reactv_req").insert({
    team_id: input.teamId,
    mem_id: input.memId,
    req_mem_st_cd: input.memStCd,
  });
  if (!error) return { created: true };
  if (error.code === "23505") return { created: false };
  throw error;
}

/** 이 팀의 대기 중 요청 — 오래된 순(먼저 온 사람부터 처리) */
export async function listPendingReactivationRequests(
  db: Db,
  teamId: string,
): Promise<ReactivationRequest[]> {
  const { data, error } = await db
    .from("mem_reactv_req")
    .select("reactv_req_id, mem_id, req_mem_st_cd, crt_at")
    .eq("team_id", teamId)
    .eq("req_stts_cd", "pending")
    .order("crt_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    reactvReqId: r.reactv_req_id as string,
    memId: r.mem_id as string,
    reqMemStCd: r.req_mem_st_cd as "left" | "inactive",
    crtAt: r.crt_at as string,
  }));
}

/**
 * 활성으로 바뀐 회원들의 대기 요청을 「처리됨」으로 닫고, 그 요청의 운영진 알림을 읽음 처리한다.
 * 활성화 자체는 이미 끝난 뒤라 여기서 실패해도 던지지 않는다(로그만) — 요청 목록이 하루 어긋나는 쪽이
 * 활성화를 되돌리는 쪽보다 낫다.
 */
export async function resolveReactivationRequests(
  db: Db,
  input: { teamId: string; memIds: string[]; processedBy: string },
): Promise<void> {
  if (!input.memIds.length) return;
  try {
    const { error } = await db
      .from("mem_reactv_req")
      .update({
        req_stts_cd: "done",
        prc_at: dayjs().toISOString(),
        prc_mem_id: input.processedBy,
      })
      .eq("team_id", input.teamId)
      .in("mem_id", input.memIds)
      .eq("req_stts_cd", "pending");
    if (error) throw error;

    // 운영진 알림의 ref_id 는 요청자의 team_mem_id — 활성 전환은 team_mem_id 를 안 바꾼다(PK 불변)
    const { data: rels } = await db
      .from("team_mem_rel")
      .select("team_mem_id")
      .eq("team_id", input.teamId)
      .eq("vers", 0)
      .in("mem_id", input.memIds);
    const refIds = (rels ?? []).map((r) => r.team_mem_id as string);
    if (refIds.length) {
      const { error: notiErr } = await db
        .from("noti_mst")
        .update({ read_yn: true })
        .eq("team_id", input.teamId)
        .eq("noti_type_enm", "reactivate_req")
        .in("ref_id", refIds)
        .eq("read_yn", false);
      if (notiErr) throw notiErr;
    }
  } catch (e) {
    console.error("[reactivate_req] 요청 처리 표시 실패", e);
  }
}
