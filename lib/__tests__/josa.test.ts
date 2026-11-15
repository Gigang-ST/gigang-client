import { describe, expect, it } from "vitest";

import { hasBatchim, josa, josaOf } from "@/lib/josa";

describe("josa — 크루 이름 뒤 조사", () => {
  it("받침 있는 이름(기강)과 없는 이름(모보브)", () => {
    expect(josa("기강", "은/는")).toBe("기강은");
    expect(josa("모보브", "은/는")).toBe("모보브는");
    expect(josa("기강", "이/가")).toBe("기강이");
    expect(josa("모보브", "이/가")).toBe("모보브가");
    expect(josa("기강", "을/를")).toBe("기강을");
    expect(josa("모보브", "을/를")).toBe("모보브를");
    expect(josa("기강", "이랑/랑")).toBe("기강이랑");
    expect(josa("모보브", "이랑/랑")).toBe("모보브랑");
  });

  it("으로/로 — 받침 ㄹ 은 「로」", () => {
    expect(josa("서울", "으로/로")).toBe("서울로");
    expect(josa("기강", "으로/로")).toBe("기강으로");
    expect(josa("모보브", "으로/로")).toBe("모보브로");
  });

  it("한글이 아니면 받침 없음으로 본다", () => {
    expect(hasBatchim("MOVOF")).toBe(false);
    expect(josaOf("MOVOF", "은/는")).toBe("는");
    expect(hasBatchim("")).toBe(false);
  });
});
