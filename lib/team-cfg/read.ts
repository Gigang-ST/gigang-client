import "server-only";

import { createUntypedAdminClient } from "@/lib/supabase/admin";
import { isRequestAbortError } from "@/lib/supabase/is-abort-error";

import { resolveTeamCfgReadErrorValue, resolveTeamCfgValue, type TeamCfgCd, type TeamCfgValue } from "./registry";

/**
 * 팀 설정 읽기.
 *
 * **Vercel 캐시(`unstable_cache` 등)를 쓰지 않는다.** 그건 읽을 때마다 계량되는 항목이라, 화면마다 설정을
 * 읽으면 요청 수에 비례해 사용량이 쌓인다(2026-10 계정 정지와 같은 유형 — AGENTS.md §Vercel 사용량).
 * 대신 **서버 인스턴스 메모리에 팀별로 1분** 들고 있다. Supabase 조회도 인스턴스당 팀별 1분에 한 번이라
 * 무시할 수준이다. 대가: 값을 바꾸면 모든 화면에 반영되기까지 최대 1분 걸린다(유저 확인 2026-11-09).
 */

const TTL_MS = 60_000;

/**
 * - `aborted` — 조회가 요청 취소로 끊겼다(값이 아니라 "못 읽음"이다). 이 결과로 기본값을 쓰면 안 된다.
 * - `failed` — 취소가 아닌 진짜 실패(DB 오류). 값이 없으니 키마다 정한 "실패 시 값"으로 물러난다.
 * - `gen` — 조회를 **시작할 때**의 세대. 그 사이 저장(invalidate)이 있었으면 이 결과는 저장 전 값일 수 있다.
 */
type Snapshot = { at: number; values: Map<string, unknown>; aborted?: boolean; failed?: boolean; gen: number };
const cache = new Map<string, Snapshot>();
const inflight = new Map<string, Promise<Snapshot>>();
/** 팀별 세대 — 저장할 때마다 올린다. 진행 중이던 옛 조회가 끝나며 옛 값을 캐시에 되돌려 넣지 않게 */
const generation = new Map<string, number>();
const genOf = (teamId: string) => generation.get(teamId) ?? 0;

async function load(teamId: string): Promise<Snapshot> {
  const gen = genOf(teamId);
  const db = createUntypedAdminClient();
  const { data, error } = await db
    .from("team_cfg")
    .select("cfg_cd, cfg_val_json")
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false);
  // 요청 취소(abort)는 오류가 아니다 — dev 렌더 재시작·사용자 이탈로 정상적으로 난다(§is-abort-error). 로그 없이
  // "못 읽음"으로 표시해 돌려주고, 기다리던 쪽이 다시 읽는다(아래 readSnapshot).
  const aborted = Boolean(error) && isRequestAbortError(error);
  // 진짜 실패는 **오류로 남긴다**(조용히 기본값으로 돌지 않게). 값을 쓰는 쪽은 키별 "실패 시 값"을 받는다 —
  // 기본값이 '켬'인 키(회비 기능)가 실패 순간 다른 팀(울산)에 켜지지 않게(§registry onReadError).
  const failed = Boolean(error) && !aborted;
  if (failed) console.error("[team-cfg] 설정 조회 실패 — 실패 시 값으로 동작", teamId, error?.message);
  const values = new Map<string, unknown>();
  for (const row of (data ?? []) as { cfg_cd: string; cfg_val_json: unknown }[]) {
    values.set(row.cfg_cd, row.cfg_val_json);
  }
  return { at: error ? 0 : Date.now(), values, aborted, failed, gen };
}

/** 실패·취소 결과는 캐시하지 않는다(다음 요청이 바로 다시 읽게). 조회 도중 저장이 있었던 결과도 넣지 않는다 */
function remember(teamId: string, snap: Snapshot): void {
  if (!snap.aborted && !snap.failed && snap.gen === genOf(teamId)) cache.set(teamId, snap);
}

async function snapshot(teamId: string): Promise<Snapshot> {
  const hit = cache.get(teamId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit;
  // 같은 순간 여러 요청이 와도 조회는 한 번
  let pending = inflight.get(teamId);
  if (!pending) {
    pending = load(teamId).finally(() => {
      if (inflight.get(teamId) === pending) inflight.delete(teamId);
    });
    inflight.set(teamId, pending);
  }
  const snap = await pending;
  remember(teamId, snap);
  return snap;
}

async function readSnapshot(teamId: string): Promise<Snapshot> {
  let snap = await snapshot(teamId);
  // 같은 순간 온 요청들은 조회 하나를 나눠 쓴다. 그 조회를 시작한 요청이 취소되면 **기다리던 다른 요청까지**
  // "못 읽음"을 받는데, 그대로 기본값을 쓰면 기본값이 '없음'인 키(카톡방 등)가 그 한 번 조용히 꺼진다
  // (모임 공지가 안 나가는 식). 그래서 취소된 결과를 받으면 **자기 요청으로 한 번 더** 읽는다 — 정말 자기가
  // 취소된 거라면 이것도 곧바로 끊겨 해가 없다.
  if (snap.aborted) {
    snap = await load(teamId);
    remember(teamId, snap);
  }
  return snap;
}

/**
 * 팀 설정 하나. 행이 없거나 형식이 틀리면 사전의 기본값.
 * 조회에 실패하면(오류 로그를 남기고) 사전의 **실패 시 값**(`onReadError`, 없으면 기본값)으로 물러난다.
 */
export async function getTeamCfg<K extends TeamCfgCd>(teamId: string, cd: K): Promise<TeamCfgValue<K>> {
  const snap = await readSnapshot(teamId);
  if (snap.failed || snap.aborted) return resolveTeamCfgReadErrorValue(cd);
  return resolveTeamCfgValue(cd, snap.values.has(cd) ? snap.values.get(cd) : undefined);
}

/** 설정을 못 읽었다 — "설정 안 함"과 구별해야 하는 쪽(카톡 발송: 방 미설정 ≠ 조회 실패)이 받는다 */
export class TeamCfgReadError extends Error {
  constructor(teamId: string) {
    super(`팀 설정 조회 실패 (team=${teamId})`);
    this.name = "TeamCfgReadError";
  }
}

/** `getTeamCfg` 와 같되, 조회에 실패하면 실패 시 값 대신 `TeamCfgReadError` 를 던진다 */
export async function getTeamCfgStrict<K extends TeamCfgCd>(teamId: string, cd: K): Promise<TeamCfgValue<K>> {
  const snap = await readSnapshot(teamId);
  if (snap.failed || snap.aborted) throw new TeamCfgReadError(teamId);
  return resolveTeamCfgValue(cd, snap.values.has(cd) ? snap.values.get(cd) : undefined);
}

/**
 * 이 서버 인스턴스의 그 팀 캐시를 비운다 — 관리자가 설정을 저장한 직후 **저장한 사람에게는** 바로 보이게.
 * 다른 인스턴스는 각자 1분 안에 새로 읽는다(그래서 "최대 1분 뒤 반영"이다).
 * 세대를 올리고 진행 중이던 조회도 놓아 준다 — 저장 전에 시작된 조회가 끝나며 옛 값을 다시 캐시에 넣지 않게.
 */
export function invalidateTeamCfgCache(teamId: string): void {
  generation.set(teamId, genOf(teamId) + 1);
  cache.delete(teamId);
  inflight.delete(teamId);
}

/** 테스트 전용 — 메모리 캐시 비우기 */
export function __clearTeamCfgCacheForTest(): void {
  cache.clear();
  inflight.clear();
  generation.clear();
}
