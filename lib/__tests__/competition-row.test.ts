import { describe, expect, it } from "vitest";

import { toCompetition } from "@/lib/competition-row";

const base = {
  comp_id: "c1",
  short_id: "abc123",
  crt_by: "m1",
  ext_id: "manual:x",
  comp_sprt_cd: "trail_run",
  comp_nm: "트랜스제주",
  stt_dt: "2026-10-02",
  end_dt: null,
  loc_nm: "제주",
  src_url: null,
};

/**
 * 조회 행 → 대회 객체. 직접 조회와 RPC가 같은 결과를 내야 같은 대회가 화면마다 다르게 안 나온다.
 */
describe("toCompetition", () => {
  it("직접 조회(종목 임베드)와 RPC(종목 배열)가 같은 대회 객체를 만든다", () => {
    const direct = toCompetition({
      ...base,
      comp_evt_cfg: [{ comp_evt_type: "60K" }, { comp_evt_type: "160K" }, { comp_evt_type: "20K" }],
    });
    const rpc = toCompetition({ ...base, comp_evt_types: ["160K", "20K", "60K"] });
    expect(direct).toEqual(rpc);
    expect(direct.event_types).toEqual(["160K", "60K", "20K"]);
  });

  it("short_id·crt_by를 싣는다 — 빠지면 공유 링크가 uuid로 나가고 수정 버튼이 안 보인다", () => {
    const comp = toCompetition({ ...base, comp_evt_types: [] });
    expect(comp.short_id).toBe("abc123");
    expect(comp.crt_by).toBe("m1");
  });

  it("빈 값은 화면 규약대로 채운다", () => {
    const comp = toCompetition({
      ...base,
      short_id: null,
      crt_by: null,
      ext_id: null,
      comp_sprt_cd: null,
      comp_evt_cfg: null,
    });
    expect(comp).toMatchObject({
      short_id: null,
      crt_by: null,
      external_id: "",
      sport: null,
      event_types: [],
    });
  });
});
