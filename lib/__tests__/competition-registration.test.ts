import { describe, expect, it } from "vitest";

import {
  buildRegistrationMap,
  findMyRegistration,
} from "@/lib/competition-registration";

const ME = "7dd2ab13-a196-4080-a9c3-923e679d6b06";
const COMP = "b55fcda1-44f8-4866-83bb-c05d13c80366";

describe("buildRegistrationMap", () => {
  it("comp_id를 키로 등록을 눕힌다 (임베드가 객체로 올 때)", () => {
    const map = buildRegistrationMap([
      {
        comp_reg_id: "reg-1",
        mem_id: ME,
        prt_role_cd: "cheering",
        crt_at: "2026-08-01T00:00:00Z",
        comp_evt_cfg: null,
        team_comp_plan_rel: { comp_id: COMP },
      },
    ]);

    expect(map[COMP]).toEqual({
      id: "reg-1",
      competition_id: COMP,
      member_id: ME,
      role: "cheering",
      event_type: null,
      created_at: "2026-08-01T00:00:00Z",
    });
  });

  it("임베드가 배열로 와도 같은 결과를 낸다", () => {
    const map = buildRegistrationMap([
      {
        comp_reg_id: "reg-1",
        mem_id: ME,
        prt_role_cd: "participant",
        crt_at: "2026-08-01T00:00:00Z",
        comp_evt_cfg: [{ comp_evt_type: "10k" }],
        team_comp_plan_rel: [{ comp_id: COMP }],
      },
    ]);

    expect(map[COMP]?.event_type).toBe("10K");
  });

  // 예전엔 plan이 없는 행 하나가 TypeError를 던져 맵 구성이 통째로 날아갔다.
  // 그 결과 이미 신청한 사람이 신규 INSERT를 쏴 23505로 막다른 길에 갇혔다.
  it("대회를 알 수 없는 행은 건너뛰되 나머지는 살린다", () => {
    const map = buildRegistrationMap([
      {
        comp_reg_id: "reg-0",
        mem_id: ME,
        prt_role_cd: "participant",
        crt_at: "2026-07-01T00:00:00Z",
        team_comp_plan_rel: null,
      },
      {
        comp_reg_id: "reg-1",
        mem_id: ME,
        prt_role_cd: "participant",
        crt_at: "2026-08-01T00:00:00Z",
        team_comp_plan_rel: { comp_id: COMP },
      },
    ]);

    expect(Object.keys(map)).toEqual([COMP]);
  });

  it("null·빈 배열이면 빈 맵", () => {
    expect(buildRegistrationMap(null)).toEqual({});
    expect(buildRegistrationMap([])).toEqual({});
  });
});

describe("findMyRegistration", () => {
  const rows = [
    {
      comp_reg_id: "reg-other",
      mem_id: "someone-else",
      prt_role_cd: "participant",
      crt_at: "2026-08-01T00:00:00Z",
      comp_evt_cfg: { comp_evt_type: "FULL" },
    },
    {
      comp_reg_id: "reg-mine",
      mem_id: ME,
      prt_role_cd: "cheering",
      crt_at: "2026-08-02T00:00:00Z",
      comp_evt_cfg: null,
    },
  ];

  it("참가자 목록에서 내 등록만 집어낸다", () => {
    expect(findMyRegistration(rows, ME, COMP)).toEqual({
      id: "reg-mine",
      competition_id: COMP,
      member_id: ME,
      role: "cheering",
      event_type: null,
      created_at: "2026-08-02T00:00:00Z",
    });
  });

  it("내 등록이 없으면 undefined", () => {
    expect(findMyRegistration(rows, "nobody", COMP)).toBeUndefined();
  });

  // 비로그인은 "내 등록"이라는 개념이 없다 — 남의 행을 집어오면 안 된다.
  it("멤버 식별자가 없으면 undefined", () => {
    expect(findMyRegistration(rows, undefined, COMP)).toBeUndefined();
  });

  // comp_reg_id가 안 실린 조회(참가자 이름만 뽑던 옛 select)로는 수정·취소가 불가능하므로
  // "등록을 찾았다"고 말하면 안 된다.
  it("comp_reg_id가 없는 행은 등록으로 치지 않는다", () => {
    const withoutId = [
      {
        comp_reg_id: "",
        mem_id: ME,
        prt_role_cd: "cheering",
        crt_at: "2026-08-02T00:00:00Z",
      },
    ];
    expect(findMyRegistration(withoutId, ME, COMP)).toBeUndefined();
  });
});
