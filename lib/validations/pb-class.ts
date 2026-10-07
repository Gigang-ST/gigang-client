import { z } from "zod";

import { PB_SESS_TYPES } from "@/lib/pb-class";

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
});

export type PbCfgInput = z.infer<typeof pbCfgSchema>;
export type PbParticipantUpdateInput = z.infer<typeof pbParticipantUpdateSchema>;
