import { z } from "zod";

import { PB_SESS_TYPES } from "@/lib/pb-class";
import { PB_TRN_KIND_CDS } from "@/lib/pb-class-plan";
import { PB_REC_TYPES } from "@/lib/pb-class-score";

/**
 * 겨울 10K PB 클래스 입력 검증 — 환경변수를 import 하지 않는다(클라이언트 폼·서버 액션·
 * 향후 MCP가 같은 스키마를 쓴다. `lib/validations/mileage-activity.ts`와 같은 이유).
 *
 * 숫자 범위는 DB CHECK 와 맞춘다. DB 가 마지막 방어선이지만, 거기서 터지면 사용자는
 * 「저장에 실패했습니다」만 보므로 스키마가 먼저 사람 말로 막는다.
 */

/** 금액 상한 — 오타(0 하나 더)로 100만 원짜리 보증금이 걸리는 걸 막는 안전망일 뿐 규칙이 아니다 */
const MAX_AMT = 1_000_000;

export const pbEvtIdSchema = z.string().uuid("프로젝트 정보가 올바르지 않습니다");
export const pbGthrIdSchema = z.string().uuid("벙 정보가 올바르지 않습니다");
export const pbPrtIdSchema = z.string().uuid("참가자 정보가 올바르지 않습니다");
export const pbMemIdSchema = z.string().uuid("멤버 정보가 올바르지 않습니다");

const amtSchema = (label: string) =>
  z
    .number({ error: `${label}을(를) 입력해 주세요` })
    .int(`${label}은(는) 원 단위 정수여야 합니다`)
    .min(0, `${label}은(는) 0원 이상이어야 합니다`)
    .max(MAX_AMT, `${label}은(는) ${MAX_AMT.toLocaleString("ko-KR")}원 이하여야 합니다`);

/** 프로젝트 설정(evt_pb_cfg) — `PbClassCfg`와 같은 camelCase 필드 */
export const pbCfgSchema = z
  .object({
    totSessCnt: z
      .number({ error: "총 회차를 입력해 주세요" })
      .int("총 회차는 정수여야 합니다")
      .min(1, "총 회차는 1 이상이어야 합니다")
      .max(52, "총 회차는 52 이하여야 합니다"),
    fullRfndAttdCnt: z
      .number({ error: "전액 환급 기준을 입력해 주세요" })
      .int("전액 환급 기준은 정수여야 합니다")
      .min(1, "전액 환급 기준은 1회 이상이어야 합니다"),
    lateJoinWkNo: z
      .number({ error: "늦은 합류 주차를 입력해 주세요" })
      .int("늦은 합류 주차는 정수여야 합니다")
      .min(2, "늦은 합류 주차는 2주차 이상이어야 합니다"),
    depositAmt: amtSchema("보증금"),
    entryFeeAmt: amtSchema("참가비"),
    // 마일리지런 참가자 할인 — 상한 10만 원은 오타 방지 안전망이다. 보증금보다 커도 `feesForJoinWeek`가
    // 보증금까지만 깎으므로(음수 보증금이 안 나온다) 보증금과의 대소는 따로 막지 않는다.
    mlgDcAmt: z
      .number({ error: "마일리지런 할인액을 입력해 주세요" })
      .int("마일리지런 할인액은 원 단위 정수여야 합니다")
      .min(0, "마일리지런 할인액은 0원 이상이어야 합니다")
      .max(100_000, "마일리지런 할인액은 100,000원 이하여야 합니다"),
  })
  .refine((c) => c.fullRfndAttdCnt <= c.totSessCnt, {
    // 기준이 총 회차보다 크면 아무도 전액을 못 받는다(DB CHECK 와 같은 규칙)
    path: ["fullRfndAttdCnt"],
    message: "전액 환급 기준은 총 회차 이하여야 합니다",
  });

/** 벙 연결 종류 — evt_gthr_rel.sess_type_cd */
export const pbSessTypeSchema = z.enum(PB_SESS_TYPES, {
  error: "회차 종류가 올바르지 않습니다",
});

/** 합류 주차 — 1(정식) 이상. 상한 60은 프로젝트가 1년을 넘지 않는다는 안전망 */
export const pbJoinWkNoSchema = z
  .number({ error: "합류 주차를 입력해 주세요" })
  .int("합류 주차는 정수여야 합니다")
  .min(1, "합류 주차는 1 이상이어야 합니다")
  .max(60, "합류 주차는 60 이하여야 합니다");

/** 관리자의 참가자 수정(합류 주차·실제 낸 금액) */
export const pbParticipantUpdateSchema = z.object({
  joinWkNo: pbJoinWkNoSchema,
  depositAmt: amtSchema("보증금"),
  entryFeeAmt: amtSchema("참가비"),
  // 신청 때 적용된 할인(표시·감사용). 안 보내면 저장된 값을 그대로 둔다 — 이전 폼도 그대로 동작한다
  depositDcAmt: amtSchema("보증금 할인").optional(),
});

export type PbCfgInput = z.infer<typeof pbCfgSchema>;
export type PbParticipantUpdateInput = z.infer<typeof pbParticipantUpdateSchema>;

/**
 * 회차별 훈련표 한 칸(evt_pb_sess_plan) — `PbSessPlan`과 같은 모양.
 *
 * 글자 수 상한은 DB CHECK(`ck_evt_pb_sess_plan_len`, 1000자)와 같다. 선택 칸(E 세션·비고)은
 * 빈 문자열을 null 로 접는다 — 관리자 폼에서 칸을 비우면 "" 가 오는데 그걸 그대로 저장하면
 * 화면이 빈 줄을 그리고, 「없으면 A~D와 같음」 판정(`easyTxt === null`)이 어긋난다.
 * 회차 번호의 상한(≤ 총 회차)은 스키마가 설정을 몰라서 액션이 설정을 읽은 뒤에 막는다.
 */
const requiredText = (label: string, max: number) =>
  z
    .string({ error: `${label}을(를) 입력해 주세요` })
    .trim()
    .min(1, `${label}을(를) 입력해 주세요`)
    .max(max, `${label}은(는) ${max}자 이하여야 합니다`);

const optionalText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .max(max, `${label}은(는) ${max}자 이하여야 합니다`)
    .transform((v) => (v === "" ? null : v))
    .nullable();

export const pbSessPlanSchema = z.object({
  sessNo: z
    .number({ error: "회차 번호를 입력해 주세요" })
    .int("회차 번호는 정수여야 합니다")
    .min(1, "회차 번호는 1 이상이어야 합니다")
    .max(52, "회차 번호는 52 이하여야 합니다"),
  kindCd: z.enum(PB_TRN_KIND_CDS, { error: "훈련 종류를 골라 주세요" }),
  ttl: requiredText("제목", 60),
  mainTxt: requiredText("훈련 내용", 1000),
  easyTxt: optionalText("첫 10K 훈련 내용", 1000),
  selfTxt: optionalText("개인 훈련", 1000),
  noteTxt: optionalText("비고", 1000),
});
export type PbSessPlanInput = z.infer<typeof pbSessPlanSchema>;

/** 훈련표 삭제용 — 회차 번호만 */
export const pbSessNoSchema = pbSessPlanSchema.shape.sessNo;

// ─────────────────────────────────────────
// 2·3단계 — 규칙·팀·기록
// ─────────────────────────────────────────

export const pbGrpIdSchema = z.string().uuid("팀 정보가 올바르지 않습니다");

/** 정수 필드 하나 — 범위 밖이면 사람 말로 막는다(DB 가 아니라 여기서) */
const intField = (label: string, min: number, max: number) =>
  z
    .number({ error: `${label}을(를) 입력해 주세요` })
    .int(`${label}은(는) 정수여야 합니다`)
    .min(min, `${label}은(는) ${min} 이상이어야 합니다`)
    .max(max, `${label}은(는) ${max} 이하여야 합니다`);

/** 배점 한 칸 — 0~1000점. 상한은 오타 방지 안전망이지 규칙이 아니다 */
const ptField = (label: string) => intField(label, 0, 1000);

/**
 * 배점·목표 규칙(evt_pb_cfg.rule_json) — `PbRule`과 같은 모양.
 * 소수 배점은 받지 않는다: 점수판이 팀 평균을 소수 첫째 자리까지 내는데 입력까지 소수면 합이 읽기 어렵다.
 * tenKFactor 만 소수다(5K→10K 환산 계수, Riegel 1.06 이면 2^1.06 ≈ 2.085).
 */
export const pbRuleSchema = z.object({
  goalMaxSec: intField("목표 상한(초)", 1200, 7200),
  goalEditUntilWk: intField("목표 수정 마감 주차", 1, 20),
  midWkNo: intField("중간점검 주차", 1, 20),
  tenKFactor: z
    .number({ error: "10K 환산 계수를 입력해 주세요" })
    .min(1.9, "10K 환산 계수는 1.9 이상이어야 합니다")
    .max(2.3, "10K 환산 계수는 2.3 이하여야 합니다"),
  pt: z.object({
    attend: ptField("공식훈련 출석 점수"),
    join: ptField("일정 참여 점수"),
    host: ptField("일정 개설 점수"),
    joinMinAttd: intField("참여 인정 최소 참석 인원", 1, 20),
    hostMinAttd: intField("개설 인정 최소 참석 인원", 1, 20),
    improvePerPct: ptField("1% 단축당 점수"),
    improveMidMax: ptField("중간점검 향상 상한"),
    improveFinalMax: ptField("최종 향상 상한"),
    goal: ptField("목표 달성 점수"),
    allAttend: ptField("전원 출석 보너스"),
  }),
});
export type PbRuleInput = z.infer<typeof pbRuleSchema>;

/** 측정 기록 종류 — evt_pb_rec_hist.rec_type_cd */
export const pbRecTypeSchema = z.enum(PB_REC_TYPES, { error: "기록 종류가 올바르지 않습니다" });

/** 기록(초) — DB CHECK(0 < sec < 21600)와 같다. 사용자 문구는 시간 단위로 말한다 */
export const pbRecSecSchema = z
  .number({ error: "기록을 입력해 주세요" })
  .int("기록 형식이 올바르지 않습니다")
  // 5K TT도 10분 아래는 사람이 낼 수 없다 — 숫자 오타(`55` → 55초)가 그대로 저장돼 목표 달성·향상
  // 점수가 한꺼번에 붙는 걸 막는다(회원 폼의 하한과 같은 값)
  .min(600, "기록은 10:00 이상으로 입력해 주세요")
  .max(21_599, "기록은 6시간 미만이어야 합니다");

/**
 * 개인 목표(초) — DB CHECK 범위(20분~120분). 실제 상한은 규칙(`goalMaxSec`)이 더 좁히므로
 * 그 비교는 액션이 규칙을 읽은 뒤에 한다(스키마는 규칙을 모른다 — `checkGoalCap`).
 * 문구를 초가 아니라 분으로 말하는 이유: 사용자는 「1200 이상」이라는 말을 못 알아듣는다.
 */
export const pbGoalSecSchema = z
  .number({ error: "목표 시간을 입력해 주세요" })
  .int("목표 시간 형식이 올바르지 않습니다")
  .min(1200, "목표는 20분 이상으로 입력해 주세요")
  .max(7200, "목표는 120분 이하로 입력해 주세요");

/** 목표가 규칙 상한(`goalMaxSec`)을 넘으면 사람 말 한 줄, 아니면 null — 회원·관리자 액션이 공유한다 */
export function checkGoalCap(goalSec: number, rule: Pick<PbRuleInput, "goalMaxSec">): string | null {
  if (goalSec <= rule.goalMaxSec) return null;
  return `목표는 ${Math.floor(rule.goalMaxSec / 60)}분 이내로 입력해 주세요`;
}

/** 게임팀 이름·색 — 색은 bg-chart-N 토큰 번호(1~5), 미지정 가능 */
const grpNmSchema = z
  .string({ error: "팀 이름을 입력해 주세요" })
  .trim()
  .min(1, "팀 이름을 입력해 주세요")
  .max(30, "팀 이름은 30자 이하여야 합니다");
const colorNoSchema = intField("팀 색", 1, 5).nullable();
const sortOrdSchema = intField("순서", 0, 999);

export const pbGroupInputSchema = z.object({ grpNm: grpNmSchema, colorNo: colorNoSchema });
export const pbGroupUpdateSchema = pbGroupInputSchema.extend({ sortOrd: sortOrdSchema });

/** 한 번에 편성할 수 있는 참가자 수 상한 — 요청 크기 안전망(프로젝트 규모는 수십~백여 명) */
const MAX_BATCH_ROWS = 500;

/** 훈련팀 코드(A~E 등) — 빈 문자열은 「미배정」으로 본다 */
const trnGrpCdSchema = z
  .string()
  .trim()
  .max(10, "훈련팀 코드는 10자 이하여야 합니다")
  .transform((v) => (v === "" ? null : v))
  .nullable();

/** 참가자 편성(훈련팀·게임팀) — 같은 참가자를 두 번 넣으면 뒤엣것이 이기는 모호함을 막는다 */
export const pbAssignRowsSchema = z
  .array(
    z.object({
      prtId: pbPrtIdSchema,
      trnGrpCd: trnGrpCdSchema,
      grpId: pbGrpIdSchema.nullable(),
    }),
  )
  .max(MAX_BATCH_ROWS, `한 번에 ${MAX_BATCH_ROWS}명까지만 편성할 수 있습니다`)
  .refine((rows) => new Set(rows.map((r) => r.prtId)).size === rows.length, {
    message: "같은 참가자가 두 번 들어 있습니다",
  });

/** 기록 일괄 입력 — recSec null 은 삭제. 같은 (참가자, 종류)가 두 번이면 막는다 */
export const pbRecordRowsSchema = z
  .array(
    z.object({
      prtId: pbPrtIdSchema,
      recTypeCd: pbRecTypeSchema,
      recSec: pbRecSecSchema.nullable(),
    }),
  )
  .max(MAX_BATCH_ROWS, `한 번에 ${MAX_BATCH_ROWS}건까지만 입력할 수 있습니다`)
  .refine((rows) => new Set(rows.map((r) => `${r.prtId}:${r.recTypeCd}`)).size === rows.length, {
    message: "같은 기록이 두 번 들어 있습니다",
  });

// ─────────────────────────────────────────
// 공식훈련 벙 한 번에 열기
// ─────────────────────────────────────────

/** 한 번에 열 수 있는 초안 수 — 요청 크기 안전망(공식훈련 12 + 측정 1) */
export const PB_SESS_DRAFT_MAX = 20;

/** 벙 필드 한도는 `lib/validations/gathering.ts`와 같다(제목 100 · 장소 200 · 설명 2000) */
export const pbSessDraftSchema = z.object({
  wkNo: z.number({ error: "주차가 올바르지 않습니다" }).int().min(1).max(60),
  sessType: pbSessTypeSchema,
  gthrNm: z
    .string({ error: "제목을 입력해 주세요" })
    .trim()
    .min(1, "제목을 입력해 주세요")
    .max(100, "제목은 100자 이내로 입력해 주세요"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜 형식이 올바르지 않습니다"),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "시간 형식이 올바르지 않습니다"),
  durMin: z
    .number({ error: "소요 시간을 입력해 주세요" })
    .int("소요 시간은 정수(분)여야 합니다")
    .min(15, "소요 시간은 15분 이상이어야 합니다")
    .max(300, "소요 시간은 300분 이하여야 합니다"),
  locTxt: z.string().trim().max(200, "장소는 200자 이내로 입력해 주세요"),
  descTxt: z.string().max(2000, "설명은 2000자 이내로 입력해 주세요"),
});

export const pbSessDraftsSchema = z
  .array(pbSessDraftSchema)
  .min(1, "열 벙이 없습니다")
  .max(PB_SESS_DRAFT_MAX, `한 번에 ${PB_SESS_DRAFT_MAX}개까지만 열 수 있습니다`);
