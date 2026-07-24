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

/** 한마디(자기소개) — 프로필 카드에 인용체로 노출. DB CHECK(60자)와 같은 상한 */
export const INTRO_TXT_MAX = 60;

export const introTxtSchema = z
  .string()
  .trim()
  .max(INTRO_TXT_MAX, `한마디는 ${INTRO_TXT_MAX}자 이하로 입력해 주세요`);

/** 한마디 편집 폼 */
export const introEditSchema = z.object({
  intro_txt: introTxtSchema,
});

export type IntroEditValues = z.infer<typeof introEditSchema>;

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

// ── 표시 라벨 (온보딩 위저드 전용 — 코드↔라벨 단일 출처) ──

/** 평균 페이스 코드 → 라벨 (설계 §3.4) */
export const PACE_LABELS: Record<(typeof AVG_PACE_CODES)[number], string> = {
  P330: "3'30\"",
  P400: "4'00\"",
  P430: "4'30\"",
  P500: "5'00\"",
  P530: "5'30\"",
  P600: "6'00\"",
  P630: "6'30\"",
  P700: "7'00\"",
  P730: "7'30\"",
  P730_OVER: "7'30\"보다 여유롭게",
  UNKNOWN: "잘 모르겠어요",
};

/** 가입 목적 칩 라벨 (설계 §3.1) */
export const JOIN_PURP_LABELS: Record<(typeof JOIN_PURP_CODES)[number], string> = {
  RUN_MATE: "같이 달릴 사람이 필요해요",
  COACH: "자세·훈련 코칭을 받고 싶어요",
  TRAINING: "인터벌 같은 훈련을 같이 하고 싶어요",
  NEW_SPORT: "안 해본 운동을 해보고 싶어요",
  RACE: "대회에 같이 나가고 싶어요",
  FRIENDS: "새로운 친구를 만나고 싶어요",
  HABIT: "운동 습관을 만들고 싶어요",
};

/**
 * 가입 목적 짧은 라벨 (관리자 회원관리 요약 전용).
 * 온보딩 위저드의 문장형 라벨(JOIN_PURP_LABELS)은 관리자 요약 화면에 너무 길어,
 * 컴팩트하게 보여줄 압축 라벨을 같은 단일 출처 파일에 둔다.
 */
export const JOIN_PURP_SHORT_LABELS: Record<(typeof JOIN_PURP_CODES)[number], string> = {
  RUN_MATE: "러닝메이트",
  COACH: "코칭",
  TRAINING: "훈련",
  NEW_SPORT: "새 운동",
  RACE: "대회",
  FRIENDS: "친목",
  HABIT: "운동 습관",
};

/** 유입 경로 칩 라벨 (설계 §3.5) */
export const JOIN_SRC_LABELS: Record<(typeof JOIN_SRC_CODES)[number], string> = {
  FRIEND: "지인 소개",
  INSTA: "인스타그램",
  SOMOIM: "소모임",
  DAANGN: "당근",
  ETC: "기타",
};

/** 온보딩 6단계(참석 약속)까지 도달했을 때 제출하는 러닝 프로필 + 가입 목적 + 유입 경로 */
export const onboardingProfileSchema = z.object({
  nearStnNm: z.string().max(30).nullable(),
  avgRunDistKm: z.number().min(1).max(100).nullable(),
  avgPaceCd: z.enum(AVG_PACE_CODES).nullable(),
  joinPurpCds: z.array(z.enum(JOIN_PURP_CODES)).min(1),
  joinPurpTxt: z.string().max(500).nullable(),
  joinSrcCd: z.enum(JOIN_SRC_CODES),
  joinSrcTxt: z.string().max(200).nullable(),
});

export type OnboardingProfileValues = z.infer<typeof onboardingProfileSchema>;

/**
 * 프로필 편집(`/profile/edit`)에서 수정 가능한 온보딩 항목 — 가까운 역 하나뿐.
 * 나머지 온보딩 답변(유입 경로 등)은 가입 시점 스냅샷이라 편집 대상이 아니다.
 */
export const nearStationEditSchema = z.object({
  nearStnNm: z.string().max(30).nullable(),
});

export type NearStationEditValues = z.infer<typeof nearStationEditSchema>;

/**
 * 러닝 프로필 편집 — 프로필 카드 "소개" 섹션에 노출되는 값들.
 *
 * 온보딩 스냅샷 중 **남에게 보여지는 것만** 편집 대상으로 연다. 페이스·거리는 몸 상태가
 * 변하면 옛 값이 되고, 목적도 크루 생활이 길어지면 달라진다.
 * 유입 경로(`joinSrcCd`)와 참석 약속(`attd_pldg_at`)은 가입 시점 기록이라 건드리지 않는다
 * — 특히 참석 약속은 넛지 크론이 참조하므로 편집 경로에서 제외해야 한다.
 *
 * 온보딩과 달리 목적은 `min(1)`을 걸지 않는다 — 편집 화면에서 전부 해제할 수 있어야 한다.
 */
export const runningProfileEditSchema = z.object({
  avgRunDistKm: z.number().min(1).max(100).nullable(),
  avgPaceCd: z.enum(AVG_PACE_CODES).nullable(),
  joinPurpCds: z.array(z.enum(JOIN_PURP_CODES)),
  joinPurpTxt: z.string().max(500).nullable(),
});

export type RunningProfileEditValues = z.infer<typeof runningProfileEditSchema>;
