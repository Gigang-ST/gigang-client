import type { SupabaseClient } from "@supabase/supabase-js";

import { dayjs, todayKST } from "@/lib/dayjs";
import { decryptApiKey, encryptApiKey } from "@/lib/intervals/crypto";
import {
  IntervalsAuthError,
  fetchIntervalsActivities,
  type IcuActivitySummary,
} from "@/lib/intervals/client";
import type { ActivitySummaryRow } from "@/lib/intervals/summary";

/**
 * 회원별 intervals.icu 연결(#760) 도메인 코어 — **클라이언트 주입식**이다.
 * 서버 액션(연결·새로고침·해제)·일 배치·운영 MCP 가 같이 쓴다. `next/*` 를 모른다.
 *
 * 규칙(이슈 #760 결정):
 * - 화면을 열 때마다 외부를 부르지 않는다 — 부르는 건 **연결 · 수동 새로고침 · 일 배치** 셋뿐이다.
 * - 저장은 활동 요약만(날짜·종목·거리·시간·평균 속도). 경로·심박 원본은 받지 않는다.
 * - API 키는 암호화해 저장하고, 이 모듈의 어떤 반환값·에러 메시지에도 싣지 않는다.
 * - 모든 쓰기는 service_role 이라 RLS 를 건너뛴다 — 회원·팀 경계는 여기서 `mem_id`·`team_id` 로 지킨다.
 */

// 연결 테이블은 아직 생성 타입(database.types.ts)에 없어 클라이언트를 느슨하게 받는다 — createUntypedAdminClient 와 같은 이유.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>;

/** 동기화가 훑는 기간(일). 연결 직후에도 같은 범위를 받는다. */
export const SYNC_WINDOW_DAYS = 60;
/** 수동 새로고침 최소 간격(분) — 연타로 외부 API 를 두드리지 않게. */
export const MANUAL_REFRESH_MIN_MINUTES = 10;

export type ConnectionStatusCd = "ok" | "auth_failed" | "error";

export type IntervalsStatus =
  | { connected: false }
  | {
      connected: true;
      statusCd: ConnectionStatusCd;
      lastSyncAt: string | null;
      lastOkAt: string | null;
    };

function windowRange() {
  const newest = todayKST();
  const oldest = dayjs(newest).subtract(SYNC_WINDOW_DAYS, "day").format("YYYY-MM-DD");
  return { oldest, newest };
}

const ACT_COLS = "icu_act_id, act_dt, sprt_type_nm, dst_m, mov_sec, avg_spd_mps";

/** 받은 요약을 저장하고, 기간 안에서 intervals.icu 에서 사라진 활동은 지운다. 새로 생긴 건수를 돌려준다. */
async function storeActivities(
  db: Db,
  memId: string,
  teamId: string,
  range: { oldest: string; newest: string },
  fetched: IcuActivitySummary[],
): Promise<number> {
  const { data: existing, error: exErr } = await db
    .from("mem_icu_act_hist")
    .select("icu_act_id")
    .eq("mem_id", memId)
    .gte("act_dt", range.oldest)
    .lte("act_dt", range.newest);
  if (exErr) throw new Error("활동 요약 조회에 실패했습니다.");
  const existingIds = new Set((existing ?? []).map((r: { icu_act_id: string }) => r.icu_act_id));

  if (fetched.length > 0) {
    const { error } = await db.from("mem_icu_act_hist").upsert(
      fetched.map((a) => ({ ...a, mem_id: memId, team_id: teamId })),
      { onConflict: "mem_id,icu_act_id" },
    );
    if (error) throw new Error("활동 요약 저장에 실패했습니다.");
  }

  const fetchedIds = new Set(fetched.map((a) => a.icu_act_id));
  const stale = [...existingIds].filter((id) => !fetchedIds.has(id));
  if (stale.length > 0) {
    await db.from("mem_icu_act_hist").delete().eq("mem_id", memId).in("icu_act_id", stale);
  }
  return fetched.filter((a) => !existingIds.has(a.icu_act_id)).length;
}

export type ConnectResult =
  | { ok: true; added: number }
  | { ok: false; message: string };

/** 키를 확인하고(받아 보기) 암호화해 저장한 뒤 첫 동기화까지 한다. */
export async function connectIntervalsCore(
  db: Db,
  input: { memId: string; teamId: string; apiKey: string; secret: string },
  fetchImpl?: typeof fetch,
): Promise<ConnectResult> {
  const range = windowRange();
  let fetched: IcuActivitySummary[];
  try {
    fetched = await fetchIntervalsActivities(input.apiKey, range, fetchImpl);
  } catch (e) {
    if (e instanceof IntervalsAuthError) {
      return { ok: false, message: "intervals.icu 가 이 API 키를 받아주지 않았어요. 키를 다시 확인해 주세요." };
    }
    return { ok: false, message: "intervals.icu 에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요." };
  }

  const now = dayjs().toISOString();
  const { error } = await db.from("mem_icu_cnn_rel").upsert(
    {
      mem_id: input.memId,
      team_id: input.teamId,
      api_key_enc: encryptApiKey(input.apiKey, input.secret),
      cnn_stts_cd: "ok",
      last_sync_at: now,
      last_ok_at: now,
    },
    { onConflict: "mem_id" },
  );
  if (error) return { ok: false, message: "연결을 저장하지 못했어요." };

  try {
    const added = await storeActivities(db, input.memId, input.teamId, range, fetched);
    return { ok: true, added };
  } catch {
    return { ok: false, message: "연결은 됐지만 활동을 저장하지 못했어요. 잠시 뒤 새로고침해 주세요." };
  }
}

export type SyncResult =
  | { ok: true; added: number }
  | { ok: false; reason: "no_connection" | "auth_failed" | "error"; message: string };

/** 연결된 회원 한 명을 동기화한다(수동 새로고침·일 배치 공용). 키가 거부되면 상태를 `auth_failed` 로 바꾼다. */
export async function syncIntervalsForMember(
  db: Db,
  input: { memId: string; secret: string },
  fetchImpl?: typeof fetch,
): Promise<SyncResult> {
  const { data: conn } = await db
    .from("mem_icu_cnn_rel")
    .select("team_id, api_key_enc")
    .eq("mem_id", input.memId)
    .maybeSingle();
  if (!conn) return { ok: false, reason: "no_connection", message: "연결된 intervals.icu 가 없어요." };

  const markStatus = async (cnn_stts_cd: ConnectionStatusCd, ok: boolean) => {
    const now = dayjs().toISOString();
    await db
      .from("mem_icu_cnn_rel")
      .update({ cnn_stts_cd, last_sync_at: now, ...(ok ? { last_ok_at: now } : {}) })
      .eq("mem_id", input.memId);
  };

  let apiKey: string;
  try {
    apiKey = decryptApiKey(conn.api_key_enc as string, input.secret);
  } catch {
    await markStatus("auth_failed", false);
    return { ok: false, reason: "auth_failed", message: "저장된 키를 읽지 못했어요. 다시 연결해 주세요." };
  }

  const range = windowRange();
  let fetched: IcuActivitySummary[];
  try {
    fetched = await fetchIntervalsActivities(apiKey, range, fetchImpl);
  } catch (e) {
    if (e instanceof IntervalsAuthError) {
      await markStatus("auth_failed", false);
      return { ok: false, reason: "auth_failed", message: "intervals.icu 가 키를 받아주지 않아요. 다시 연결해 주세요." };
    }
    await markStatus("error", false);
    return { ok: false, reason: "error", message: "intervals.icu 에서 가져오지 못했어요. 잠시 뒤 다시 시도해 주세요." };
  }

  try {
    const added = await storeActivities(db, input.memId, conn.team_id as string, range, fetched);
    await markStatus("ok", true);
    return { ok: true, added };
  } catch {
    await markStatus("error", false);
    return { ok: false, reason: "error", message: "활동을 저장하지 못했어요." };
  }
}

/** 연결 해제 — 암호화된 키와 가져온 활동 요약을 함께 지운다. */
export async function disconnectIntervalsCore(db: Db, memId: string): Promise<{ ok: boolean }> {
  const a = await db.from("mem_icu_act_hist").delete().eq("mem_id", memId);
  const b = await db.from("mem_icu_cnn_rel").delete().eq("mem_id", memId);
  return { ok: !a.error && !b.error };
}

/** 연결 상태 — 키·암호문은 읽지도 않는다. */
export async function getIntervalsStatus(db: Db, memId: string): Promise<IntervalsStatus> {
  const { data } = await db
    .from("mem_icu_cnn_rel")
    .select("cnn_stts_cd, last_sync_at, last_ok_at")
    .eq("mem_id", memId)
    .maybeSingle();
  if (!data) return { connected: false };
  return {
    connected: true,
    statusCd: data.cnn_stts_cd as ConnectionStatusCd,
    lastSyncAt: (data.last_sync_at as string | null) ?? null,
    lastOkAt: (data.last_ok_at as string | null) ?? null,
  };
}

/** 최근 활동 요약(최신 날짜순). 한 사람 몫이고 `limit` 로 자른다. */
export async function listRecentActivities(
  db: Db,
  memId: string,
  opts: { limit: number; from?: string; to?: string },
): Promise<ActivitySummaryRow[]> {
  let q = db.from("mem_icu_act_hist").select(ACT_COLS).eq("mem_id", memId);
  if (opts.from) q = q.gte("act_dt", opts.from);
  if (opts.to) q = q.lte("act_dt", opts.to);
  const { data } = await q.order("act_dt", { ascending: false }).order("icu_act_id", { ascending: false }).limit(opts.limit);
  return ((data ?? []) as Record<string, unknown>[]).map(toRow);
}

export function toRow(r: Record<string, unknown>): ActivitySummaryRow {
  const n = (v: unknown) => (v == null ? null : Number(v));
  return {
    icu_act_id: r.icu_act_id as string,
    act_dt: r.act_dt as string,
    sprt_type_nm: r.sprt_type_nm as string,
    dst_m: n(r.dst_m),
    mov_sec: n(r.mov_sec),
    avg_spd_mps: n(r.avg_spd_mps),
  };
}
