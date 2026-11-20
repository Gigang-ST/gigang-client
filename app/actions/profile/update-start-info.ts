"use server";

import { revalidatePath } from "next/cache";

import { withMember } from "@/lib/actions/auth";
import { saveStartInfo } from "@/lib/start-info-save";
import { startInfoSchema, type StartInfoValues } from "@/lib/validations/start-info";

/**
 * `/profile/edit` 시작 정보(러닝 경력·주간 거리·기록) 저장.
 * 대상은 로그인 세션의 본인뿐이다. 가입 때 받은 출처·시각은 보존하고 마지막 수정 시각만 갱신한다
 * (`saveStartInfo`). 자기신고 기준선이라 대회 기록·랭킹과 무관하다.
 */
export async function updateStartInfo(
  input: StartInfoValues,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const parsed = startInfoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "입력값이 올바르지 않습니다." };

  return withMember(async ({ member }) => {
    const res = await saveStartInfo(member.id, parsed.data, "PROFILE");
    if (!res.ok) return res;
    revalidatePath("/profile/edit");
    return { ok: true };
  });
}
