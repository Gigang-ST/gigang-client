import { describe, expect, it } from "vitest";

import {
  applyMyWaitOverride,
  attendButtonLabel,
  attendStateOf,
  sortWaitlist,
  waitConfirmCopy,
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

describe("attendButtonLabel — 만석은 막지 않고 대기로 잇는다", () => {
  it("참석 중이면 구간과 무관하게 참석 표시", () => {
    expect(attendButtonLabel("attending", false, false)).toBe("✅ 참석");
    expect(attendButtonLabel("attending", true, true)).toBe("✅ 참석");
  });

  it("대기 중이면 대기 취소", () => {
    expect(attendButtonLabel("waiting", true, false)).toBe("대기 취소");
  });

  it("미참석 + 만석이면 대기 신청 — '인원 마감'으로 막지 않는다", () => {
    expect(attendButtonLabel("none", true, false)).toBe("대기 신청");
  });

  it("미참석 + 자리 있으면 참석하기", () => {
    expect(attendButtonLabel("none", false, false)).toBe("참석하기");
  });

  it("선착순 구간에서 만석이면 '대기'라고 부르지 않는다 — 빈 자리 알림 요청", () => {
    expect(attendButtonLabel("none", true, true)).toBe("빈 자리 알림 요청");
  });

  it("선착순 구간에서 신청 중이면 알림 요청 취소", () => {
    expect(attendButtonLabel("waiting", true, true)).toBe("알림 요청 취소");
  });

  it("선착순 구간이라도 자리가 있으면 참석하기 — 알림을 요청할 이유가 없다", () => {
    expect(attendButtonLabel("none", false, true)).toBe("참석하기");
  });

  it("선착순 구간에 신청해 둔 사람도 자리가 나면 참석하기 — 자동 승급이 없다", () => {
    expect(attendButtonLabel("waiting", false, true)).toBe("참석하기");
  });
});

describe("waitHintText — 대기 중에는 '내가 취소해야 한다'가 늘 보인다", () => {
  it("대기 중이면 순번과 자동 확정을 함께 말한다", () => {
    expect(waitHintText("waiting", 3, 5, false)).toBe("대기 3번 · 자리 나면 자동 확정");
  });

  it("대기 중인데 순번을 아직 모르면(낙관적 업데이트 직후) 숫자를 지어내지 않는다", () => {
    expect(waitHintText("waiting", null, 5, false)).toBe("대기 중");
  });

  it("미참석 + 대기자가 있으면 인원을 말한다", () => {
    expect(waitHintText("none", null, 5, false)).toBe("현재 5명 대기 중");
  });

  it("미참석 + 대기자가 없으면 아무 말도 안 한다", () => {
    expect(waitHintText("none", null, 0, false)).toBeNull();
  });

  it("참석 중이면 대기 얘기를 하지 않는다", () => {
    expect(waitHintText("attending", null, 5, false)).toBeNull();
  });

  it("선착순 구간에서 신청 중이면 순번을 말하지 않는다 — 순번이 없다", () => {
    expect(waitHintText("waiting", 3, 5, true)).toBe("빈 자리가 나면 알려드려요");
  });

  it("선착순 구간에서 미신청이면 대기 인원도 말하지 않는다 — 버튼이 이미 말하고 있다", () => {
    expect(waitHintText("none", null, 5, true)).toBeNull();
  });
});

describe("waitConfirmCopy — 누르기 전에 무슨 일이 일어나는지 알린다", () => {
  it("2시간 전까지: 자동 참석 사실 → 경고 순으로 네 줄", () => {
    const copy = waitConfirmCopy(false);
    expect(copy.title).toBe("대기 신청할까요?");
    expect(copy.confirmLabel).toBe("대기 신청");
    expect(copy.lines).toEqual([
      "참석자가 취소하면 순번대로 자동 참석됩니다.",
      "참석이 어려우면 미리 대기를 취소해주세요.",
      "시작 2시간 전부터는 대기 순번이 없고 선착순으로 바뀝니다.",
      "이후 빈 자리가 나면 알림을 보내드리니 직접 참석해주세요.",
    ]);
  });

  it("경고는 둘째 줄이다 — 화면이 이 줄만 굵게 처리한다", () => {
    expect(waitConfirmCopy(false).lines[1]).toContain("미리 대기를 취소");
  });

  it("선착순 구간: 알림 요청이라는 것만 두 줄로", () => {
    const copy = waitConfirmCopy(true);
    expect(copy.title).toBe("빈 자리 알림을 요청할까요?");
    expect(copy.confirmLabel).toBe("알림 요청");
    expect(copy.lines).toEqual([
      "지금은 순번 없이 선착순입니다.",
      "빈 자리가 나면 알림을 보내드립니다.",
    ]);
  });

  it("선착순 구간 문구에는 '대기'라는 말이 없다 — 순번을 기대하게 만들지 않는다", () => {
    const copy = waitConfirmCopy(true);
    expect([copy.title, ...copy.lines, copy.confirmLabel].join(" ")).not.toContain("대기");
  });
});

describe("applyMyWaitOverride — 토글 뒤 재조회 없이 내 대기 행만 명단에 얹는다", () => {
  const LIST = [E("a", "2026-09-10T01:00:00Z"), E("me", "2026-09-10T02:00:00Z"), E("b", "2026-09-10T03:00:00Z")];

  it("얹을 게 없으면(undefined) 조회 결과를 그대로 쓴다", () => {
    expect(applyMyWaitOverride(LIST, "me", undefined)).toBe(LIST);
  });

  it("대기 취소(null)면 나만 뺀다", () => {
    expect(applyMyWaitOverride(LIST, "me", null).map((e) => e.mem_id)).toEqual(["a", "b"]);
  });

  it("대기 신청(값)이면 나를 넣는다 — 방금 줄 섰으니 맨 뒤 순번이다", () => {
    const out = applyMyWaitOverride([E("a", "2026-09-10T01:00:00Z")], "me", E("me", "2026-09-10T05:00:00Z"));
    expect(out.map((e) => e.mem_id)).toEqual(["a", "me"]);
    expect(waitRankOf(out, "me")).toBe(2);
  });

  it("이미 명단에 있으면 중복으로 넣지 않고 교체한다", () => {
    const out = applyMyWaitOverride(LIST, "me", E("me", "2026-09-10T09:00:00Z"));
    expect(out.filter((e) => e.mem_id === "me")).toHaveLength(1);
    expect(out).toHaveLength(3);
  });

  it("비로그인(memId 없음)이면 아무것도 바꾸지 않는다", () => {
    expect(applyMyWaitOverride(LIST, null, null)).toBe(LIST);
  });

  it("원본 배열을 바꾸지 않는다", () => {
    applyMyWaitOverride(LIST, "me", null);
    expect(LIST.map((e) => e.mem_id)).toEqual(["a", "me", "b"]);
  });
});
