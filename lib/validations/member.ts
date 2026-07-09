import { z } from "zod";
import type { Enums } from "@/lib/supabase/database.types";

/** DB gender enum + 빈 문자열(미선택) 허용 */
const genderValues = ["male", "female", ""] as const;

/** 한글 이름 검증 (2~5자, 한글만) */
export const koreanNameSchema = z
  .string()
  .trim()
  .min(1, "이름을 입력해 주세요")
  .regex(/^[가-힣]+$/, "한글 이름만 입력해 주세요")
  .min(2, "이름은 2자 이상 입력해 주세요")
  .max(5, "이름은 5자 이하로 입력해 주세요");

/** 프로필 수정 폼 */
export const profileEditSchema = z.object({
  full_name: koreanNameSchema,
  gender: z.enum(genderValues),
  birthday: z.string(),
  email: z
    .string()
    .trim()
    .pipe(z.email("올바른 이메일을 입력해 주세요").or(z.literal(""))),
});

export type ProfileEditValues = z.infer<typeof profileEditSchema>;

/** 타입 안전성 확인: DB gender enum 값들이 스키마에 포함되어 있는지 체크 */
type _DbGender = Enums<"gender">;
type _AssertDbGenderCovered = _DbGender extends Exclude<(typeof genderValues)[number], "">
  ? true
  : never;
const _genderCheck: _AssertDbGenderCovered = true;
void _genderCheck;

// ============================================================
// 온보딩 프로필 (mem_onbd_prf) — 뉴비 온보딩 개선 §3, §6.1
// 공통코드(JOIN_PURP/JOIN_SRC) 값과 1:1 대응. DB CHECK 제약(avg_pace_cd)과도 동일 목록.
// ============================================================

/** 가입 목적 칩 코드 (공통코드 그룹 JOIN_PURP) */
export const JOIN_PURP_CODES = [
  "RUN_MATE",
  "COACH",
  "TRAINING",
  "NEW_SPORT",
  "RACE",
  "FRIENDS",
  "HABIT",
] as const;

/** 유입 경로 칩 코드 (공통코드 그룹 JOIN_SRC) */
export const JOIN_SRC_CODES = ["FRIEND", "INSTA", "SOMOIM", "DAANGN", "ETC"] as const;

/** 평균 페이스 코드 — DB ck_mem_onbd_prf_avg_pace_cd CHECK 제약과 동일 목록 */
export const AVG_PACE_CODES = [
  "P330",
  "P400",
  "P430",
  "P500",
  "P530",
  "P600",
  "P630",
  "P700",
  "P730",
  "P730_OVER",
  "UNKNOWN",
] as const;

/** 온보딩 6단계(참석 약속)까지 도달했을 때 제출하는 러닝 프로필 + 가입 목적 + 유입 경로 */
export const onboardingProfileSchema = z.object({
  nearStnNm: z.string().max(30).nullable(),
  avgRunDistKm: z.number().min(0.5).max(100).nullable(),
  avgPaceCd: z.enum(AVG_PACE_CODES).nullable(),
  joinPurpCds: z.array(z.enum(JOIN_PURP_CODES)).min(1),
  joinPurpTxt: z.string().max(500).nullable(),
  joinSrcCd: z.enum(JOIN_SRC_CODES),
  joinSrcTxt: z.string().max(200).nullable(),
});

export type OnboardingProfileValues = z.infer<typeof onboardingProfileSchema>;

/**
 * 프로필 편집(`/profile/edit` 러닝 프로필 섹션)용 스키마 — 기존 회원 소급 입력.
 * 온보딩 전용 필드(유입 경로·참석 약속)는 다루지 않고, 가입 목적은 0개(미입력)도 허용한다.
 */
export const runningProfileEditSchema = z.object({
  nearStnNm: z.string().max(30).nullable(),
  avgRunDistKm: z.number().min(0.5).max(100).nullable(),
  avgPaceCd: z.enum(AVG_PACE_CODES).nullable(),
  joinPurpCds: z.array(z.enum(JOIN_PURP_CODES)).min(0),
  joinPurpTxt: z.string().max(500).nullable(),
});

export type RunningProfileEditValues = z.infer<typeof runningProfileEditSchema>;
