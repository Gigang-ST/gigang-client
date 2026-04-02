import { z } from "zod";
import type { Enums } from "@/lib/supabase/database.types";

/** DB gender enum + 빈 문자열(미선택) 허용 */
const genderValues = ["male", "female", ""] as const;

/** 프로필 수정 폼 */
export const profileEditSchema = z.object({
  full_name: z.string().min(1, "이름을 입력해 주세요"),
  gender: z.enum(genderValues),
  birthday: z.string(),
  email: z
    .email("올바른 이메일을 입력해 주세요")
    .or(z.literal("")),
});

export type ProfileEditValues = z.infer<typeof profileEditSchema>;

/** 타입 안전성 확인: gender enum이 DB와 일치하는지 컴파일 타임에 체크 */
type _DbGender = Enums<"gender">;
type _AssertGenderSubset = _DbGender extends (typeof genderValues)[number]
  ? true
  : never;
const _genderCheck: _AssertGenderSubset = true;
void _genderCheck;
