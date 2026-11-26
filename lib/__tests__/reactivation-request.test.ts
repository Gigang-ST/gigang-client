import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createReactivationRequest,
  resolveReactivationRequests,
} from "@/lib/reactivation-request";

/** 호출 순서를 기록하는 체이닝 가짜 — 마지막 await 에서 result 를 돌려준다 */
function fakeDb(results: Record<string, { data?: unknown; error?: { code?: string } | null }>) {
  const calls: { table: string; op: string; args: unknown[] }[] = [];
  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    let op = "select";
    const res = () => results[`${table}.${op}`] ?? { data: [], error: null };
    for (const m of ["select", "insert", "update", "eq", "in", "order"]) {
      chain[m] = (...args: unknown[]) => {
        if (m === "insert" || m === "update") op = m;
        calls.push({ table, op: m, args });
        return chain;
      };
    }
    chain.then = (ok: (v: unknown) => unknown) => Promise.resolve(res()).then(ok);
    return chain;
  };
  return { db: { from } as never, calls };
}

describe("createReactivationRequest", () => {
  it("새로 만들면 created: true", async () => {
    const { db } = fakeDb({ "mem_reactv_req.insert": { error: null } });
    await expect(
      createReactivationRequest(db, { teamId: "t", memId: "m", memStCd: "left" }),
    ).resolves.toEqual({ created: true });
  });

  it("이미 대기 중(유니크 충돌 23505)이면 created: false", async () => {
    const { db } = fakeDb({ "mem_reactv_req.insert": { error: { code: "23505" } } });
    await expect(
      createReactivationRequest(db, { teamId: "t", memId: "m", memStCd: "left" }),
    ).resolves.toEqual({ created: false });
  });

  it("그 밖의 오류는 던진다", async () => {
    const { db } = fakeDb({ "mem_reactv_req.insert": { error: { code: "XX000" } } });
    await expect(
      createReactivationRequest(db, { teamId: "t", memId: "m", memStCd: "left" }),
    ).rejects.toBeTruthy();
  });
});

describe("resolveReactivationRequests", () => {
  it("요청을 done 으로 닫고 운영진 알림(reactivate_req)을 읽음 처리한다", async () => {
    const { db, calls } = fakeDb({
      "team_mem_rel.select": { data: [{ team_mem_id: "tm1" }], error: null },
    });
    await resolveReactivationRequests(db, { teamId: "t", memIds: ["m1"], processedBy: "admin" });
    const updates = calls.filter((c) => c.op === "update");
    expect(updates.map((c) => c.table)).toEqual(["mem_reactv_req", "noti_mst"]);
    expect(updates[0].args[0]).toMatchObject({ req_stts_cd: "done", prc_mem_id: "admin" });
    expect(updates[1].args[0]).toEqual({ read_yn: true });
    expect(calls.some((c) => c.op === "eq" && c.args[1] === "reactivate_req")).toBe(true);
  });

  it("대상이 없으면 아무것도 부르지 않는다", async () => {
    const { db, calls } = fakeDb({});
    await resolveReactivationRequests(db, { teamId: "t", memIds: [], processedBy: "admin" });
    expect(calls).toEqual([]);
  });

  it("처리 표시가 실패해도 던지지 않는다(활성화는 이미 끝났다)", async () => {
    const { db } = fakeDb({ "mem_reactv_req.update": { error: { code: "XX000" } } });
    await expect(
      resolveReactivationRequests(db, { teamId: "t", memIds: ["m1"], processedBy: "a" }),
    ).resolves.toBeUndefined();
  });
});
