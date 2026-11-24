import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OperatorContext } from "@/lib/mcp/auth";
import type { Database } from "@/lib/supabase/database.types";

const { fetchMembersMock } = vi.hoisted(() => ({ fetchMembersMock: vi.fn() }));
vi.mock("@/lib/kakao/notify", () => ({ fetchKakaoRoomMembers: fetchMembersMock }));

import {
  ListKakaoRoomMembersDeniedError,
  listKakaoRoomMembers,
  normalizeName,
  reconcileRoomMembers,
} from "@/lib/mcp/list-kakao-room-members";

const site = (id: string, nm: string) => ({ mem_id: id, mem_nm: nm, join_dt: null });

function makeSupabase(rows: { mem_id: string; mem_nm: string }[]) {
  const from = vi.fn();
  const builder: Record<string, unknown> = {};
  for (const k of ["select", "eq"]) builder[k] = () => builder;
  builder.then = (resolve: (v: unknown) => void) =>
    resolve({
      data: rows.map((r) => ({ mem_id: r.mem_id, join_dt: null, mem_mst: { mem_nm: r.mem_nm } })),
      error: null,
    });
  from.mockReturnValue(builder);
  return { client: { from } as unknown as SupabaseClient<Database>, from };
}

const ctx = (is_admin: boolean): OperatorContext => ({
  mem_id: "m0",
  team_id: "t1",
  is_admin,
  mem_nm: "운영",
});

describe("reconcileRoomMembers", () => {
  it("네 갈래로 나누고 이름을 모르는 참여자는 건수로 센다", () => {
    const r = reconcileRoomMembers(
      [site("a", "김철수"), site("b", "이영희"), site("c", "박민수"), site("d", "박민수"), site("e", "최하나")],
      ["김철수", "박민수", "외부인", null],
    );
    expect(r.in_room.map((m) => m.mem_id)).toEqual(["a"]);
    expect(r.not_in_room.map((m) => m.mem_id)).toEqual(["b", "e"]);
    expect(r.ambiguous).toHaveLength(1);
    expect(r.ambiguous[0]).toMatchObject({ site_count: 2, room_count: 1 });
    expect(r.room_only).toEqual(["외부인"]);
    expect(r.room_unnamed_count).toBe(1);
  });

  it("동명이인이 단톡에 둘 이상이어도 ambiguous", () => {
    const r = reconcileRoomMembers([site("a", "김철수")], ["김철수", "김철수"]);
    expect(r.in_room).toEqual([]);
    expect(r.ambiguous[0]).toMatchObject({ site_count: 1, room_count: 2 });
  });

  it("이름이 달라 못 맞춘 사람은 양쪽에 다 보인다", () => {
    const r = reconcileRoomMembers([site("a", "김철수")], ["철수"]);
    expect(r.not_in_room).toHaveLength(1);
    expect(r.room_only).toEqual(["철수"]);
  });

  it("정규화는 공백·대소문자를 무시한다", () => {
    expect(normalizeName(" Kim  Cheol ")).toBe("kim cheol");
  });
});

describe("list_kakao_room_members", () => {
  beforeEach(() => fetchMembersMock.mockReset());

  it("비-admin 은 허브도 DB 도 부르지 않고 거부", async () => {
    const { client, from } = makeSupabase([]);
    await expect(listKakaoRoomMembers(client, ctx(false))).rejects.toBeInstanceOf(
      ListKakaoRoomMembersDeniedError,
    );
    expect(fetchMembersMock).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it("허브 실패·미설정은 DB 를 읽지 않고 상태로 돌려준다", async () => {
    const { client, from } = makeSupabase([]);
    fetchMembersMock.mockResolvedValue({ ok: false, skipped: "disabled" });
    expect(await listKakaoRoomMembers(client, ctx(true))).toMatchObject({
      status: "skipped",
      skipped_reason: "disabled",
    });
    fetchMembersMock.mockResolvedValue({
      ok: false,
      failure: { name: "NotiBotApiError", code: "forbidden", status: 403, message: "no scope", retryable: false },
    });
    expect(await listKakaoRoomMembers(client, ctx(true))).toMatchObject({
      status: "failed",
      failure: { code: "forbidden", http_status: 403 },
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("성공하면 대조 결과와 완전성을 싣고 건수만 로그에 남긴다", async () => {
    const { client } = makeSupabase([
      { mem_id: "a", mem_nm: "김철수" },
      { mem_id: "b", mem_nm: "이영희" },
    ]);
    fetchMembersMock.mockResolvedValue({
      ok: true,
      names: ["김철수", "외부인"],
      known: 2,
      total: 5,
      openChat: true,
      syncedAt: 1700000000000,
    });
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const r = await listKakaoRoomMembers(client, ctx(true));
    expect(r).toMatchObject({
      status: "ok",
      completeness: { known: 2, total: 5, open_chat: true, incomplete: true, synced_at: "2023-11-15 07:13" },
      counts: { in_room: 1, not_in_room: 1, ambiguous: 0, room_only: 1 },
      room_only: ["외부인"],
    });
    const logged = JSON.stringify(info.mock.calls);
    expect(logged).not.toContain("김철수");
    expect(logged).not.toContain("외부인");
    info.mockRestore();
  });
});
