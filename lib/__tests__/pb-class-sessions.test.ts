import { describe, expect, it } from "vitest";

import { PB_DEFAULT_SESS_PLANS } from "@/lib/pb-class-plan";
import {
  PB_SESS_DESC_CLOSING,
  buildMeasureDraft,
  buildSessDrafts,
  draftEndIso,
  draftStartIso,
  measurePlaceholderDate,
  pickDefaultPlace,
} from "@/lib/pb-class-sessions";
import { pbSessDraftsSchema } from "@/lib/validations/pb-class";

const STT = "2026-11-04"; // 수요일 = W1
const base = { evtSttDt: STT, totSessCnt: 13, plans: PB_DEFAULT_SESS_PLANS, linkedWkNos: [] as number[] };

describe("buildSessDrafts", () => {
  it("공식훈련 12주 분량을 기본값으로 만든다 (측정 제외)", () => {
    const d = buildSessDrafts(base);
    expect(d).toHaveLength(12);
    expect(d.every((x) => x.sessType === "TRAINING")).toBe(true);
    expect(d[0]).toMatchObject({
      wkNo: 1,
      date: "2026-11-04",
      time: "19:30",
      durMin: 90,
      locTxt: "",
      gthrNm: "PB 클래스 1주차 · 킥오프 + 5K 기록 측정",
    });
    expect(d[1].date).toBe("2026-11-11");
    expect(d[11].wkNo).toBe(12);
    expect(d[11].date).toBe("2027-01-20");
  });

  it("이미 연결된 주차는 건너뛴다", () => {
    const d = buildSessDrafts({ ...base, linkedWkNos: [1, 2, 13] });
    expect(d.map((x) => x.wkNo)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("기본값(시간·소요·장소)을 덮어쓸 수 있다", () => {
    const [d] = buildSessDrafts({ ...base, defaults: { time: "20:00", durMin: 60, locTxt: "여의도" } });
    expect(d).toMatchObject({ time: "20:00", durMin: 60, locTxt: "여의도" });
  });

  it("설명에 훈련 종류·제목·그룹별 내용·개인 훈련·마무리 문구가 들어간다", () => {
    const d = buildSessDrafts(base);
    expect(d[1].descTxt).toContain("파틀렉 · 파틀렉 24분 + 스트라이드");
    expect(d[1].descTxt).toContain("38~50분 그룹: ");
    expect(d[1].descTxt).toContain("첫 10K 그룹: 20분");
    expect(d[1].descTxt).toContain("개인 훈련: ");
    expect(d[1].descTxt.endsWith(PB_SESS_DESC_CLOSING)).toBe(true);
    // 첫 10K 줄은 easyTxt 가 없으면 빠진다
    expect(d[0].descTxt).not.toContain("첫 10K 그룹");
  });

  it("훈련표가 없어도 초안은 만들어진다", () => {
    const [d] = buildSessDrafts({ ...base, plans: [] });
    expect(d.gthrNm).toBe("PB 클래스 1주차");
    expect(d.descTxt).toBe(PB_SESS_DESC_CLOSING);
  });
});

describe("buildMeasureDraft", () => {
  it("주차는 날짜에서 계산한다", () => {
    const m = buildMeasureDraft({ evtSttDt: STT, plans: PB_DEFAULT_SESS_PLANS, date: "2027-01-27" });
    expect(m).toMatchObject({ wkNo: 13, sessType: "MEASURE", gthrNm: "PB 클래스 10K 기록 측정" });
    expect(m.descTxt).toContain("10K 기록 측정");
    expect(buildMeasureDraft({ evtSttDt: STT, plans: [], date: "2027-02-03" }).wkNo).toBe(14);
  });
});

describe("pickDefaultPlace / measurePlaceholderDate", () => {
  it("시작이 가장 늦은 벙의 장소를 고른다 (입력 순서 무관)", () => {
    expect(
      pickDefaultPlace([
        { sttAt: "2026-11-11T10:30:00+00:00", locTxt: "여의도" },
        { sttAt: "2026-11-18T10:30:00.000Z", locTxt: "양재시민의숲" },
        { sttAt: "2026-11-04T10:30:00Z", locTxt: "반포" },
      ]),
    ).toBe("양재시민의숲");
  });
  it("장소가 빈 벙은 건너뛰고, 하나도 없으면 빈 문자열", () => {
    expect(
      pickDefaultPlace([
        { sttAt: "2026-11-18T10:30:00Z", locTxt: " " },
        { sttAt: "2026-11-11T10:30:00Z", locTxt: null },
        { sttAt: "2026-11-04T10:30:00Z", locTxt: "반포" },
      ]),
    ).toBe("반포");
    expect(pickDefaultPlace([{ sttAt: "2026-11-04T10:30:00Z", locTxt: null }])).toBe("");
    expect(pickDefaultPlace([])).toBe("");
  });
  it("측정 자리표시자는 마지막 훈련 주차 다음 주 수요일, 초안 주차는 13", () => {
    const date = measurePlaceholderDate(STT, 13);
    expect(date).toBe("2027-01-27");
    const m = buildMeasureDraft({ evtSttDt: STT, plans: PB_DEFAULT_SESS_PLANS, date, defaults: { locTxt: "반포" } });
    expect(m).toMatchObject({ wkNo: 13, date, locTxt: "반포" });
  });
});

describe("draftStartIso / draftEndIso", () => {
  it("KST 날짜+시간을 UTC ISO로 바꾼다", () => {
    expect(draftStartIso({ date: "2026-11-04", time: "19:30" })).toBe("2026-11-04T10:30:00.000Z");
    expect(draftStartIso({ date: "2026-11-04", time: "00:30" })).toBe("2026-11-03T15:30:00.000Z");
  });
  it("종료는 시작 + durMin", () => {
    expect(draftEndIso({ date: "2026-11-04", time: "19:30", durMin: 90 })).toBe("2026-11-04T12:00:00.000Z");
  });
});

describe("pbSessDraftsSchema", () => {
  const ok = buildSessDrafts(base)[0];
  it("기본 초안은 통과", () => {
    expect(pbSessDraftsSchema.safeParse([ok]).success).toBe(true);
  });
  it("형식·범위 위반을 거른다", () => {
    expect(pbSessDraftsSchema.safeParse([{ ...ok, time: "25:00" }]).success).toBe(false);
    expect(pbSessDraftsSchema.safeParse([{ ...ok, date: "2026/11/04" }]).success).toBe(false);
    expect(pbSessDraftsSchema.safeParse([{ ...ok, durMin: 10 }]).success).toBe(false);
    expect(pbSessDraftsSchema.safeParse([{ ...ok, locTxt: "x".repeat(201) }]).success).toBe(false);
    expect(pbSessDraftsSchema.safeParse([]).success).toBe(false);
    expect(pbSessDraftsSchema.safeParse(Array(21).fill(ok)).success).toBe(false);
  });
});
