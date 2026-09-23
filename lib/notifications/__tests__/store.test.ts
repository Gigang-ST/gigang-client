import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  appendNotifications,
  getCursor,
  PAGE_SIZE,
  resetNotifications,
  setNotifications,
  useHasMore,
  useNotifications,
} from "@/lib/notifications/store";
import type { Notification } from "@/lib/queries/notification";

vi.mock("react", () => ({ useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot() }));

/**
 * `crt_at` 내림차순(최신이 앞)으로 세운 가짜 목록.
 *
 * `seq`가 클수록 최신이다. 병합은 시각이 아니라 **자리**로 경계를 잡으므로, 이 목록이
 * 실제와 같은 최신순을 유지하는 것이 판정의 전제다. `crt_at`은 커서 확인에만 쓴다.
 */
function page(seqs: number[]): Notification[] {
  return seqs.map((seq) => ({
    noti_id: `n${seq}`,
    read_yn: false,
    // seq를 시:분으로 편다 — 날짜 칸에 그대로 넣으면 세 자리 seq가 `2026-09-100`이 된다.
    crt_at: `2026-09-01T${String(Math.floor(seq / 60)).padStart(2, "0")}:${String(seq % 60).padStart(2, "0")}:00Z`,
  })) as unknown as Notification[];
}

/** 훅을 부르므로 이름도 훅 규칙(`use*`)을 따른다 — `react-hooks/rules-of-hooks`. */
const useIds = () => useNotifications().map((n) => n.noti_id);
/** seq 내림차순 한 장 — `from`부터 아래로 `count`개 */
const desc = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => from - i);

describe("알림 목록 첫 장 병합", () => {
  beforeEach(() => resetNotifications());

  // 통째로 갈아끼우던 시절엔 60건까지 내려 읽던 중 복귀·푸시 조회가 끼면
  // 목록이 20건으로 접히면서 읽던 자리를 잃었다.
  it("새 첫 장을 받아도 무한스크롤로 받아 둔 뒷장이 남는다", () => {
    setNotifications(page(desc(100, PAGE_SIZE)));
    appendNotifications(page(desc(100 - PAGE_SIZE, PAGE_SIZE)));
    expect(useIds()).toHaveLength(PAGE_SIZE * 2);

    // 새 알림 2건이 도착한 뒤의 첫 장 — 뒤로 밀린 2건은 뒷장 몫이 된다.
    setNotifications(page([102, 101, ...desc(100, PAGE_SIZE - 2)]));

    expect(useIds()).toHaveLength(PAGE_SIZE * 2 + 2);
    expect(useIds().slice(0, 3)).toEqual(["n102", "n101", "n100"]);
    // 중복도 구멍도 없이 이어진다.
    expect(new Set(useIds()).size).toBe(useIds().length);
    expect(useIds().at(-1)).toBe(`n${100 - PAGE_SIZE * 2 + 1}`);
    // 커서는 목록 끝(뒷장의 마지막)이라야 다음 장이 이어서 온다.
    expect(getCursor()).toBe(page([100 - PAGE_SIZE * 2 + 1])[0].crt_at);
  });

  // 첫 장이 꽉 안 찼으면 서버에 그게 전부다 — 들고 있던 뒷장은 지워진 것이라
  // 남기면 화면에만 있는 유령이 된다.
  it("첫 장이 꽉 차지 않으면 뒷장을 버리고 갈아끼운다", () => {
    setNotifications(page(desc(100, PAGE_SIZE)));
    appendNotifications(page(desc(100 - PAGE_SIZE, PAGE_SIZE)));

    setNotifications(page([100, 99, 98]));

    expect(useIds()).toEqual(["n100", "n99", "n98"]);
    expect(useHasMore()).toBe(false);
  });

  // 자리를 비운 사이 한 장 넘게 쌓이면 새 첫 장과 기존 목록이 안 겹친다. 그대로 이으면
  // 가운데가 빈 목록이 되고, 빠진 알림은 스크롤해도 영영 안 나온다.
  it("새 첫 장이 기존 목록과 겹치지 않으면 이어붙이지 않는다", () => {
    setNotifications(page(desc(100, PAGE_SIZE)));
    appendNotifications(page(desc(100 - PAGE_SIZE, PAGE_SIZE)));

    // 100보다 새로운 알림이 한 장을 꽉 채울 만큼 쌓였다 — 겹치는 항목이 하나도 없다.
    setNotifications(page(desc(130, PAGE_SIZE)));

    expect(useIds()).toHaveLength(PAGE_SIZE);
    expect(useIds().at(-1)).toBe(`n${130 - PAGE_SIZE + 1}`);
    expect(useHasMore()).toBe(true);
  });

  // 첫 장 안에서 지워진 건 사라져야 한다 — 그 구간은 이 조회가 정본이다.
  it("첫 장에서 사라진 알림은 뒷장을 살려도 되살아나지 않는다", () => {
    setNotifications(page(desc(100, PAGE_SIZE)));
    appendNotifications(page(desc(100 - PAGE_SIZE, PAGE_SIZE)));

    // n100이 삭제돼 아래에서 한 건이 올라온 첫 장.
    setNotifications(page(desc(99, PAGE_SIZE)));

    expect(useIds()).not.toContain("n100");
    expect(useIds()).toHaveLength(PAGE_SIZE * 2 - 1);
    expect(new Set(useIds()).size).toBe(useIds().length);
  });

  // 뒷장을 살린 조회는 그 **뒤에** 더 있는지를 답하지 않는다 — 그때 판정한 값이 남아야 한다.
  it("끝까지 받아 둔 목록은 재조회 뒤에도 끝인 채로 남는다", () => {
    setNotifications(page(desc(100, PAGE_SIZE)));
    appendNotifications(page(desc(100 - PAGE_SIZE, 5)));
    expect(useHasMore()).toBe(false);

    setNotifications(page([101, ...desc(100, PAGE_SIZE - 1)]));

    expect(useHasMore()).toBe(false);
    expect(useIds()).toHaveLength(PAGE_SIZE + 5 + 1);
  });

  it("첫 진입은 예전처럼 그대로 채운다", () => {
    setNotifications(page(desc(100, PAGE_SIZE)));
    expect(useIds()).toHaveLength(PAGE_SIZE);
    expect(useHasMore()).toBe(true);
    expect(getCursor()).toBe(page([100 - PAGE_SIZE + 1])[0].crt_at);
  });
});
