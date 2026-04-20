import { z } from "zod";
import type { Enums } from "@/lib/supabase/database.types";
import { todayKST } from "@/lib/dayjs";
import {
  COMP_EVT_TYPE_OTHER,
  compEvtTypeContainsHangul,
  normalizeCompEvtTypeKey,
  sanitizeAsciiUpperCompEvtTypeInput,
} from "@/lib/comp-evt-type";

export type CompetitionRegisterDatePolicy = "future-only" | "allow-past";

/** 대회 등록 폼 — 종목은 COMP_SPRT_CD, 코스는 공통코드+기타(직접입력) */
function buildCompetitionRegisterSchema(datePolicy: CompetitionRegisterDatePolicy) {
  const baseSchema = z
  .object({
    title: z.string().min(1, "대회명을 입력해 주세요"),
    sport: z.string().min(1, "종목을 선택해 주세요"),
    startDate: z.string().min(1, "시작일을 입력해 주세요"),
    endDate: z.string(),
    location: z.string().min(1, "장소를 입력해 주세요"),
    sourceUrl: z
      .string()
      .min(1, "대회 링크를 입력해 주세요")
      .url("올바른 URL을 입력해 주세요"),
    selectedEventTypes: z.array(z.string()),
    /** 기타(직접 입력) 선택 시 입력값 (원문; 검증은 refine) */
    customEventType: z.string(),
  })
  .refine((data) => !data.endDate || data.endDate >= data.startDate, {
    message: "종료일은 시작일 이후여야 합니다.",
    path: ["endDate"],
  })
  .refine(
    (data) => {
      const base = data.selectedEventTypes.filter((t) => t !== COMP_EVT_TYPE_OTHER);
      const otherOn = data.selectedEventTypes.includes(COMP_EVT_TYPE_OTHER);
      const custom = sanitizeAsciiUpperCompEvtTypeInput(data.customEventType).trim();
      if (otherOn && compEvtTypeContainsHangul(data.customEventType)) return false;
      if (otherOn && !custom) return false;
      if (!otherOn && base.length === 0) return false;
      if (otherOn && custom) {
        const ck = normalizeCompEvtTypeKey(custom);
        if (base.some((t) => normalizeCompEvtTypeKey(t) === ck)) return false;
      }
      return true;
    },
    {
      message: "참가 코스를 1개 이상 선택하거나, 기타 입력을 완료해 주세요.",
      path: ["selectedEventTypes"],
    },
  );

  if (datePolicy === "allow-past") {
    return baseSchema;
  }

  return baseSchema.refine((data) => data.startDate >= todayKST(), {
    message: "지난 대회는 기록 입력에서 추가해 주세요.",
    path: ["startDate"],
  });
}

export const competitionRegisterSchema = buildCompetitionRegisterSchema("future-only");
export const competitionRegisterSchemaAllowPast = buildCompetitionRegisterSchema("allow-past");

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
