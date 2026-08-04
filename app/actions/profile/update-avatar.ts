"use server";

import { revalidatePath } from "next/cache";

import { withActive } from "@/lib/actions/auth";
import {
  avatarPathInBucket,
  removeAvatarFile,
  uploadAvatar,
  validateAvatarFile,
} from "@/lib/storage/avatar";

type Result =
  | { ok: true; avatarUrl: string | null }
  | { ok: false; message: string };

/**
 * 프로필 사진만 바꾸기 — 프로필탭 아바타의 카메라 배지가 부른다.
 *
 * `updateProfile`과 갈라 둔 이유: 저쪽은 이름·성별·생년월일·이메일을 **함께** 받아
 * `profileEditSchema`로 검증한다. 사진만 고치자고 그 값들을 프로필탭이 들고 다니며
 * 되돌려 보내면, 폼 스키마가 바뀔 때 이 경로가 조용히 어긋난다.
 *
 * 이미지 처리·업로드·옛 파일 제거는 `lib/storage/avatar.ts`를 두 액션이 공유한다.
 *
 * **전당 캐시(`records-team-v6`)는 일부러 안 턴다.** 프사가 거기 보이는 건 종목별 1위뿐인데
 * 무효화는 대상을 못 가려서, 아무나 사진 한 장 바꿀 때마다 전당 전체가 캐시 미스가 된다
 * (한마디·대표 칭호와 같은 규칙 — §DESIGN.md 기강의 전당).
 */
export async function updateAvatar(formData: FormData): Promise<Result> {
  const file = formData.get("file") as File | null;
  const hasFile = !!file && file.size > 0;
  const remove = formData.get("removeAvatar") === "true";

  if (!hasFile && !remove) {
    return { ok: false, message: "변경할 사진이 없습니다." };
  }

  if (hasFile) {
    const invalid = validateAvatarFile(file);
    if (invalid) return { ok: false, message: invalid };
  }

  return withActive(async ({ member, supabase }) => {
    const oldPath = avatarPathInBucket(supabase, member.avatar_url);

    let avatarUrl: string | null = null;
    if (hasFile) {
      const uploaded = await uploadAvatar(supabase, member.id, file);
      if (!uploaded.ok) return { ok: false, message: uploaded.message };
      avatarUrl = uploaded.url;
    }

    const { error } = await supabase
      .from("mem_mst")
      .update({ avatar_url: avatarUrl })
      .eq("mem_id", member.id)
      .eq("vers", 0)
      .eq("del_yn", false);

    if (error) {
      console.error("[update-avatar] mem_mst error:", error);
      return { ok: false, message: "저장에 실패했습니다." };
    }

    // DB 커밋 성공 후에만 기존 파일 제거 (실패는 무시)
    await removeAvatarFile(supabase, oldPath);

    revalidatePath("/profile");
    return { ok: true, avatarUrl };
  });
}
