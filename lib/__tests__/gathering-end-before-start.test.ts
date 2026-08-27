import { describe, it, expect } from "vitest";
import {
  createGthrSchema,
  createGthrFormSchema,
  updateGthrSchema,
  END_BEFORE_START_ERROR,
} from "@/lib/validations/gathering";

const TEAM = "c0ffee00-0000-4000-8000-000000000001";
const GID = "4b29b8f6-4f17-4a5b-a6d8-6e533c0a9a2e";
const base = {
  team_id: TEAM,
  gthr_nm: "테스트 모임",
  gthr_type_enm: "event" as const,
  sprt_cd: "trail_run" as const,
};

describe("모임 종료<시작 원천 차단 (#495)", () => {
  it("생성: 실제 사고 값(11월 시작 / 10월 종료)을 막는다", () => {
    const r = createGthrSchema.safeParse({
      ...base, stt_at: "2026-11-28T09:00", end_at: "2026-10-28T11:00",
    });
    expect(r.success).toBe(false);
    expect(r.error!.issues[0].message).toBe(END_BEFORE_START_ERROR);
    expect(r.error!.issues[0].path).toEqual(["end_at"]);
  });

  it("생성: 정상 구간은 통과", () => {
    expect(createGthrSchema.safeParse({
      ...base, stt_at: "2026-11-28T09:00", end_at: "2026-11-28T11:00",
    }).success).toBe(true);
  });

  it("생성: 시작==종료는 허용", () => {
    expect(createGthrSchema.safeParse({
      ...base, stt_at: "2026-11-28T09:00", end_at: "2026-11-28T09:00",
    }).success).toBe(true);
  });

  it("생성: end_at 없음은 그대로 허용(선택값)", () => {
    expect(createGthrSchema.safeParse({ ...base, stt_at: "2026-11-28T09:00" }).success).toBe(true);
    expect(createGthrSchema.safeParse({ ...base, stt_at: "2026-11-28T09:00", end_at: null }).success).toBe(true);
  });

  it("폼 스키마도 같은 규칙 (team_id 없이)", () => {
    const { team_id: _omit, ...noTeam } = base;
    expect(createGthrFormSchema.safeParse({
      ...noTeam, stt_at: "2026-11-28T09:00", end_at: "2026-10-28T11:00",
    }).success).toBe(false);
    expect(createGthrFormSchema.safeParse({
      ...noTeam, stt_at: "2026-11-28T09:00", end_at: "2026-11-28T11:00",
    }).success).toBe(true);
  });

  it("수정: 둘 다 보내면 막는다", () => {
    expect(updateGthrSchema.safeParse({
      gthr_id: GID, stt_at: "2026-11-28T09:00", end_at: "2026-10-28T11:00",
    }).success).toBe(false);
  });

  it("수정: 한쪽만 보내면 스키마는 통과 — 서버 액션이 병합해서 잡는 몫", () => {
    expect(updateGthrSchema.safeParse({ gthr_id: GID, end_at: "2026-10-28T11:00" }).success).toBe(true);
  });

  it("파생 스키마 생성이 런타임에 던지지 않는다 (zod v4 omit-on-refined)", () => {
    expect(typeof updateGthrSchema.safeParse).toBe("function");
    expect(typeof createGthrFormSchema.safeParse).toBe("function");
  });
});
