import { describe, expect, it } from "vitest";

import {
  DEFAULT_MEMBER_SORT,
  nextMemberSort,
  sortMembers,
  type SortableMember,
} from "@/app/(info)/admin/members/member-sort";

const m = (over: Partial<SortableMember> & { full_name: string }): SortableMember => ({
  gender: null,
  birthday: null,
  joined_at: null,
  phone: null,
  status: "active",
  bal_amt: null,
  ...over,
});

const names = (list: SortableMember[]) => list.map((x) => x.full_name);

describe("sortMembers — 회원 목록 헤더 정렬", () => {
  const list = [
    m({ full_name: "다나", joined_at: "2026-03-01", bal_amt: -4000, status: "left", birthday: "1990-01-01" }),
    m({ full_name: "가나", joined_at: "2026-05-01", bal_amt: 2000, status: "active" }),
    m({ full_name: "나나", joined_at: "2026-01-01", bal_amt: null, status: "inactive", birthday: "1985-06-01" }),
  ];

  it("기본은 가입일 최신순", () => {
    expect(names(sortMembers(list, DEFAULT_MEMBER_SORT))).toEqual(["가나", "다나", "나나"]);
  });

  it("이름 오름차순·내림차순", () => {
    expect(names(sortMembers(list, { key: "name", dir: "asc" }))).toEqual(["가나", "나나", "다나"]);
    expect(names(sortMembers(list, { key: "name", dir: "desc" }))).toEqual(["다나", "나나", "가나"]);
  });

  it("상태는 활성 → 비활성 → 탈퇴 순", () => {
    expect(names(sortMembers(list, { key: "status", dir: "asc" }))).toEqual(["가나", "나나", "다나"]);
  });

  it("빈 값은 방향과 상관없이 맨 뒤", () => {
    expect(names(sortMembers(list, { key: "balance", dir: "asc" }))).toEqual(["다나", "가나", "나나"]);
    expect(names(sortMembers(list, { key: "balance", dir: "desc" }))).toEqual(["가나", "다나", "나나"]);
    expect(names(sortMembers(list, { key: "birthday", dir: "desc" }))).toEqual(["다나", "나나", "가나"]);
  });

  it("원본 배열을 바꾸지 않는다", () => {
    const before = names(list);
    sortMembers(list, { key: "name", dir: "asc" });
    expect(names(list)).toEqual(before);
  });
});

describe("nextMemberSort — 헤더 누름", () => {
  it("다른 열은 오름차순부터, 같은 열은 방향만 뒤집는다", () => {
    expect(nextMemberSort(DEFAULT_MEMBER_SORT, "name")).toEqual({ key: "name", dir: "asc" });
    expect(nextMemberSort({ key: "name", dir: "asc" }, "name")).toEqual({ key: "name", dir: "desc" });
    expect(nextMemberSort({ key: "name", dir: "desc" }, "name")).toEqual({ key: "name", dir: "asc" });
    expect(nextMemberSort(DEFAULT_MEMBER_SORT, "joined")).toEqual({ key: "joined", dir: "asc" });
  });
});
