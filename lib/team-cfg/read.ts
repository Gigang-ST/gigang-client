import "server-only";

import { createUntypedAdminClient } from "@/lib/supabase/admin";

import { resolveTeamCfgValue, type TeamCfgCd, type TeamCfgValue } from "./registry";

/**
 * 팀 설정 읽기.
 *
 * **Vercel 캐시(`unstable_cache` 등)를 쓰지 않는다.** 그건 읽을 때마다 계량되는 항목이라, 화면마다 설정을
 * 읽으면 요청 수에 비례해 사용량이 쌓인다(2026-10 계정 정지와 같은 유형 — AGENTS.md §Vercel 사용량).
 * 대신 **서버 인스턴스 메모리에 팀별로 1분** 들고 있다. Supabase 조회도 인스턴스당 팀별 1분에 한 번이라
 * 무시할 수준이다. 대가: 값을 바꾸면 모든 화면에 반영되기까지 최대 1분 걸린다(유저 확인 2026-11-09).
 */

const TTL_MS = 60_000;

type Snapshot = { at: number; values: Map<string, unknown> };
const cache = new Map<string, Snapshot>();
const inflight = new Map<string, Promise<Snapshot>>();

async function load(teamId: string): Promise<Snapshot> {
  const db = createUntypedAdminClient();
  const { data, error } = await db
    .from("team_cfg")
    .select("cfg_cd, cfg_val_json")
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false);
  // 읽기 실패를 "행 없음"으로 삼키면 기본값으로 조용히 돈다. 기본값이 '기능 끔'인 키(카톡방)는
  // 그 사이 발송이 멈추지만 다른 팀으로 새진 않는다 — 실패를 던져 호출부를 깨뜨리는 것보다 낫다.
  if (error) console.error("[team-cfg] 설정 조회 실패 — 기본값으로 동작", teamId, error.message);
  const values = new Map<string, unknown>();
  for (const row of (data ?? []) as { cfg_cd: string; cfg_val_json: unknown }[]) {
    values.set(row.cfg_cd, row.cfg_val_json);
  }
  // 실패한 결과는 캐시하지 않는다 — 다음 요청이 바로 다시 읽게.
  return { at: error ? 0 : Date.now(), values };
}

async function snapshot(teamId: string): Promise<Snapshot> {
  const hit = cache.get(teamId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit;
  // 같은 순간 여러 요청이 와도 조회는 한 번
  let pending = inflight.get(teamId);
  if (!pending) {
    pending = load(teamId).finally(() => inflight.delete(teamId));
    inflight.set(teamId, pending);
  }
  const snap = await pending;
  cache.set(teamId, snap);
  return snap;
}

/** 팀 설정 하나. 행이 없거나 형식이 틀리면 사전의 기본값. */
export async function getTeamCfg<K extends TeamCfgCd>(teamId: string, cd: K): Promise<TeamCfgValue<K>> {
  const snap = await snapshot(teamId);
  return resolveTeamCfgValue(cd, snap.values.has(cd) ? snap.values.get(cd) : undefined);
}

/** 테스트 전용 — 메모리 캐시 비우기 */
export function __clearTeamCfgCacheForTest(): void {
  cache.clear();
  inflight.clear();
}
