import { beforeEach, describe, expect, it, vi } from "vitest";

// PB 클래스 「N주차 훈련벙 열기」 — 한 주차만 열면 노티봇(단톡방)으로 공지하고, 한꺼번에 열면 안 보낸다
// (오너 2026-10-08: "훈련 열면 그 노티봇 작동하게"). 공지 경로는 모임 등록(createGathering)과 같은
// notifyGatheringCreated 다. vi.mock 패턴은 gathering-cancel-notify.test.ts 를 따른다.

const h = vi.hoisted(() => {
  const notify = vi.fn(async () => {});
  const env: Record<string, string | undefined> = {
    KAKAO_WEBHOOK_URL: "https://bridge.example/webhook",
    KAKAO_ROOM: "기강",
  };

  const queryStub = (result: unknown) => {
    const p = Promise.resolve(result);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const proxy: any = new Proxy(function () {}, {
      get(_t, prop) {
        if (prop === "then") return p.then.bind(p);
        if (prop === "catch") return p.catch.bind(p);
        if (prop === "finally") return p.finally.bind(p);
        return () => proxy;
      },
      apply: () => proxy,
    });
    return proxy;
  };

  let seq = 0;
  const from = (table: string) => {
    if (table === "evt_pb_cfg") return queryStub({ data: null, error: null });
    if (table === "evt_gthr_rel") return queryStub({ data: [], error: null });
    if (table === "gthr_mst") {
      seq += 1;
      return queryStub({ data: { gthr_id: `g-${seq}`, short_id: `s-${seq}` }, error: null });
    }
    throw new Error(`unexpected table ${table}`);
  };

  return { notify, env, from, resetSeq: () => (seq = 0) };
});

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
// 요청 스코프가 없는 단위 테스트에서 진짜 `after`는 던진다 — 콜백을 그 자리에서 돌린다
vi.mock("next/server", () => ({ after: (fn: () => unknown) => { void fn(); } }));
vi.mock("@/lib/env", () => ({ env: h.env }));
vi.mock("@/lib/gathering/kakao-dispatch", () => ({ notifyGatheringCreated: h.notify }));
vi.mock("@/lib/request-origin", () => ({ getRequestOrigin: async () => "https://gigang.team" }));
vi.mock("@/lib/queries/request-team", () => ({ getRequestTeamContext: async () => ({ teamId: "team-1" }) }));
vi.mock("@/lib/pb-class-guard", () => ({
  guardEvent: async () => ({ evt_id: EVT_ID, stt_dt: "2026-11-04", end_dt: "2027-02-09" }),
  guardParticipant: async () => null,
}));
vi.mock("@/lib/actions/auth", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withAdmin: async (fn: any) =>
    fn({ member: { id: "mem-admin", full_name: "김운영", admin: true, status: "active" }, supabase: {} }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: h.from }) }));

const EVT_ID = "11111111-1111-4111-8111-111111111111";

import { createPbSessGatherings } from "@/app/actions/admin/manage-pb-class";
import type { PbSessDraft } from "@/lib/pb-class-sessions";

/** 2026-11-04(수)가 1주차 — wkNo 주차의 수요일 19:30 */
const draft = (wkNo: number, over: Partial<PbSessDraft> = {}): PbSessDraft => ({
  wkNo,
  sessType: "TRAINING",
  gthrNm: `PB 클래스 ${wkNo}주차`,
  date: `2026-11-${String(4 + (wkNo - 1) * 7).padStart(2, "0")}`,
  time: "19:30",
  durMin: 90,
  locTxt: "반포종합운동장",
  descTxt: "훈련 설명",
  ...over,
});

beforeEach(() => {
  h.notify.mockClear();
  h.resetSeq();
  h.env.KAKAO_WEBHOOK_URL = "https://bridge.example/webhook";
  h.env.KAKAO_ROOM = "기강";
});

describe("createPbSessGatherings — 노티봇 공지", () => {
  it("한 주차만 열면 모임 등록과 같은 공지를 한 번 보낸다(제목·장소·링크·연 사람)", async () => {
    const res = await createPbSessGatherings(EVT_ID, [draft(2)]);

    expect(res).toMatchObject({ ok: true, created: 1 });
    expect(res.message).toBe("2주차 훈련벙을 열었어요 — 단톡방에도 공지했어요");
    expect(h.notify).toHaveBeenCalledTimes(1);
    expect(h.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        gthrId: "g-1",
        ref: "s-1",
        origin: "https://gigang.team",
        title: "PB 클래스 2주차",
        location: "반포종합운동장",
        authorName: "김운영",
      }),
    );
  });

  it("측정 벙도 한 개면 공지한다", async () => {
    // 13주차 수요일 = 2026-11-04 + 84일
    const res = await createPbSessGatherings(EVT_ID, [
      draft(13, { sessType: "MEASURE", gthrNm: "10K 측정", date: "2027-01-27" }),
    ]);
    expect(res.message).toBe("10K 측정 벙을 열었어요 — 단톡방에도 공지했어요");
    expect(h.notify).toHaveBeenCalledTimes(1);
  });

  it("한꺼번에 열면 보내지 않는다 — 연달아 올라가면 도배다", async () => {
    const res = await createPbSessGatherings(EVT_ID, [draft(1), draft(2), draft(3)]);

    expect(res).toMatchObject({ ok: true, created: 3, message: "공식훈련 벙 3개를 열었어요" });
    expect(h.notify).not.toHaveBeenCalled();
  });

  it("노티봇이 없는 환경(로컬·preview)이면 공지했다고 말하지 않는다", async () => {
    h.env.KAKAO_WEBHOOK_URL = undefined;
    const res = await createPbSessGatherings(EVT_ID, [draft(2)]);
    expect(res.message).toBe("2주차 훈련벙을 열었어요");
  });
});
