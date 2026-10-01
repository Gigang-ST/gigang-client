import { describe, expect, it } from "vitest";

import {
  ANTIPODE_KM,
  RECAP_STOPS,
  buildMileageRecap,
  drawMemoryIndex,
  formatHourLabel,
  formatTimes,
  heatLevel,
  isRecapLedeWindow,
  pickMemberMemory,
  pickRecapPageExtras,
  pickTeaserFaces,
  toRecapTeaser,
  type RecapActRow,
  type RecapInput,
  type RecapParticipant,
} from "@/lib/mileage-recap";

const EVENT = {
  evt_id: "evt",
  evt_nm: "마일리지런 시즌4",
  stt_dt: "2026-05-01",
  end_dt: "2026-09-30",
};

function person(id: string, name: string, del = false): RecapParticipant {
  return { prt_id: `p-${id}`, mem_id: id, mem_nm: name, avatar_url: null, del_yn: del };
}

let actSeq = 0;

/** created_at은 KST 시각으로 받아 넣는다(DB timestamptz와 같은 모양) */
function act(
  who: string,
  date: string,
  opts: Partial<Omit<RecapActRow, "prt_id" | "act_dt">> & { kstHour?: number } = {},
): RecapActRow {
  const { kstHour = 21, ...rest } = opts;
  const hh = String(kstHour).padStart(2, "0");
  return {
    act_id: `${who}-${date}-${++actSeq}`,
    prt_id: `p-${who}`,
    act_dt: date,
    sprt_enm: "RUNNING",
    dst_km: 10,
    elv_m: 0,
    base_mlg: 10,
    final_mlg: 10,
    aply_mults: [],
    review: null,
    photo_url: null,
    created_at: `${date}T${hh}:00:00+09:00`,
    ...rest,
  };
}

const mult = (name: string, val = 1.2) => [{ mult_id: "m", mult_nm: name, mult_val: val }];

function input(over: Partial<RecapInput> = {}): RecapInput {
  return {
    event: EVENT,
    participants: [person("a", "가나다"), person("b", "라마바"), person("c", "사아자")],
    acts: [],
    snaps: [],
    bulkActIds: [],
    ...over,
  };
}

describe("buildMileageRecap — 집계 창", () => {
  it("실제 프로젝트 기간(시작일 ~ 종료일)만 센다 — 연습월은 뺀다", () => {
    const r = buildMileageRecap(input());
    expect(r.event.from).toBe("2026-05-01");
    expect(r.event.days).toBe(153);
    expect(r.months.map((m) => m.label)).toEqual(["5월", "6월", "7월", "8월", "9월"]);
  });

  it("창 밖 기록·참가자 아닌 기록은 합계에서 빠진다", () => {
    const r = buildMileageRecap(
      input({
        acts: [
          act("a", "2026-03-31"),
          // 연습월(시작 전 달) 기록도 뺀다
          act("a", "2026-04-30", { dst_km: 99, photo_url: "practice", review: "연습월 기록이에요" }),
          act("a", "2026-10-01"),
          act("zz", "2026-05-01"),
          act("a", "2026-05-01"),
        ],
      }),
    );
    expect(r.totals.acts).toBe(1);
    expect(r.totals.km).toBe(10);
  });
});

describe("buildMileageRecap — 거리는 실제로 움직인 거리", () => {
  it("보정·배율 없이 dst_km를 그대로 더한다 (러닝 10 + 트레일 4 + 수영 1 = 15)", () => {
    const r = buildMileageRecap(
      input({
        acts: [
          act("a", "2026-05-01", { dst_km: 10, final_mlg: 24, aply_mults: mult("추석", 2) }),
          act("a", "2026-05-02", { sprt_enm: "TRAIL", dst_km: 4, elv_m: 500, final_mlg: 9 }),
          act("a", "2026-05-03", { sprt_enm: "SWIMMING", dst_km: "1", final_mlg: 3 }),
        ],
      }),
    );
    expect(r.totals.km).toBe(15);
    expect(r.journey.km).toBe(15);
    expect(r.members["a"].km).toBe(15);
  });

  it("칼로리는 배율을 빼고 종목 보정만 한 기본 마일리지로 잡는다", () => {
    const withBoost = buildMileageRecap(
      input({
        acts: [act("a", "2026-05-01", { dst_km: 100, final_mlg: 200, aply_mults: mult("추석", 2) })],
      }),
    );
    const plain = buildMileageRecap(
      input({ acts: [act("a", "2026-05-01", { dst_km: 100, final_mlg: 100 })] }),
    );
    const chicken = (r: typeof plain) => r.equivalents.find((e) => e.key === "chicken")!;
    expect(chicken(withBoost).times).toBe(chicken(plain).times);
    // 100km × 65kcal ÷ 2,000 = 3.25마리
    expect(chicken(plain).times).toBeCloseTo(3.25);
    expect(chicken(plain).suffix).toBe("마리");
  });

  it("몰아 올린 기록은 합계엔 남고 '한 번에 뛴 거리'(장거리왕·가장 멀리 간 날)에서만 빠진다", () => {
    const bulkRun = { ...act("a", "2026-09-19", { dst_km: 63 }), act_id: "bulk-63" };
    const r = buildMileageRecap(
      input({
        acts: [bulkRun, act("b", "2026-05-16", { dst_km: 53.01 }), act("a", "2026-05-02", { dst_km: 21 })],
        bulkActIds: ["bulk-63"],
      }),
    );
    expect(r.totals.km).toBeCloseTo(137.01);
    expect(r.awards.find((x) => x.key === "longest")?.winners.map((w) => w.person.mem_nm)).toEqual([
      "라마바",
    ]);
    expect(r.members["a"].bestDay?.km).toBe(21);
    expect(r.members["a"].km).toBe(84);
  });

  it("나의 시즌 '가장 멀리 간 날'도 실제 거리로 고른다(배율로 부푼 날이 아니라)", () => {
    const r = buildMileageRecap(
      input({
        acts: [
          act("a", "2026-05-01", { dst_km: 10, final_mlg: 40, aply_mults: mult("추석", 4) }),
          act("a", "2026-05-02", { dst_km: 21, final_mlg: 21 }),
        ],
      }),
    );
    expect(r.members["a"].bestDay).toMatchObject({ act_dt: "2026-05-02", km: 21 });
  });
});

describe("buildMileageRecap — 크루 연속·달력·도장", () => {
  it("누군가 한 명이라도 달린 날이 이어지면 크루 연속이다", () => {
    const r = buildMileageRecap(
      input({
        acts: [
          act("a", "2026-05-01"),
          act("b", "2026-05-02"),
          act("c", "2026-05-03"),
          act("a", "2026-05-05"),
        ],
      }),
    );
    expect(r.totals.activeDays).toBe(4);
    expect(r.totals.teamStreak).toBe(3);
  });

  it("최다일이 농도 4, 빈 날은 0", () => {
    const r = buildMileageRecap(
      input({
        acts: [
          act("a", "2026-05-01"),
          act("b", "2026-05-01"),
          act("c", "2026-05-01"),
          act("a", "2026-05-02"),
        ],
      }),
    );
    const may = r.months.find((m) => m.label === "5월")!;
    expect(may.days[0]).toMatchObject({ date: "2026-05-01", acts: 3, level: 4 });
    expect(may.days[1].level).toBe(2);
    expect(may.days[2].level).toBe(0);
    expect(r.busiestDay).toMatchObject({ date: "2026-05-01", acts: 3, people: 3 });
  });

  it("누적 거리가 도시 거리를 처음 넘긴 날에 도장이 찍힌다", () => {
    const busan = RECAP_STOPS[0];
    expect(busan.city).toBe("부산");
    const r = buildMileageRecap(
      input({
        acts: [
          act("a", "2026-05-01", { dst_km: busan.km - 1 }),
          act("b", "2026-05-02", { dst_km: 1 }),
        ],
      }),
    );
    expect(r.journey.stops[0].reachedOn).toBe("2026-05-02");
    expect(r.journey.stops[1].reachedOn).toBeNull();
  });

  it("마지막 도장은 지구 반대편(둘레의 절반)이다", () => {
    expect(RECAP_STOPS.at(-1)).toMatchObject({ key: "antipode", km: ANTIPODE_KM });
    expect(ANTIPODE_KM).toBe(20015);
    const kms = RECAP_STOPS.map((s) => s.km);
    expect([...kms].sort((a, b) => a - b)).toEqual(kms);
  });
});

describe("buildMileageRecap — 추억(사진+한마디)", () => {
  it("같은 기록의 사진과 한마디는 한 장이고, 한마디만 있는 것도 싣는다", () => {
    const r = buildMileageRecap(
      input({
        acts: [
          act("a", "2026-05-01", { photo_url: "p1", review: "한강 노을 최고" }),
          act("b", "2026-05-02", { review: "비 맞으면서 뛰었다" }),
          act("c", "2026-05-03", { photo_url: "p2" }),
        ],
      }),
    );
    expect(r.memories).toEqual([
      expect.objectContaining({ photo_url: "p1", text: "한강 노을 최고" }),
      expect.objectContaining({ photo_url: null, text: "비 맞으면서 뛰었다" }),
      expect.objectContaining({ photo_url: "p2", text: null }),
    ]);
  });

  it("한마디만 있는 짧은 말·워치 요약 붙여넣기는 추억에서 뺀다(개수엔 든다)", () => {
    const r = buildMileageRecap(
      input({
        acts: [
          act("a", "2026-05-01", { review: "굿" }),
          act("a", "2026-05-02", {
            review: "야외 달리기 | 08:47–09:16 | 운동 0:29:01 | 활동/총 276/319 CAL",
          }),
          act("a", "2026-05-03", { review: "  한강 바람이 시원했다  " }),
          // 사진이 있으면 짧은 말도 같이 싣는다
          act("a", "2026-05-04", { review: "굿", photo_url: "p" }),
        ],
      }),
    );
    expect(r.totals.reviews).toBe(4);
    expect(r.memories.map((m) => m.text)).toEqual(["한강 바람이 시원했다", "굿"]);
  });

  it("사람별 추억 위치를 모으고, 그중 사진 있는 걸 먼저 고른다", () => {
    const r = buildMileageRecap(
      input({
        acts: [
          act("a", "2026-05-01", { review: "첫 기록이다아" }),
          act("a", "2026-05-02", { photo_url: "pa" }),
        ],
      }),
    );
    expect(r.memoryIdxByMember["a"]).toHaveLength(2);
    expect(pickMemberMemory(r, "a", 7)?.photo_url).toBe("pa");
    expect(pickMemberMemory(r, "b", 0)).toBeNull();
  });

  it("추억 넘기기 — 안 본 장에서, 사진 있는 장을 전부 먼저 뽑는다", () => {
    const r = buildMileageRecap(
      input({
        acts: [
          act("a", "2026-05-01", { photo_url: "p1" }),
          act("a", "2026-05-02", { review: "한마디만 있는 날" }),
          act("a", "2026-05-03", { photo_url: "p2" }),
        ],
      }),
    );
    // 사진이 남아 있으면 rnd와 상관없이 사진 — p1(0)은 이미 봤으니 p2(2)
    expect(drawMemoryIndex(r.memories, new Set([0]), () => 0.99)).toBe(2);
    expect(r.memories[drawMemoryIndex(r.memories, new Set(), () => 0.99)].photo_url).not.toBeNull();
    // 사진을 다 봐야 한마디가 나온다
    expect(r.memories[drawMemoryIndex(r.memories, new Set([0, 2]), () => 0.1)].text).toBe(
      "한마디만 있는 날",
    );
    expect(drawMemoryIndex([], new Set())).toBe(-1);
  });

  it("페이지 랜덤 — 수상자 2명 이하만 한 장씩, 첫 장과 다음 장은 다르다", () => {
    const r = buildMileageRecap(
      input({
        acts: ["01", "02", "03"].flatMap((d) => [
          act("a", `2026-05-${d}`, { photo_url: `a${d}` }),
        ]),
      }),
    );
    const extras = pickRecapPageExtras(r, "a", () => 0.3);
    expect(extras.winnerMemories["photo:a"]?.photo_url).toMatch(/^a0/);
    expect(extras.myMemory?.person.mem_id).toBe("a");
    // 첫 장 + 미리 받을 장들은 서로 겹치지 않는다(3장뿐이라 나머지 둘)
    expect(new Set([extras.memoryStart, ...extras.memoryQueue]).size).toBe(3);
  });

  it("기념비 순간 — 첫 기록·N번째 기록·누적 거리 돌파를 그 기록의 주인공과 함께", () => {
    const r = buildMileageRecap(
      input({
        participants: [person("a", "가나다"), person("x", "탈퇴자", true)],
        acts: [
          act("a", "2026-05-01", { dst_km: 600 }),
          act("x", "2026-05-02", { dst_km: 500 }), // 1,100km — 1,000km 돌파는 탈퇴자의 기록
          act("a", "2026-05-03", { dst_km: 5000 }), // 6,100km — 5,000km 돌파
        ],
      }),
    );
    expect(r.milestones.map((m) => [m.label, m.date, m.person?.mem_nm ?? null])).toEqual([
      ["시즌 첫 기록", "2026-05-01", "가나다"],
      ["1,000km 돌파", "2026-05-02", null],
      ["5,000km 돌파", "2026-05-03", "가나다"],
    ]);
  });

  it("마지막 날 — 기록이 있던 마지막 날의 인원과 추억", () => {
    const r = buildMileageRecap(
      input({
        acts: [
          act("a", "2026-09-29", { review: "내일이 마지막!" }),
          act("a", "2026-09-30", { review: "마런 즐거웠다!" }),
          act("b", "2026-09-30", { photo_url: "last" }),
        ],
      }),
    );
    expect(r.lastDay?.date).toBe("2026-09-30");
    expect(r.lastDay?.people).toBe(2);
    expect(r.lastDay?.memories.map((m) => m.text ?? m.photo_url)).toEqual([
      "마런 즐거웠다!",
      "last",
    ]);
  });
});

describe("buildMileageRecap — 시상식", () => {
  it("동점이면 공동 수상(이름순)", () => {
    const r = buildMileageRecap(
      input({
        acts: ["b", "a"].flatMap((w) =>
          ["01", "02", "03"].map((d) => act(w, `2026-05-${d}`, { photo_url: `${w}${d}` })),
        ),
      }),
    );
    const photo = r.awards.find((a) => a.key === "photo")!;
    expect(photo.winners.map((w) => w.person.mem_nm)).toEqual(["가나다", "라마바"]);
  });

  it("기준에 못 미치면 그 상은 아예 없다(올빼미 1번은 상이 아니다)", () => {
    const r = buildMileageRecap(input({ acts: [act("a", "2026-05-01", { kstHour: 1 })] }));
    expect(r.awards.find((a) => a.key === "owl")).toBeUndefined();
  });

  it("입력 시각은 KST로 판정한다", () => {
    const r = buildMileageRecap(
      input({
        acts: ["01", "02", "03"].map((d) => act("a", `2026-05-${d}`, { kstHour: 1 })),
      }),
    );
    expect(r.hours[1]).toBe(3);
    expect(r.awards.find((a) => a.key === "owl")?.winners[0].person.mem_nm).toBe("가나다");
    expect(r.peakHour).toBe(1);
  });

  it("탈퇴자는 합계엔 남고 시상·명단·추억에선 빠진다", () => {
    const r = buildMileageRecap(
      input({
        participants: [person("a", "가나다"), person("x", "탈퇴자", true)],
        acts: [
          act("x", "2026-05-01", { photo_url: "p", review: "탈퇴자의 긴 후기입니다" }),
          act("x", "2026-05-02", { photo_url: "p" }),
          act("x", "2026-05-03", { photo_url: "p" }),
          act("a", "2026-05-01"),
        ],
      }),
    );
    expect(r.totals.acts).toBe(4);
    expect(r.credits.map((p) => p.mem_nm)).toEqual(["가나다"]);
    expect(r.memories).toHaveLength(0);
    expect(r.awards.some((a) => a.winners.some((w) => w.person.mem_id === "x"))).toBe(false);
    // 인원수엔 든다(달리긴 했다) — 이름·얼굴만 안 부른다
    expect(toRecapTeaser(r).runners).toBe(2);
    expect(toRecapTeaser(r).faces.map((p) => p.mem_nm)).toEqual(["가나다"]);
  });

  it("참가 승인만 하고 한 번도 안 뛴 사람은 크레딧에 없다", () => {
    const r = buildMileageRecap(input({ acts: [act("a", "2026-05-01")] }));
    expect(r.totals.participants).toBe(3);
    expect(r.credits.map((p) => p.mem_nm)).toEqual(["가나다"]);
  });

  it("올클리어 — 참가한 정식 시즌 달을 전부 달성(반올림 달성 포함)", () => {
    const r = buildMileageRecap(
      input({
        acts: [act("a", "2026-05-01"), act("b", "2026-05-01")],
        snaps: [
          { prt_id: "p-a", base_dt: "2026-05-01", goal_mlg: 100, achv_mlg: 120 },
          { prt_id: "p-a", base_dt: "2026-06-01", goal_mlg: 110, achv_mlg: "109.96" },
          { prt_id: "p-b", base_dt: "2026-05-01", goal_mlg: 100, achv_mlg: 50 },
          // 연습월 스냅은 보지 않는다
          { prt_id: "p-b", base_dt: "2026-04-01", goal_mlg: 100, achv_mlg: 999 },
        ],
      }),
    );
    const allclear = r.awards.find((a) => a.key === "allclear")!;
    expect(allclear.winners).toEqual([
      { person: expect.objectContaining({ mem_nm: "가나다" }), sub: "2/2달" },
    ]);
  });

  it("칼각왕 — 해낸 달 중 목표를 가장 아슬아슬하게 넘긴 달, '모자랐다'는 말은 안 쓴다", () => {
    const r = buildMileageRecap(
      input({
        acts: [act("a", "2026-05-01"), act("b", "2026-05-01")],
        snaps: [
          { prt_id: "p-a", base_dt: "2026-05-01", goal_mlg: 200, achv_mlg: "199.96" },
          { prt_id: "p-b", base_dt: "2026-05-01", goal_mlg: 100, achv_mlg: "100.5" },
          // 미달성은 후보가 아니다(더 "가깝더라도")
          { prt_id: "p-c", base_dt: "2026-05-01", goal_mlg: 100, achv_mlg: "99.9" },
        ],
      }),
    );
    const razor = r.awards.find((a) => a.key === "razor")!;
    expect(razor.winners.map((w) => w.person.mem_nm)).toEqual(["가나다"]);
    expect(razor.value).toBe("199.96 / 200");
    expect(razor.caption).not.toMatch(/모자/);
  });

  it("칼각왕도 같은 차이면 공동 수상", () => {
    const r = buildMileageRecap(
      input({
        acts: [act("a", "2026-05-01"), act("b", "2026-05-01")],
        snaps: [
          { prt_id: "p-b", base_dt: "2026-05-01", goal_mlg: 100, achv_mlg: "100.2" },
          { prt_id: "p-a", base_dt: "2026-06-01", goal_mlg: 150, achv_mlg: "150.2" },
        ],
      }),
    );
    const razor = r.awards.find((a) => a.key === "razor")!;
    expect(razor.winners.map((w) => w.person.mem_nm)).toEqual(["가나다", "라마바"]);
  });

  it("거리 합의 부동소수 끝자리 차이는 동점으로 본다", () => {
    const swim = (w: string, d: string, km: number) =>
      act(w, `2026-05-${d}`, { sprt_enm: "SWIMMING", dst_km: km });
    const r = buildMileageRecap(
      input({
        acts: [
          swim("a", "01", 0.1),
          swim("a", "02", 0.2),
          swim("a", "03", 3),
          swim("b", "01", 0.3),
          swim("b", "03", 3),
        ],
      }),
    );
    // 0.1 + 0.2 + 3 = 3.3000000000000003 vs 0.3 + 3 = 3.3
    expect(r.awards.find((a) => a.key === "swim")!.winners).toHaveLength(2);
  });

  it("배수가 0.1번도 안 되면 캡션에 '0번'을 붙이지 않는다", () => {
    const tiny = buildMileageRecap(
      input({ acts: [act("a", "2026-05-01", { sprt_enm: "SWIMMING", dst_km: 1 })] }),
    );
    expect(tiny.awards.find((a) => a.key === "swim")!.caption).not.toMatch(/0번/);
    const big = buildMileageRecap(
      input({ acts: [act("a", "2026-05-01", { sprt_enm: "SWIMMING", dst_km: 53.2 })] }),
    );
    expect(big.awards.find((a) => a.key === "swim")!.caption).toContain("1.1번");
  });

  it("연속 출석왕은 그 구간 날짜를 함께 준다", () => {
    const dates = ["01", "02", "03", "04", "05", "06"].map((d) => `2026-05-${d}`);
    const r = buildMileageRecap(
      input({ acts: [act("a", "2026-04-20"), ...dates.map((d) => act("a", d))] }),
    );
    const streak = r.awards.find((a) => a.key === "streak")!;
    expect(streak.value).toBe("6일");
    expect(streak.winners[0].sub).toBe("5.1 ~ 5.6");
  });

  it("두탕왕 — 하루에 두 번 이상 기록한 날 수", () => {
    const days = ["01", "02", "03", "04", "05"];
    const r = buildMileageRecap(
      input({
        acts: days.flatMap((d) => [act("a", `2026-05-${d}`), act("a", `2026-05-${d}`)]),
      }),
    );
    expect(r.awards.find((a) => a.key === "double")).toMatchObject({ value: "5일" });
  });

  it("환상의 짝꿍 — 같은 날 둘 다 모임 배율이 붙은 날이 가장 많은 두 사람", () => {
    const days = ["01", "02", "03", "04", "05"];
    const r = buildMileageRecap(
      input({
        acts: [
          ...days.flatMap((d) => [
            act("b", `2026-05-${d}`, { aply_mults: mult("정기런!") }),
            act("a", `2026-05-${d}`, { aply_mults: mult("모임참석 (3명이상 참석자)") }),
          ]),
          // 모임 배율이 아닌 날은 안 센다
          act("c", "2026-05-01", { aply_mults: mult("추석 라스트팡", 2) }),
        ],
      }),
    );
    const buddy = r.awards.find((a) => a.key === "buddy")!;
    expect(buddy.value).toBe("5일");
    expect(buddy.winners.map((w) => w.person.mem_nm)).toEqual(["가나다", "라마바"]);
  });

  it("배율 이벤트마다 제일 많이 탄 사람을 붙인다", () => {
    const rain = mult("우중런", 1.5);
    const r = buildMileageRecap(
      input({
        acts: [
          act("a", "2026-07-10", { aply_mults: rain }),
          act("a", "2026-07-11", { aply_mults: rain }),
          act("b", "2026-07-11", { aply_mults: rain }),
          act("b", "2026-07-12", { aply_mults: "망가진 값" }),
        ],
      }),
    );
    expect(r.multipliers).toEqual([
      {
        name: "우중런",
        val: 1.5,
        uses: 3,
        people: 2,
        top: [{ person: expect.objectContaining({ mem_nm: "가나다" }), uses: 2 }],
      },
    ]);
  });

  it("나의 시즌 — 크루 몫·가장 먼 도시·받은 상", () => {
    const r = buildMileageRecap(
      input({
        acts: [
          act("a", "2026-05-01", { dst_km: 300 }),
          act("a", "2026-05-02", { dst_km: 100 }),
          act("b", "2026-05-01", { dst_km: 100 }),
        ],
      }),
    );
    const me = r.members["a"];
    expect(me.km).toBe(400);
    expect(me.crewShare).toBeCloseTo(0.8);
    expect(me.farthest?.city).toBe("부산");
    expect(r.members["b"].farthest).toBeNull();
    expect(r.members["c"].acts).toBe(0);
    expect(me.awardKeys).toContain("longest");
  });
});

describe("표시 헬퍼", () => {
  it("formatTimes — 10 미만은 소수 한 자리, 단위 바꾸기", () => {
    expect(formatTimes(2.86)).toBe("2.9번");
    expect(formatTimes(22.1)).toBe("22번");
    expect(formatTimes(679.6, "마리")).toBe("680마리");
  });

  it("formatHourLabel", () => {
    expect(formatHourLabel(0)).toBe("자정");
    expect(formatHourLabel(3)).toBe("새벽 3시");
    expect(formatHourLabel(12)).toBe("낮 12시");
    expect(formatHourLabel(22)).toBe("밤 10시");
  });

  it("heatLevel", () => {
    expect(heatLevel(0, 10)).toBe(0);
    expect(heatLevel(1, 10)).toBe(1);
    expect(heatLevel(10, 10)).toBe(4);
  });

  it("리드 창 — 종료 다음 날부터 30일", () => {
    expect(isRecapLedeWindow("2026-09-30", "2026-09-30")).toBe(false);
    expect(isRecapLedeWindow("2026-09-30", "2026-10-01")).toBe(true);
    expect(isRecapLedeWindow("2026-09-30", "2026-10-30")).toBe(true);
    expect(isRecapLedeWindow("2026-09-30", "2026-10-31")).toBe(false);
  });

  it("pickTeaserFaces — offset부터 돌려 n명", () => {
    const faces = ["a", "b", "c"].map((id) => ({ mem_id: id, mem_nm: id, avatar_url: null }));
    expect(pickTeaserFaces(faces, 4, 2).map((f) => f.mem_id)).toEqual(["b", "c"]);
    expect(pickTeaserFaces([], 1, 2)).toEqual([]);
  });

  it("toRecapTeaser — 지구 반대편 대비", () => {
    const r = buildMileageRecap(
      input({ acts: [act("a", "2026-05-01", { dst_km: ANTIPODE_KM / 2 })] }),
    );
    expect(toRecapTeaser(r).antipodeRatio).toBeCloseTo(0.5);
  });
});
