"use server";

import { withActive } from "@/lib/actions/auth";
import {
  avatarPathInBucket,
  removeAvatarFile,
  uploadAvatar,
  validateAvatarFile,
} from "@/lib/storage/avatar";
import { profileEditSchema } from "@/lib/validations/member";

type Result =
  | { ok: true; avatarUrl?: string | null }
  | { ok: false; message: string };

export async function updateProfile(formData: FormData): Promise<Result> {
  const raw = {
    full_name: String(formData.get("full_name") ?? ""),
    gender: String(formData.get("gender") ?? ""),
    birthday: String(formData.get("birthday") ?? ""),
    email: String(formData.get("email") ?? ""),
  };

  const parsed = profileEditSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.",
    };
  }
  const data = parsed.data;

  const file = formData.get("file") as File | null;
  const hasFile = !!file && file.size > 0;
  const removeAvatar = formData.get("removeAvatar") === "true";

  // 사진 검증은 DB 왕복 전에 — 이름만 고쳤는데 사진이 틀려 저장이 반쯤 되는 걸 막는다
  if (hasFile) {
    const invalid = validateAvatarFile(file);
    if (invalid) return { ok: false, message: invalid };
  }

  return withActive(async ({ member, supabase }) => {
    const currentInBucket = avatarPathInBucket(supabase, member.avatar_url);

    // undefined = avatar_url 미변경
    let newAvatarUrl: string | null | undefined = undefined;
    let oldPathToRemove: string | null = null;

    if (hasFile) {
      const uploaded = await uploadAvatar(supabase, member.id, file);
      if (!uploaded.ok) return { ok: false, message: uploaded.message };
      newAvatarUrl = uploaded.url;
      oldPathToRemove = currentInBucket;
    } else if (removeAvatar) {
      newAvatarUrl = null;
      oldPathToRemove = currentInBucket;
    }

    const emailTrim = data.email.trim();
    const emailNorm = emailTrim ? emailTrim.toLowerCase() : null;

    const { error: eMst } = await supabase
      .from("mem_mst")
      .update({
        mem_nm: data.full_name.trim(),
        ...(data.gender && { gdr_enm: data.gender }),
        birth_dt: data.birthday || null,
        email_addr: emailNorm,
        ...(newAvatarUrl !== undefined && { avatar_url: newAvatarUrl }),
      })
      .eq("mem_id", member.id)
      .eq("vers", 0)
      .eq("del_yn", false);

    if (eMst) {
      console.error("[update-profile] mem_mst error:", eMst);
      return { ok: false, message: "저장에 실패했습니다." };
    }

    // DB 커밋 성공 후에만 기존 파일 제거 (실패는 무시)
    await removeAvatarFile(supabase, oldPathToRemove);

    return { ok: true, avatarUrl: newAvatarUrl };
  });
}
