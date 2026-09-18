import { describe, expect, it } from "vitest";

import { resolveCommentCount } from "@/lib/story-post";

/**
 * 격자 칸의 댓글 수 — 서버가 준 값 위에 릴스에서 실측한 값을 덮는다.
 *
 * 이 함수의 존재 이유가 곧 이 테스트의 주인공이다: **override가 0일 때**(댓글을 다 지웠을 때)
 * `||`로 합치면 0이 falsy라 서버의 옛 값으로 되돌아간다 — 지웠는데 숫자가 남는다.
 */
describe("resolveCommentCount", () => {
  it("override가 없으면 서버 값을 쓴다", () => {
    expect(resolveCommentCount(3, undefined)).toBe(3);
  });

  it("override가 있으면 서버 값을 덮는다", () => {
    expect(resolveCommentCount(3, 5)).toBe(5);
  });

  it("override가 0이면 0이다 — 서버 값으로 되돌아가지 않는다", () => {
    // 릴스에서 마지막 댓글을 지운 직후. 캐시(5분)에는 아직 옛 개수가 남아 있다.
    expect(resolveCommentCount(3, 0)).toBe(0);
  });

  it("서버 값이 없으면(RPC 배포 전) 0이다", () => {
    // `cmnt_cnt`는 옵셔널이라 마이그레이션 전 응답엔 아예 없다 — 배지를 안 그리면 된다.
    expect(resolveCommentCount(undefined, undefined)).toBe(0);
  });

  it("서버 값이 없어도 override가 있으면 그 값을 쓴다", () => {
    expect(resolveCommentCount(undefined, 2)).toBe(2);
  });

  it("음수·소수는 0 이상 정수로 눕힌다", () => {
    // 방어적 처리 — 계기에 `-1`이나 `1.5`가 찍히는 일이 없게.
    expect(resolveCommentCount(-1, undefined)).toBe(0);
    expect(resolveCommentCount(1.7, undefined)).toBe(1);
  });
});
