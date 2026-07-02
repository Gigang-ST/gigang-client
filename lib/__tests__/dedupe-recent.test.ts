import { describe, expect, it } from "vitest";

import {
  dedupeRecentGatherings,
  gatheringSignature,
  type RecentGathering,
} from "@/lib/gathering/dedupe-recent";

function make(overrides: Partial<RecentGathering> & { gthr_id: string }): RecentGathering {
  return {
    gthr_nm: "🔥 정기 기강런",
    gthr_type_enm: "regular",
    sprt_cd: "running",
    loc_txt: null,
    max_prt_cnt: null,
    desc_txt: null,
    stt_at: "2026-07-01T10:30:00Z",
    ...overrides,
  };
}

describe("gatheringSignature", () => {
  it("일시가 달라도 나머지 내용이 같으면 같은 시그니처", () => {
    const a = make({ gthr_id: "1", stt_at: "2026-07-01T10:30:00Z" });
    const b = make({ gthr_id: "2", stt_at: "2026-07-15T10:30:00Z" });
    expect(gatheringSignature(a)).toBe(gatheringSignature(b));
  });

  it("loc_txt null 과 빈 문자열은 동일하게 취급", () => {
    const a = make({ gthr_id: "1", loc_txt: null });
    const b = make({ gthr_id: "2", loc_txt: "" });
    expect(gatheringSignature(a)).toBe(gatheringSignature(b));
  });

  it("장소가 다르면 다른 시그니처", () => {
    const a = make({ gthr_id: "1", loc_txt: "여의도" });
    const b = make({ gthr_id: "2", loc_txt: "양재천" });
    expect(gatheringSignature(a)).not.toBe(gatheringSignature(b));
  });
});

describe("dedupeRecentGatherings", () => {
  it("내용 전체가 같은 모임은 가장 최근(첫) 것 하나만 남긴다", () => {
    // #1을 만들고 #2~#7을 복사한 시나리오: 모두 내용 동일
    const input = Array.from({ length: 7 }, (_, i) => make({ gthr_id: String(i + 1) }));
    const result = dedupeRecentGatherings(input);
    expect(result).toHaveLength(1);
    expect(result[0].gthr_id).toBe("1"); // 입력 최신순 첫 항목 유지
  });

  it("서로 다른 내용은 각각 남긴다", () => {
    const input = [
      make({ gthr_id: "1", loc_txt: "여의도" }),
      make({ gthr_id: "2", loc_txt: "양재천" }),
      make({ gthr_id: "3", loc_txt: "여의도" }), // #1과 중복
    ];
    const result = dedupeRecentGatherings(input);
    expect(result.map((g) => g.gthr_id)).toEqual(["1", "2"]);
  });

  it("중복 제거 후 limit(기본 8)개까지만 반환", () => {
    const input = Array.from({ length: 20 }, (_, i) =>
      make({ gthr_id: String(i), loc_txt: `장소${i}` }),
    );
    expect(dedupeRecentGatherings(input)).toHaveLength(8);
    expect(dedupeRecentGatherings(input, 3)).toHaveLength(3);
  });

  it("빈 배열은 빈 배열", () => {
    expect(dedupeRecentGatherings([])).toEqual([]);
  });
});
