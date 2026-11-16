import { describe, expect, it } from "vitest";

import type { CachedCmmCdRow } from "@/lib/queries/cmm-cd-cached";

import { adminRecordEventLabel } from "@/app/(info)/admin/records/record-event-label";

const rows: CachedCmmCdRow[] = [
  { cd_grp_cd: "COMP_SPRT_CD", cd: "road_run", cd_nm: "로드 런", sort_ord: 1 },
  { cd_grp_cd: "COMP_SPRT_CD", cd: "triathlon", cd_nm: "트라이애슬론", sort_ord: 3 },
  { cd_grp_cd: "TRI_EVT_CD", cd: "FULL", cd_nm: "풀", sort_ord: 1 },
];

describe("adminRecordEventLabel", () => {
  it("같은 FULL 이라도 철인과 마라톤이 갈린다(#581)", () => {
    expect(adminRecordEventLabel(rows, "triathlon", "FULL")).toBe("트라이애슬론 · FULL");
    expect(adminRecordEventLabel(rows, "road_run", "FULL")).toBe("로드 런 · FULL");
  });

  it("공통코드에 없는 스포츠는 코드 원문으로", () => {
    expect(adminRecordEventLabel(rows, "hyrox", "open")).toBe("hyrox · OPEN");
  });

  it("스포츠를 모르면 종목 코드만, 종목도 없으면 UNKNOWN", () => {
    expect(adminRecordEventLabel(rows, null, "HALF")).toBe("HALF");
    expect(adminRecordEventLabel(rows, null, "")).toBe("UNKNOWN");
  });
});
