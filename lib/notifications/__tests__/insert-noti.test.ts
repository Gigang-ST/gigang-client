import { beforeEach, describe, expect, it, vi } from "vitest";

// insertNoti의 prefTypeEnm 필터링 검증(SG-05 AC-16 근거).
// gthr_cncl처럼 notiTypeEnm과 수신거부 판단 타입(prefTypeEnm)이 다른 알림도
// noti_pref_cfg 관문(insertNoti)에서 올바르게 걸러지는지 확인한다.

const h = vi.hoisted(() => {
  const prefEqArgs: [string, string][] = [];
  const prefRow: { data: { enabled_yn: boolean } | null } = { data: null };
  const insertMock = vi.fn(() => ({
    select: () => ({
      single: async () => ({ data: { noti_id: "noti-1" }, error: null }),
    }),
  }));

  const from = vi.fn((table: string) => {
    if (table === "noti_pref_cfg") {
      return {
        select: () => ({
          eq: (col: string, val: string) => {
            prefEqArgs.push([col, val]);
            return {
              eq: (col2: string, val2: string) => {
                prefEqArgs.push([col2, val2]);
                return { maybeSingle: async () => prefRow };
              },
            };
          },
        }),
      };
    }
    if (table === "noti_mst") {
      return { insert: insertMock };
    }
    throw new Error(`unexpected table ${table}`);
  });

  return { from, insertMock, prefRow, prefEqArgs };
});

vi.mock("@/lib/supabase/admin", () => ({
  createUntypedAdminClient: () => ({ from: h.from }),
}));
vi.mock("@/lib/push/send-push", () => ({
  sendPushToMember: vi.fn(),
  sendPushToMembers: vi.fn(),
}));

import { insertNoti } from "@/lib/notifications/insert-noti";

beforeEach(() => {
  h.insertMock.mockClear();
  h.from.mockClear();
  h.prefRow.data = null;
  h.prefEqArgs.length = 0;
});

describe("insertNoti — prefTypeEnm 수신거부 판단", () => {
  it("AC-16: prefTypeEnm으로 지정한 타입이 수신거부(enabled_yn=false)면 notiTypeEnm이 달라도 발송하지 않는다", async () => {
    h.prefRow.data = { enabled_yn: false };

    await insertNoti({
      teamId: "team-1",
      memId: "mem-organizer",
      notiTypeEnm: "gthr_cncl",
      prefTypeEnm: "gthr_upd",
      notiNm: "취소 알림",
    });

    // 수신거부 여부는 prefTypeEnm("gthr_upd") 기준으로 조회해야 한다 — notiTypeEnm이 아니라.
    expect(h.prefEqArgs).toContainEqual(["noti_type_enm", "gthr_upd"]);
    expect(h.insertMock).not.toHaveBeenCalled();
  });

  it("AC-16: prefTypeEnm 수신이 허용(enabled_yn=true)이면 notiTypeEnm 그대로 발송한다", async () => {
    h.prefRow.data = { enabled_yn: true };

    await insertNoti({
      teamId: "team-1",
      memId: "mem-organizer",
      notiTypeEnm: "gthr_cncl",
      prefTypeEnm: "gthr_upd",
      notiNm: "취소 알림",
    });

    expect(h.insertMock).toHaveBeenCalledTimes(1);
  });

  it("prefTypeEnm 미지정 시 notiTypeEnm 기준으로 수신거부를 판단한다(기존 동작 유지)", async () => {
    h.prefRow.data = { enabled_yn: false };

    await insertNoti({
      teamId: "team-1",
      memId: "mem-1",
      notiTypeEnm: "gthr_upd",
      notiNm: "수정 알림",
    });

    expect(h.prefEqArgs).toContainEqual(["noti_type_enm", "gthr_upd"]);
    expect(h.insertMock).not.toHaveBeenCalled();
  });
});
