import { beforeEach, describe, expect, it, vi } from "vitest";

// insertNoti의 prefTypeEnm 필터링 검증(SG-05 AC-16 근거).
// gthr_cncl처럼 notiTypeEnm과 수신거부 판단 타입(prefTypeEnm)이 다른 알림도
// noti_pref_cfg 관문(insertNoti)에서 올바르게 걸러지는지 확인한다.

const h = vi.hoisted(() => {
  const prefEqArgs: [string, string][] = [];
  const prefRow: { data: { enabled_yn: boolean } | null } = { data: null };
  // insertNotiMany 경로용 가변 상태(수신거부 목록 / INSERT 반환행·에러).
  const many: {
    disabledPrefs: { mem_id: string }[];
    rows: { noti_id: string; mem_id: string }[];
    error: { message: string } | null;
    lastPayload: unknown;
  } = { disabledPrefs: [], rows: [], error: null, lastPayload: null };

  const insertMock = vi.fn((payload: unknown) => {
    many.lastPayload = payload;
    return {
      // insertNoti: .select().single() / insertNotiMany: .select() 를 await
      select: () => ({
        single: async () => ({ data: { noti_id: "noti-1" }, error: null }),
        then: (resolve: (v: unknown) => void) =>
          resolve({ data: many.rows, error: many.error }),
      }),
    };
  });

  const from = vi.fn((table: string) => {
    if (table === "noti_pref_cfg") {
      return {
        select: () => ({
          eq: (col: string, val: string) => {
            prefEqArgs.push([col, val]);
            return {
              eq: (col2: string, val2: string) => {
                prefEqArgs.push([col2, val2]);
                return {
                  // insertNoti: .maybeSingle()
                  maybeSingle: async () => prefRow,
                  // insertNotiMany: .in("mem_id", ids) 를 await → 수신거부 목록
                  in: (_col: string, _ids: string[]) => ({
                    then: (resolve: (v: unknown) => void) =>
                      resolve({ data: many.disabledPrefs, error: null }),
                  }),
                };
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

  return { from, insertMock, prefRow, prefEqArgs, many };
});

vi.mock("@/lib/supabase/admin", () => ({
  createUntypedAdminClient: () => ({ from: h.from }),
}));
vi.mock("@/lib/push/send-push", () => ({
  sendPushToMember: vi.fn(),
  sendPushToMembers: vi.fn(),
}));

import { insertNoti, insertNotiMany } from "@/lib/notifications/insert-noti";

beforeEach(() => {
  h.insertMock.mockClear();
  h.from.mockClear();
  h.prefRow.data = null;
  h.prefEqArgs.length = 0;
  h.many.disabledPrefs = [];
  h.many.rows = [];
  h.many.error = null;
  h.many.lastPayload = null;
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

describe("insertNotiMany — 반환값(감사 무결성용 실측 발송분)", () => {
  it("수신거부 필터 후 실제 INSERT된 mem_id 만 notifiedMemIds 로 반환(inAppOk=true)", async () => {
    // m2 는 수신거부 → 제외되고, INSERT 반환행(=실측)은 m1·m3.
    h.many.disabledPrefs = [{ mem_id: "m2" }];
    h.many.rows = [
      { noti_id: "n1", mem_id: "m1" },
      { noti_id: "n3", mem_id: "m3" },
    ];

    const result = await insertNotiMany({
      teamId: "team-1",
      memIds: ["m1", "m2", "m3"],
      notiTypeEnm: "adm_cust",
      notiNm: "공지",
      notiCont: "내용",
    });

    expect(result).toEqual({ inAppOk: true, notifiedMemIds: ["m1", "m3"] });
    // INSERT payload 에도 수신거부자(m2)는 없어야 한다(기존 pref 필터 회귀 방지).
    const payload = h.many.lastPayload as { mem_id: string }[];
    expect(payload.map((p) => p.mem_id)).toEqual(["m1", "m3"]);
  });

  it("noti_mst INSERT 에러 시 inAppOk=false·notifiedMemIds 빈 배열(전면 실패)", async () => {
    h.many.error = { message: "insert failed" };

    const result = await insertNotiMany({
      teamId: "team-1",
      memIds: ["m1", "m2"],
      notiTypeEnm: "adm_cust",
      notiNm: "공지",
    });

    expect(result).toEqual({ inAppOk: false, notifiedMemIds: [] });
  });

  it("전원 수신거부면 INSERT 없이 inAppOk=true·빈 발송분", async () => {
    h.many.disabledPrefs = [{ mem_id: "m1" }, { mem_id: "m2" }];

    const result = await insertNotiMany({
      teamId: "team-1",
      memIds: ["m1", "m2"],
      notiTypeEnm: "adm_cust",
      notiNm: "공지",
    });

    expect(result).toEqual({ inAppOk: true, notifiedMemIds: [] });
    expect(h.insertMock).not.toHaveBeenCalled();
  });

  it("빈 memIds 는 조회·INSERT 없이 inAppOk=true·빈 발송분", async () => {
    const result = await insertNotiMany({
      teamId: "team-1",
      memIds: [],
      notiTypeEnm: "adm_cust",
      notiNm: "공지",
    });

    expect(result).toEqual({ inAppOk: true, notifiedMemIds: [] });
    expect(h.from).not.toHaveBeenCalled();
  });
});
