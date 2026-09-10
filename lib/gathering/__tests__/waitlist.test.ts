import { describe, expect, it } from "vitest";

import {
  attendButtonLabel,
  attendStateOf,
  sortWaitlist,
  waitHintText,
  waitRankOf,
} from "@/lib/gathering/waitlist";

const E = (mem_id: string, wait_at: string) => ({ mem_id, wait_at });

describe("sortWaitlist — 순번은 wait_at 오름차순", () => {
  it("wait_at 이 이른 사람이 앞이다", () => {
    const sorted = sortWaitlist([
      E("c", "2026-09-10T03:00:00Z"),
      E("a", "2026-09-10T01:00:00Z"),
      E("b", "2026-09-10T02:00:00Z"),
    ]);
    expect(sorted.map((e) => e.mem_id)).toEqual(["a", "b", "c"]);
  });

  it("원본 배열을 변형하지 않는다", () => {
    const input = [E("b", "2026-09-10T02:00:00Z"), E("a", "2026-09-10T01:00:00Z")];
    sortWaitlist(input);
    expect(input.map((e) => e.mem_id)).toEqual(["b", "a"]);
  });

  it("wait_at 이 같으면 mem_id 로 안정적으로 가른다(렌더 순서가 매번 흔들리지 않게)", () => {
    const sorted = sortWaitlist([E("b", "2026-09-10T01:00:00Z"), E("a", "2026-09-10T01:00:00Z")]);
    expect(sorted.map((e) => e.mem_id)).toEqual(["a", "b"]);
  });
});

describe("waitRankOf — 1-based 순번", () => {
  const list = [
    E("a", "2026-09-10T01:00:00Z"),
    E("b", "2026-09-10T02:00:00Z"),
    E("c", "2026-09-10T03:00:00Z"),
  ];

  it("맨 앞은 1번이다", () => {
    expect(waitRankOf(list, "a")).toBe(1);
  });

  it("정렬되지 않은 입력이 와도 wait_at 기준으로 센다", () => {
    expect(waitRankOf([list[2], list[0], list[1]], "b")).toBe(2);
  });

  it("목록에 없으면 null 이다", () => {
    expect(waitRankOf(list, "zzz")).toBeNull();
  });

  it("빈 목록이면 null 이다", () => {
    expect(waitRankOf([], "a")).toBeNull();
  });
});

describe("attendStateOf", () => {
  it("참석 중이면 attending — 대기 플래그가 같이 와도 참석이 이긴다", () => {
    expect(attendStateOf({ attending: true, waiting: true })).toBe("attending");
  });

  it("대기 중이면 waiting", () => {
    expect(attendStateOf({ attending: false, waiting: true })).toBe("waiting");
  });

  it("둘 다 아니면 none", () => {
    expect(attendStateOf({ attending: false, waiting: false })).toBe("none");
  });
});

describe("attendButtonLabel", () => {
  it("참석 중이면 참석 표시", () => {
    expect(attendButtonLabel("attending", false)).toBe("✅ 참석");
  });

  it("대기 중이면 대기 취소", () => {
    expect(attendButtonLabel("waiting", true)).toBe("대기 취소");
  });

  it("미참석 + 만석이면 대기 신청 — '인원 마감'으로 막지 않는다", () => {
    expect(attendButtonLabel("none", true)).toBe("대기 신청");
  });

  it("미참석 + 자리 있으면 참석하기", () => {
    expect(attendButtonLabel("none", false)).toBe("참석하기");
  });
});

describe("waitHintText", () => {
  it("대기 중이면 내 순번을 말한다", () => {
    expect(waitHintText("waiting", 3, 5)).toBe("대기 3번");
  });

  it("대기 중인데 순번을 아직 모르면(낙관적 업데이트 직후) 순번 없이 말한다", () => {
    expect(waitHintText("waiting", null, 5)).toBe("대기 중");
  });

  it("미참석 + 대기자가 있으면 인원을 말한다", () => {
    expect(waitHintText("none", null, 5)).toBe("현재 5명 대기 중");
  });

  it("미참석 + 대기자가 없으면 아무 말도 안 한다", () => {
    expect(waitHintText("none", null, 0)).toBeNull();
  });

  it("참석 중이면 대기 얘기를 하지 않는다", () => {
    expect(waitHintText("attending", null, 5)).toBeNull();
  });
});
