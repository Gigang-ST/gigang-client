import "server-only";

import { createUntypedAdminClient } from "@/lib/supabase/admin";
import { isRequestAbortError } from "@/lib/supabase/is-abort-error";

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

/** `aborted` — 조회가 요청 취소로 끊겼다(값이 아니라 "못 읽음"이다). 이 결과로 기본값을 쓰면 안 된다 */
type Snapshot = { at: number; values: Map<string, unknown>; aborted?: boolean };
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
  // 요청 취소(abort)는 오류가 아니다 — dev 렌더 재시작·사용자 이탈로 정상적으로 난다(§is-abort-error). 로그 없이
  // "못 읽음"으로 표시해 돌려주고, 기다리던 쪽이 다시 읽는다(아래 getTeamCfg).
  const aborted = Boolean(error) && isRequestAbortError(error);
  if (error && !aborted) console.error("[team-cfg] 설정 조회 실패 — 기본값으로 동작", teamId, error.message);
  const values = new Map<string, unknown>();
  for (const row of (data ?? []) as { cfg_cd: string; cfg_val_json: unknown }[]) {
    values.set(row.cfg_cd, row.cfg_val_json);
  }
  // 실패한 결과는 캐시하지 않는다 — 다음 요청이 바로 다시 읽게.
  return { at: error ? 0 : Date.now(), values, aborted };
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
  if (!snap.aborted) cache.set(teamId, snap);
  return snap;
}

/** 팀 설정 하나. 행이 없거나 형식이 틀리면 사전의 기본값. */
export async function getTeamCfg<K extends TeamCfgCd>(teamId: string, cd: K): Promise<TeamCfgValue<K>> {
  let snap = await snapshot(teamId);
  // 같은 순간 온 요청들은 조회 하나를 나눠 쓴다. 그 조회를 시작한 요청이 취소되면 **기다리던 다른 요청까지**
  // "못 읽음"을 받는데, 그대로 기본값을 쓰면 기본값이 '없음'인 키(카톡방 등)가 그 한 번 조용히 꺼진다
  // (모임 공지가 안 나가는 식). 그래서 취소된 결과를 받으면 **자기 요청으로 한 번 더** 읽는다 — 정말 자기가
  // 취소된 거라면 이것도 곧바로 끊겨 해가 없다.
  if (snap.aborted) {
    snap = await load(teamId);
    if (!snap.aborted && snap.at > 0) cache.set(teamId, snap);
  }
  return resolveTeamCfgValue(cd, snap.values.has(cd) ? snap.values.get(cd) : undefined);
}

/** 테스트 전용 — 메모리 캐시 비우기 */
export function __clearTeamCfgCacheForTest(): void {
  cache.clear();
  inflight.clear();
}
