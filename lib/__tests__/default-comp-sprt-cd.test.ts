import { describe, expect, it } from "vitest";

import { PREFERRED_COMP_SPRT_CD, defaultCompSprtCd } from "@/lib/comp-sprt-default";

/**
 * `cmmCdRowsForGrp(rows, "COMP_SPRT_CD")` 결과 모양 — `sort_ord` 순으로 이미 정렬된 목록.
 * 정렬은 *표시 순서*지 "흔한 종목" 순이 아니라는 게 이 함수가 존재하는 이유다.
 */
const ULTRA_FIRST = [
  { cd: "ultra", cd_nm: "울트라마라톤" },
  { cd: "road_run", cd_nm: "로드 러닝" },
  { cd: "trail_run", cd_nm: "트레일 러닝" },
  { cd: "triathlon", cd_nm: "철인3종" },
  { cd: "cycling", cd_nm: "사이클" },
];

describe("defaultCompSprtCd", () => {
  it("목록 첫 항목이 울트라여도 로드 러닝을 기본으로 켠다", () => {
    // 회귀: 캘린더 대회 추가 폼이 options[0]을 집어 울트라마라톤으로 열렸다.
    // 에러가 아니라 "기본값이 이상함"으로만 드러나 등록해 보기 전엔 아무도 모른다.
    expect(defaultCompSprtCd(ULTRA_FIRST)).toBe("road_run");
    expect(defaultCompSprtCd(ULTRA_FIRST)).toBe(PREFERRED_COMP_SPRT_CD);
  });

  it("정렬 순서가 어떻게 바뀌어도 결과가 같다(순서에 의존하지 않는다)", () => {
    // 공통코드 sort_ord를 운영에서 바꿔도 등록 폼 기본값이 따라 흔들리면 안 된다.
    const reversed = [...ULTRA_FIRST].reverse();
    expect(defaultCompSprtCd(reversed)).toBe("road_run");
  });

  it("로드 러닝 코드가 없으면 첫 항목으로 물러난다", () => {
    const noRoadRun = [
      { cd: "trail_run", cd_nm: "트레일 러닝" },
      { cd: "ultra", cd_nm: "울트라마라톤" },
    ];
    expect(defaultCompSprtCd(noRoadRun)).toBe("trail_run");
  });

  it("목록이 비면 빈 값 — 선택지에 없는 값을 켜 두지 않는다", () => {
    // Select가 목록에 없는 값을 들고 있으면 화면엔 빈칸인데 폼엔 값이 있는 상태가 된다.
    expect(defaultCompSprtCd([])).toBe("");
  });
});
