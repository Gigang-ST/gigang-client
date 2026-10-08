import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PB_DEFAULT_SESS_PLANS } from "@/lib/pb-class-plan";
import { buildSessSlots, type PbSessDraft } from "@/lib/pb-class-sessions";
import type { PbSession } from "@/lib/queries/pb-class";

import {
  hasBlockingError,
  rowIssues,
  SessOpenRowList,
  toRows,
} from "@/app/(info)/admin/mileage/pb-sess-open-rows";

// 프로젝트 시작일은 수요일(2026-12-02) — 1주차 수요일 = 12/2, 2주차 = 12/9
const EVT_STT = "2026-12-02";

const draft = (over: Partial<PbSessDraft> = {}): PbSessDraft => ({
  wkNo: 1,
  sessType: "TRAINING",
  gthrNm: "PB 클래스 1주차",
  date: "2026-12-02",
  time: "19:30",
  durMin: 90,
  locTxt: "",
  descTxt: "설명",
  ...over,
});

describe("공식훈련 벙 열기 — 줄 검증", () => {
  it("정상 줄은 오류도 경고도 없다", () => {
    const r = rowIssues(toRows([draft()])[0], EVT_STT);
    expect(r.errors).toEqual({ title: false, date: false, time: false });
    expect(r.warnings).toEqual([]);
  });

  it("빈 제목·날짜·시간은 오류이고 제출을 막는다", () => {
    const rows = toRows([draft({ gthrNm: " ", date: "", time: "" })]);
    expect(rowIssues(rows[0], EVT_STT).errors).toEqual({ title: true, date: true, time: true });
    expect(hasBlockingError(rows, EVT_STT)).toBe(true);
  });

  it("체크를 끈 줄은 오류가 있어도 막지 않는다", () => {
    const rows = toRows([draft({ gthrNm: "" })]).map((r) => ({ ...r, include: false }));
    expect(hasBlockingError(rows, EVT_STT)).toBe(false);
  });

  it("수요일이 아니면 경고만 한다(막지 않는다)", () => {
    const rows = toRows([draft({ date: "2026-12-03" })]);
    expect(rowIssues(rows[0], EVT_STT).warnings).toContain("수요일이 아니에요");
    expect(hasBlockingError(rows, EVT_STT)).toBe(false);
  });

  it("주차 기간을 벗어나면 경고한다", () => {
    const w = rowIssues(toRows([draft({ date: "2026-12-16" })])[0], EVT_STT).warnings;
    expect(w.some((m) => m.includes("1주차 기간"))).toBe(true);
  });
});

describe("공식훈련 벙 열기 — 한 주차만 열기(single)", () => {
  it("체크박스 없이 설명이 처음부터 펼쳐지고 장소 placeholder 가 예시를 보여 준다", () => {
    const html = renderToStaticMarkup(
      createElement(SessOpenRowList, {
        rows: toRows([draft({ descTxt: "기본 설명 문구" })]),
        evtSttDt: EVT_STT,
        plans: PB_DEFAULT_SESS_PLANS,
        single: true,
        onChange: () => {},
      }),
    );
    expect(html).not.toContain('role="checkbox"');
    expect(html).toContain("<textarea");
    expect(html).toContain("기본 설명 문구");
    expect(html).toContain("예: 양재시민의숲 농구장");
  });
});

describe("주차별 벙 열기 — 목록 칸", () => {
  const sess = (over: Partial<PbSession>): PbSession => ({ gthrId: "g", wkNo: 1, sessType: "TRAINING", ...over }) as PbSession;
  it("안 열린 주차는 자리로, 측정이 없으면 맨 끝에 측정 자리", () => {
    const slots = buildSessSlots([sess({ gthrId: "a", wkNo: 2 })], 3);
    expect(slots.map((s) => (s.kind === "open" ? s.key : `L${s.session.wkNo}`))).toEqual([
      "open:1",
      "L2",
      "open:3",
      "open:measure",
    ]);
  });
  it("측정이 연결돼 있으면 측정 자리는 없다", () => {
    const slots = buildSessSlots([sess({ gthrId: "m", wkNo: 4, sessType: "MEASURE" })], 3);
    expect(slots.filter((s) => s.kind === "open")).toHaveLength(3);
    expect(slots.at(-1)).toMatchObject({ kind: "linked" });
  });
});

describe("공식훈련 벙 열기 — 줄 렌더", () => {
  it("주차 라벨·훈련 종류 칩·기본값이 그려진다", () => {
    const html = renderToStaticMarkup(
      createElement(SessOpenRowList, {
        rows: toRows([draft(), draft({ wkNo: 13, sessType: "MEASURE", gthrNm: "10K 측정" })]),
        evtSttDt: EVT_STT,
        plans: PB_DEFAULT_SESS_PLANS,
        onChange: () => {},
      }),
    );
    expect(html).toContain("1주차");
    expect(html).toContain("10K 측정");
    expect(html).toContain('value="2026-12-02"');
    expect(html).toContain('value="19:30"');
    expect(html).toContain("설명 보기");
    expect(html).not.toContain("<textarea"); // 설명은 접힌 채 시작
  });
});
