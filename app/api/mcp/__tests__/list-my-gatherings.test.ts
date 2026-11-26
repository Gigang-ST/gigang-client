import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { ToolInputError, listMyGatherings } from "@/lib/mcp/queries";
import type { Database } from "@/lib/supabase/database.types";

import { FakeSupabase, type Row } from "./fake-supabase";

/**
 * #740 list_my_gatherings — 내가 참석 신청한 모임만, 기간(KST)·삭제·취소·시간순.
 * 참석 취소 = `gthr_attd_rel` 행 삭제라 "행이 없는 모임"으로 시드한다.
 */
const TEAM = "22222222-2222-4222-8222-222222222222";
const OTHER_TEAM = "22222222-2222-4222-8222-999999999999";
const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "aaaaaaaa-0000-4000-8000-000000000001";

function gthr(id: string, sttAt: string, over: Row = {}): Row {
  return {
    gthr_id: id,
    gthr_nm: `모임 ${id}`,
    gthr_type_enm: "regular",
    stt_at: sttAt,
    end_at: null,
    loc_txt: "잠수교",
    team_id: TEAM,
    del_yn: false,
    gthr_attd_rel: [{ count: 5 }],
    ...over,
  };
}

function attd(memId: string, g: Row, crtAt = "2026-11-20T00:00:00Z"): Row {
  return { attd_id: `${g.gthr_id}-${memId}`, mem_id: memId, crt_at: crtAt, gthr_mst: g };
}

function run(rows: Row[], range?: { from?: string; to?: string }) {
  const fake = new FakeSupabase({ gthr_attd_rel: rows });
  return listMyGatherings(fake as unknown as SupabaseClient<Database>, TEAM, ME, range);
}

describe("listMyGatherings", () => {
  it("내 신청만, 시작 시각 오름차순, 필드 모양 고정", async () => {
    const late = gthr("g2", "2026-11-25T10:00:00Z");
    const early = gthr("g1", "2026-11-24T10:00:00Z", { end_at: "2026-11-24T12:00:00Z", gthr_attd_rel: [{ count: 9 }] });
    const out = await run(
      [attd(ME, late), attd(ME, early, "2026-11-21T01:00:00Z"), attd(OTHER, gthr("g3", "2026-11-24T00:00:00Z"))],
      { from: "2026-11-23", to: "2026-11-30" },
    );
    expect(out.map((r) => r.gthr_id)).toEqual(["g1", "g2"]);
    expect(out[0]).toEqual({
      gthr_id: "g1",
      gthr_nm: "모임 g1",
      gthr_type_enm: "regular",
      stt_at: "2026-11-24T10:00:00Z",
      end_at: "2026-11-24T12:00:00Z",
      loc_txt: "잠수교",
      attendee_cnt: 9,
      applied_at: "2026-11-21T01:00:00Z",
    });
  });

  it("삭제된 모임·다른 팀 모임은 제외", async () => {
    const out = await run(
      [
        attd(ME, gthr("del", "2026-11-24T10:00:00Z", { del_yn: true })),
        attd(ME, gthr("other", "2026-11-24T10:00:00Z", { team_id: OTHER_TEAM })),
        attd(ME, gthr("ok", "2026-11-24T10:00:00Z")),
      ],
      { from: "2026-11-23", to: "2026-11-30" },
    );
    expect(out.map((r) => r.gthr_id)).toEqual(["ok"]);
  });

  it("참석을 취소해 행이 없는 모임은 나오지 않는다", async () => {
    const out = await run([attd(OTHER, gthr("cancelled", "2026-11-24T10:00:00Z"))], {
      from: "2026-11-23",
      to: "2026-11-30",
    });
    expect(out).toEqual([]);
  });

  it("기간은 KST 날짜 양끝 포함 — to 당일 23:59 KST 는 포함, 다음날 00:00 KST 는 제외", async () => {
    const out = await run(
      [
        // 2026-11-23 00:00 KST = 11-22T15:00Z (from 포함)
        attd(ME, gthr("a", "2026-11-22T15:00:00Z")),
        // 11-22T14:59Z = 11-22 23:59 KST (from 전날 → 제외)
        attd(ME, gthr("before", "2026-11-22T14:59:00Z")),
        // 11-24 23:59 KST = 11-24T14:59Z (to 당일 → 포함)
        attd(ME, gthr("b", "2026-11-24T14:59:00Z")),
        // 11-25 00:00 KST = 11-24T15:00Z (to 다음날 → 제외)
        attd(ME, gthr("after", "2026-11-24T15:00:00Z")),
      ],
      { from: "2026-11-23", to: "2026-11-24" },
    );
    expect(out.map((r) => r.gthr_id)).toEqual(["a", "b"]);
  });

  it("to 를 안 주면 from + 30일까지", async () => {
    const out = await run(
      [attd(ME, gthr("in", "2026-12-23T00:00:00Z")), attd(ME, gthr("out", "2026-12-24T00:00:00Z"))],
      { from: "2026-11-23" },
    );
    expect(out.map((r) => r.gthr_id)).toEqual(["in"]);
  });

  it("to < from 이거나 기간이 너무 길면 입력 오류", async () => {
    await expect(run([], { from: "2026-11-24", to: "2026-11-23" })).rejects.toBeInstanceOf(ToolInputError);
    await expect(run([], { from: "2026-01-01", to: "2028-01-01" })).rejects.toBeInstanceOf(ToolInputError);
  });
});
