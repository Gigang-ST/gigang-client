import { z } from "zod";
import type { Enums } from "@/lib/supabase/database.types";

/** DB sport 컬럼에 들어갈 수 있는 값 */
const SPORT_KEYS = [
  "road_run",
  "ultra",
  "trail_run",
  "triathlon",
  "cycling",
] as const;

/** 대회 등록 폼 */
export const competitionRegisterSchema = z
  .object({
    title: z.string().min(1, "대회명을 입력해 주세요"),
    sport: z.enum(SPORT_KEYS, { message: "종목을 선택해 주세요" }),
    startDate: z.string().min(1, "시작일을 입력해 주세요"),
    endDate: z.string(),
    location: z.string().min(1, "장소를 입력해 주세요"),
    sourceUrl: z
      .string()
      .min(1, "대회 링크를 입력해 주세요")
      .url("올바른 URL을 입력해 주세요"),
    selectedEventTypes: z
      .array(z.string())
      .min(1, "참가 코스를 1개 이상 선택해 주세요"),
  })
  .refine((data) => !data.endDate || data.endDate >= data.startDate, {
    message: "종료일은 시작일 이후여야 합니다.",
    path: ["endDate"],
  });

export type CompetitionRegisterValues = z.infer<
  typeof competitionRegisterSchema
>;

/** 대회 수정 폼 (관리자) — 기존 대회는 sport가 null일 수 있어서 좀 더 유연 */
export const competitionEditSchema = z
  .object({
    title: z.string().min(1, "대회명을 입력해 주세요"),
    sport: z.string().min(1, "종목을 선택해 주세요"),
    startDate: z.string().min(1, "시작일을 입력해 주세요"),
    endDate: z.string(),
    location: z.string(),
    sourceUrl: z.string(),
    eventTypes: z.array(z.string()),
  })
  .refine((data) => !data.endDate || data.endDate >= data.startDate, {
    message: "종료일은 시작일 이후여야 합니다.",
    path: ["endDate"],
  });

export type CompetitionEditValues = z.infer<typeof competitionEditSchema>;

/** 참가 신청 폼 — role은 DB enum과 일치 */
export const registrationSchema = z.object({
  role: z.enum(["participant", "cheering", "volunteer"] as const satisfies readonly Enums<"participation_role">[]),
  eventType: z.string(),
  otherEventType: z.string(),
});

export type RegistrationValues = z.infer<typeof registrationSchema>;
