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

  it("영문 단어는 끝소리로 — ng·m·n·l 만 받침(#658)", () => {
    expect(hasBatchim("MOVOF")).toBe(false);
    expect(josaOf("MOVOF", "은/는")).toBe("는");
    expect(josa("GIGANG", "은/는")).toBe("GIGANG은");
    expect(josa("Garmin", "이/가")).toBe("Garmin이");
    expect(josa("Team", "을/를")).toBe("Team을");
    expect(josa("Trail", "으로/로")).toBe("Trail로");
    expect(josa("Nike", "은/는")).toBe("Nike는");
    expect(josa("Runner", "과/와")).toBe("Runner와");
    expect(josa("모보브 MOVOF", "은/는")).toBe("모보브 MOVOF는");
  });

  it("세 글자 이하 대문자는 약어 — 마지막 글자 이름(엘·엠·엔·알만 받침)", () => {
    expect(josa("KRC", "은/는")).toBe("KRC는");
    expect(josa("LRL", "은/는")).toBe("LRL은");
    expect(josa("GSM", "이/가")).toBe("GSM이");
    expect(josa("BTR", "으로/로")).toBe("BTR로");
  });

  it("숫자는 읽는 소리로", () => {
    expect(josa("크루1", "은/는")).toBe("크루1은");
    expect(josa("크루2", "은/는")).toBe("크루2는");
    expect(josa("크루3", "이/가")).toBe("크루3이");
    expect(josa("크루7", "으로/로")).toBe("크루7로");
    expect(josa("크루6", "으로/로")).toBe("크루6으로");
  });

  it("그 밖의 글자·빈 값은 받침 없음", () => {
    expect(hasBatchim("")).toBe(false);
    expect(hasBatchim("★")).toBe(false);
  });
});
