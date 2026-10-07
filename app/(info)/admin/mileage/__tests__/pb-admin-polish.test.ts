import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { PB_CLASS_DEFAULT_CFG } from "@/lib/pb-class";
import { PB_DEFAULT_SESS_PLANS } from "@/lib/pb-class-plan";
import type { PbClassBoard } from "@/lib/queries/pb-class";

import { parsePbCfgForm, toPbCfgForm } from "@/app/(info)/admin/mileage/pb-cfg-fields";
import { PlanBody } from "@/app/(info)/admin/mileage/pb-sess-plan-tab";
import { previewPbEndDt } from "@/app/(info)/admin/mileage/project-info-tab";

// 서버 액션 모듈은 끌어오는 순간 env 검증·supabase 클라이언트까지 줄줄이 로드된다 — 이 테스트는 그릴 뿐 부르지 않는다.
vi.mock("@/app/actions/admin/manage-pb-class", () => ({
  getPbClassAdminBoard: vi.fn(),
  savePbCfg: vi.fn(),
  seedPbSessPlans: vi.fn(),
  upsertPbSessPlan: vi.fn(),
  deletePbSessPlan: vi.fn(),
}));
vi.mock("@/app/actions/admin/manage-mileage", () => ({
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
  setEventStatus: vi.fn(),
  getEventParticipantCount: vi.fn(),
}));

/**
 * 「PB 클래스 다듬기」 관리자 화면의 약속을 못박는다.
 *
 * 크래시 없이 틀리는 종류만 모았다 — 주차 표기(「9주차」, 「W9」 아님), 종료일 자동 계산,
 * 마일리지런 할인 검증, 훈련표 탭의 빈 상태·측정 회차 이름.
 */

describe("PB 설정 폼 — 마일리지런 할인", () => {
  it("설정 ↔ 폼 왕복에 할인 칸이 들어 있다", () => {
    const form = toPbCfgForm(PB_CLASS_DEFAULT_CFG);
    expect(form.mlgDcAmt).toBe("5000");
    const parsed = parsePbCfgForm(form);
    expect("cfg" in parsed && parsed.cfg).toEqual(PB_CLASS_DEFAULT_CFG);
  });

  it("할인 0원은 허용하고, 보증금을 넘는 할인은 저장 전에 막는다", () => {
    expect("cfg" in parsePbCfgForm({ ...toPbCfgForm(PB_CLASS_DEFAULT_CFG), mlgDcAmt: "0" })).toBe(true);
    const over = parsePbCfgForm({ ...toPbCfgForm(PB_CLASS_DEFAULT_CFG), mlgDcAmt: "50000" });
    expect("error" in over && over.error).toContain("보증금");
    // 보증금과 같은 금액까지는 괜찮다(0원 보증금이 되는 것일 뿐)
    expect("cfg" in parsePbCfgForm({ ...toPbCfgForm(PB_CLASS_DEFAULT_CFG), mlgDcAmt: "30000" })).toBe(true);
  });

  it("숫자가 아닌 할인은 거른다", () => {
    expect("error" in parsePbCfgForm({ ...toPbCfgForm(PB_CLASS_DEFAULT_CFG), mlgDcAmt: "" })).toBe(true);
    expect("error" in parsePbCfgForm({ ...toPbCfgForm(PB_CLASS_DEFAULT_CFG), mlgDcAmt: "-1" })).toBe(true);
  });
});

describe("PB 종료일 자동 계산 미리보기", () => {
  it("11/4(수) 시작 + 총 13회차 → 2/9(화) — 측정 주간 끝까지", () => {
    expect(previewPbEndDt("2026-11-04", "13")).toBe("2027-02-09");
  });

  it("총 회차를 바꾸면 종료일도 같이 움직인다", () => {
    expect(previewPbEndDt("2026-11-04", "12")).toBe("2027-02-02");
  });

  it("시작일이 비었거나 총 회차가 저장 불가 값이면 계산하지 않는다", () => {
    expect(previewPbEndDt("", "13")).toBeNull();
    expect(previewPbEndDt("2026-11-04", "")).toBeNull();
    expect(previewPbEndDt("2026-11-04", "1")).toBeNull();
    expect(previewPbEndDt("2026-11-04", "abc")).toBeNull();
  });
});

function makeBoard(over: Partial<PbClassBoard> = {}): PbClassBoard {
  return {
    evt: { evtId: "evt-1", evtNm: "겨울 10K PB 클래스", sttDt: "2026-11-04", endDt: "2027-02-09", sttsEnm: "ACTIVE" },
    cfg: { ...PB_CLASS_DEFAULT_CFG },
    cfgSaved: true,
    sessions: [],
    participants: [],
    totals: { aprvCnt: 0, pendingCnt: 0, depositSum: 0, refundSum: 0, unrefundedSum: 0, entryFeeSum: 0 },
    sessPlans: [],
    ...over,
  };
}

const render = (board: PbClassBoard) =>
  renderToStaticMarkup(
    createElement(PlanBody, {
      board,
      evtId: board.evt.evtId,
      run: async () => true,
      busyKey: null,
    }),
  );

describe("훈련표 탭", () => {
  it("회차는 「n주차」, 마지막 회차는 「측정」으로 부른다 — W 표기는 어디에도 없다", () => {
    const html = render(makeBoard({ sessPlans: PB_DEFAULT_SESS_PLANS }));
    expect(html).toContain("1주차");
    expect(html).toContain("12주차");
    expect(html).toContain("측정");
    expect(html).not.toMatch(/\bW\d/);
    // 13번째 회차는 「13주차」가 아니다 — 측정은 13·14주차 어느 쪽에도 놓일 수 있다
    expect(html).not.toContain("13주차");
    expect(html).toContain("훈련표 13/13회차");
  });

  it("카드마다 단계·A~D·E·목적을 보여 주고, 비고는 있을 때만 그린다", () => {
    const html = render(makeBoard({ sessPlans: PB_DEFAULT_SESS_PLANS.slice(0, 2) }));
    expect(html).toContain("A~D 훈련팀");
    expect(html).toContain("E 첫 10K");
    expect(html).toContain("목적");
    expect(html).toContain("킥오프 + 5K 타임트라이얼");
    // 1회차는 E 세션이 없어 「A~D와 같아요」, 2회차는 E 세션이 있다
    expect(html).toContain("A~D와 같아요");
    expect(html).toContain("6 × 400m");
    // 1·2회차 모두 비고가 있고, 같은 칸이 빈 회차(예: 4회차)에서는 라벨이 안 선다
    const noNote = render(makeBoard({ sessPlans: [PB_DEFAULT_SESS_PLANS[3]] }));
    expect(noNote).not.toContain("비고");
  });

  it("훈련 회차에는 그 주(수~화) 날짜 범위를 찍고, 측정에는 안 찍는다", () => {
    const html = render(makeBoard({ sessPlans: [PB_DEFAULT_SESS_PLANS[0], PB_DEFAULT_SESS_PLANS[12]] }));
    expect(html).toContain("11/4~11/10");
    expect(html).not.toContain("2/3~2/9");
  });

  it("안내 문구가 회원 「훈련」 탭과 이어진다는 걸 말한다", () => {
    const html = render(makeBoard());
    expect(html).toContain("회원 「훈련」 탭에 그대로 보여요");
  });

  it("비어 있으면 「기본 훈련표 불러오기」를 세운다(총 회차 13)", () => {
    const html = render(makeBoard());
    expect(html).toContain("기본 훈련표 불러오기");
    expect(html).toContain("훈련표 0/13회차");
  });

  it("총 회차가 기본(13)과 다르면 서버가 거절하므로 버튼을 미리 막고 이유를 말한다", () => {
    const html = render(makeBoard({ cfg: { ...PB_CLASS_DEFAULT_CFG, totSessCnt: 10 } }));
    expect(html).toContain("불러올 수 없어요");
    // 불러오기 버튼은 disabled
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>기본 훈련표 불러오기/);
  });

  it("모든 회차가 찼으면 「회차 추가」를 막는다", () => {
    const full = render(makeBoard({ sessPlans: PB_DEFAULT_SESS_PLANS }));
    expect(full).toMatch(/<button[^>]*disabled=""[^>]*>[^<]*<svg[^>]*>.*?<\/svg>회차 추가/);
    const some = render(makeBoard({ sessPlans: PB_DEFAULT_SESS_PLANS.slice(0, 3) }));
    expect(some).not.toMatch(/<button[^>]*disabled=""[^>]*>[^<]*<svg[^>]*>.*?<\/svg>회차 추가/);
  });
});
