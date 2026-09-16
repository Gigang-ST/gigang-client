import { describe, expect, it } from "vitest";

import { PRESENCE_RENDER_LIMIT, pickVisiblePresence } from "@/lib/presence/pick";

/** 테스트용 접속자 — 선별은 `mem_id`만 보므로 나머지는 필요 없다 */
function p(mem_id: string) {
  return { mem_id };
}

/** "a","b","c",… n명 */
function many(n: number) {
  return Array.from({ length: n }, (_, i) =>
    p(String.fromCharCode(97 + i).repeat(3)),
  );
}

describe("pickVisiblePresence", () => {
  it("상한 이하면 전원을 그린다", () => {
    const list = many(5);
    expect(pickVisiblePresence(list, null)).toHaveLength(5);
  });

  it("상한을 넘으면 상한만큼만 그린다", () => {
    const list = many(20);
    expect(pickVisiblePresence(list, null)).toHaveLength(PRESENCE_RENDER_LIMIT);
  });

  it("같은 명단이면 항상 같은 결과다 — 순서가 섞여 들어와도", () => {
    // presence sync는 객체 키 순회라 순서가 보장되지 않는다. 순서에 따라 결과가 달라지면
    // sync마다 얼굴이 갈려 깜빡인다.
    const list = many(20);
    const shuffled = [...list].reverse();
    expect(pickVisiblePresence(shuffled, null)).toEqual(
      pickVisiblePresence(list, null),
    );
  });

  it("나는 잘리지 않는다 — 정렬상 뒤쪽이어도", () => {
    // "zzz"는 mem_id 오름차순에서 맨 뒤라 상한에 걸려 잘릴 자리다.
    const list = [...many(20), p("zzz")];
    const picked = pickVisiblePresence(list, "zzz");
    expect(picked).toHaveLength(PRESENCE_RENDER_LIMIT);
    expect(picked.map((x) => x.mem_id)).toContain("zzz");
  });

  it("내가 명단에 없으면 그냥 앞에서 채운다", () => {
    const list = many(20);
    const picked = pickVisiblePresence(list, "없는사람");
    expect(picked).toHaveLength(PRESENCE_RENDER_LIMIT);
    expect(picked.map((x) => x.mem_id)).not.toContain("없는사람");
  });

  it("나를 넣어도 상한을 넘지 않는다", () => {
    const list = [...many(20), p("zzz")];
    expect(pickVisiblePresence(list, "zzz")).toHaveLength(PRESENCE_RENDER_LIMIT);
  });

  it("빈 명단은 빈 배열", () => {
    expect(pickVisiblePresence([], "나")).toEqual([]);
  });

  it("딱 상한만큼이면 전원 — 나를 넣느라 누구도 밀리지 않는다", () => {
    const list = many(PRESENCE_RENDER_LIMIT);
    const picked = pickVisiblePresence(list, list.at(-1)!.mem_id);
    expect(picked).toHaveLength(PRESENCE_RENDER_LIMIT);
  });

  it("중복 mem_id가 들어와도 한 번만 센다", () => {
    // presence key가 mem_id라 중복은 원래 안 생기지만, 생기면 같은 공이 둘 그려지고
    // ref Map이 덮어써져 한쪽이 좌상단에 붙박인다.
    const picked = pickVisiblePresence([p("aaa"), p("aaa"), p("bbb")], null);
    expect(picked).toHaveLength(2);
  });
});
