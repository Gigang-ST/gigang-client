import { z } from "zod";

/** `HH:mm` (24시간). DB time 컬럼이 돌려주는 `HH:mm:ss`도 받는다 — 수정 폼이 그대로 되돌려 보낼 수 있게. */
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

const optionalTime = z.string().regex(TIME_RE, "시각 형식이 올바르지 않습니다.").nullable().optional();

const baseShape = {
  sch_nm: z.string().trim().min(1, "제목을 입력해 주세요.").max(100, "제목은 100자 이내로 입력해 주세요."),
  // 복제는 날짜를 비운 채 폼을 연다 — 빈 값이 이 문구로 걸려 "날짜만 다시 고르게" 된다
  sch_dt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜를 골라 주세요."),
  stt_tm: optionalTime,
  end_tm: optionalTime,
  cont_txt: z.string().max(500, "메모는 500자 이내로 입력해 주세요.").nullable().optional(),
};

/**
 * 시각 규칙 — DB 제약(`ck_mem_sch_mst_tm`)과 같다: 종료 시각은 시작 시각이 있을 때만,
 * 그리고 그보다 뒤(하루짜리라 자정을 넘지 않는다). 여기서 먼저 막아 DB 오류문 대신 이 문구를 보인다.
 */
function checkTimes(v: { stt_tm?: string | null; end_tm?: string | null }, ctx: z.RefinementCtx) {
  if (!v.end_tm) return;
  if (!v.stt_tm) {
    ctx.addIssue({ code: "custom", path: ["end_tm"], message: "시작 시각을 먼저 골라 주세요." });
    return;
  }
  // 둘 다 0채움 고정 자릿수라 사전순 비교가 곧 시각 비교다
  if (v.end_tm <= v.stt_tm) {
    ctx.addIssue({ code: "custom", path: ["end_tm"], message: "종료 시각은 시작 시각보다 늦어야 합니다." });
  }
}

/** 개인 일정 — 하루짜리. 날짜는 필수, 시각은 선택(시작 시각이 없으면 종일). */
export const personalScheduleSchema = z.object(baseShape).superRefine(checkTimes);

export const updatePersonalScheduleSchema = z
  .object({ ...baseShape, mem_sch_id: z.string().uuid() })
  .superRefine(checkTimes);

export type PersonalScheduleInput = z.infer<typeof personalScheduleSchema>;
export type UpdatePersonalScheduleInput = z.infer<typeof updatePersonalScheduleSchema>;
