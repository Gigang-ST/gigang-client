import { describe, expect, it } from "vitest";

import {
  GHOST_DISPLAY_LIMIT,
  ghostPosterLines,
  arrangeGhosts,
  daysAgoKST,
} from "@/lib/ghost-members";
import type { GhostMember } from "@/lib/queries/ghost-members";

/**
 * 현상수배 존의 정렬·일수 계산.
 *
 * 이 모듈이 생긴 이유가 곧 이 테스트의 주인공이다: 순서를 RPC가 정하던 시절엔 **시드가
 * 인자로 들어가 캐시를 못 걸었고**, 그래서 홈에 들어오는 전원이 평균 395ms를 기다렸다.
 * 필터는 캐시하고 순서만 여기서 정하면 둘 다 얻는데, 그러려면 **셔플이 시드에 대해
 * 결정적**이어야 한다(안 그러면 한 진입 안에서 얼굴이 흔들린다).
 */

function ghost(memId: string, lastActvDt = "2026-01-01"): GhostMember {
  return {
    mem_id: memId,
    mem_nm: `멤버-${memId}`,
    avatar_url: null,
    last_actv_dt: lastActvDt,
    // RPC가 준 값 — arrangeGhosts가 today 기준으로 덮어써야 한다
    days_ago: 999,
    never_actv: false,
  };
}

const TODAY = "2026-09-18";

describe("arrangeGhosts — 시드 셔플", () => {
  const rows = ["a", "b", "c", "d", "e", "f", "g", "h"].map((id) => ghost(id));

  it("같은 시드면 항상 같은 순서다", () => {
    // 한 진입 안에서 재조회·리렌더가 나도 가로 스크롤 도중 얼굴이 바뀌면 안 된다.
    const first = arrangeGhosts(rows, "seed-1", TODAY).map((g) => g.mem_id);
    const second = arrangeGhosts(rows, "seed-1", TODAY).map((g) => g.mem_id);
    expect(second).toEqual(first);
  });

  it("시드가 다르면 순서가 달라진다", () => {
    // 매 진입 새 조합이 나와야 최고참만 영구 박제되지 않는다.
    const a = arrangeGhosts(rows, "seed-1", TODAY).map((g) => g.mem_id);
    const b = arrangeGhosts(rows, "seed-2", TODAY).map((g) => g.mem_id);
    expect(b).not.toEqual(a);
  });

  it("입력 배열을 제자리에서 바꾸지 않는다", () => {
    // 캐시된 후보 배열을 공유하므로 정렬이 원본을 건드리면 다음 요청이 오염된다.
    const before = rows.map((g) => g.mem_id);
    arrangeGhosts(rows, "seed-3", TODAY);
    expect(rows.map((g) => g.mem_id)).toEqual(before);
  });

  it("아무도 빠뜨리지 않는다 (상한 이하일 때)", () => {
    // 실측 후보 27명 < 상한 30 — 지금은 전원이 매번 뜬다.
    const ids = arrangeGhosts(rows, "seed-1", TODAY).map((g) => g.mem_id).sort();
    expect(ids).toEqual(["a", "b", "c", "d", "e", "f", "g", "h"]);
  });
});

describe("arrangeGhosts — 상한", () => {
  it("상한을 넘으면 잘라낸다", () => {
    const many = Array.from({ length: GHOST_DISPLAY_LIMIT + 12 }, (_, i) =>
      ghost(`m${i}`),
    );
    expect(arrangeGhosts(many, "seed", TODAY)).toHaveLength(GHOST_DISPLAY_LIMIT);
  });

  it("상한을 넘으면 시드에 따라 뽑히는 사람이 갈린다", () => {
    const many = Array.from({ length: GHOST_DISPLAY_LIMIT + 12 }, (_, i) =>
      ghost(`m${i}`),
    );
    const a = new Set(arrangeGhosts(many, "seed-1", TODAY).map((g) => g.mem_id));
    const b = arrangeGhosts(many, "seed-2", TODAY).map((g) => g.mem_id);
    expect(b.some((id) => !a.has(id))).toBe(true);
  });
});

describe("arrangeGhosts — days_ago 재계산", () => {
  it("RPC가 준 days_ago를 today 기준으로 덮어쓴다", () => {
    // ⚠️ 이게 이 함수의 두 번째 존재 이유다. 후보 명단은 24시간 캐시라, RPC가 조회 시점에
    // 계산해 넣은 days_ago는 캐시 안에서 그대로 낡는다("103일째"가 다음 날에도 103일째).
    const [g] = arrangeGhosts([ghost("a", "2026-09-01")], "seed", TODAY);
    expect(g.days_ago).toBe(17);
    expect(g.days_ago).not.toBe(999);
  });

  it("캐시가 하루 묵어도 일수는 읽는 날 기준이다", () => {
    const rows = [ghost("a", "2026-09-01")];
    const d1 = arrangeGhosts(rows, "seed", "2026-09-18")[0].days_ago;
    const d2 = arrangeGhosts(rows, "seed", "2026-09-19")[0].days_ago;
    expect(d2).toBe(d1 + 1);
  });
});

describe("daysAgoKST", () => {
  it("같은 날이면 0이다", () => {
    expect(daysAgoKST("2026-09-18", "2026-09-18")).toBe(0);
  });

  it("월 경계를 넘어서도 센다", () => {
    expect(daysAgoKST("2026-08-31", "2026-09-01")).toBe(1);
  });

  it("미래 날짜는 음수로 내려가지 않는다", () => {
    // 데이터가 어긋나도 "-3일째 실종"이라고 찍히면 안 된다.
    expect(daysAgoKST("2026-09-20", "2026-09-18")).toBe(0);
  });
});

describe("ghostPosterLines — 포스터 문구 세 갈래", () => {
  const base: GhostMember = {
    mem_id: "m",
    mem_nm: "멤버",
    avatar_url: null,
    last_actv_dt: "2026-08-01",
    days_ago: 118,
    never_actv: false,
  };

  it("가입 뒤 흔적이 있으면 실종 + 최종 목격 날짜", () => {
    expect(ghostPosterLines(base)).toEqual({
      status: "118일째 실종",
      detail: "최종 목격 26.8.01",
      aria: "118일째 실종",
    });
  });

  it("흔적 없이 팀 가입일부터 셌으면 「가입 후 무소식」", () => {
    const g = { ...base, never_actv: true, since_join: true, last_actv_dt: "2026-10-12", days_ago: 46 };
    expect(ghostPosterLines(g)).toEqual({
      status: "가입 후 무소식",
      detail: "가입 26.10.12 · 46일",
      aria: "가입 46일째 무소식",
    });
  });

  it("앱 참석 기록 시작일부터 셌으면 「가입」이라 쓰지 않는다", () => {
    // 그 날짜(2026-06-30)는 가입일이 아니다 — 그보다 먼저 들어온 기강 회원
    const g = { ...base, never_actv: true, since_join: false, last_actv_dt: "2026-06-30", days_ago: 150 };
    const lines = ghostPosterLines(g);
    expect(lines).toEqual({ status: "150일째 무소식", detail: "목격 기록 없음", aria: "150일째 무소식" });
    expect(Object.values(lines).join(" ")).not.toContain("가입");
  });

  it("since_join 이 없는 옛 함수 결과는 예전 화면처럼 「가입 후 무소식」", () => {
    // 옛 함수에선 흔적 없는 행의 날짜가 늘 계정 생성일이었다 — 배포가 마이그레이션보다 먼저여도 말이 안 바뀐다(#773 리뷰)
    const g = { ...base, never_actv: true, last_actv_dt: "2026-10-12", days_ago: 40 };
    expect(ghostPosterLines(g)).toEqual({
      status: "가입 후 무소식",
      detail: "가입 26.10.12 · 40일",
      aria: "가입 40일째 무소식",
    });
  });
});
