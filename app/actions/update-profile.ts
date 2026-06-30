"use server";

import { withActive } from "@/lib/actions/auth";
import { profileEditSchema } from "@/lib/validations/member";

const MAX_SIZE = 512;
const QUALITY = 80;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

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

  if (hasFile) {
    if (file.size > MAX_FILE_SIZE)
      return { ok: false, message: "이미지는 10MB 이하만 가능합니다." };
    if (!ALLOWED_TYPES.includes(file.type))
      return { ok: false, message: "JPG, PNG, WebP, HEIC 형식만 가능합니다." };
  }

  return withActive(async ({ member, supabase }) => {
    const bucketUrl = supabase.storage.from("avatars").getPublicUrl("").data
      .publicUrl;
    const currentInBucket =
      member.avatar_url && member.avatar_url.startsWith(bucketUrl)
        ? member.avatar_url.replace(bucketUrl, "")
        : null;

    // undefined = avatar_url 미변경
    let newAvatarUrl: string | null | undefined = undefined;
    let oldPathToRemove: string | null = null;

    if (hasFile) {
      let buffer = Buffer.from(await file.arrayBuffer());

      const isHeic = file.type === "image/heic" || file.type === "image/heif";
      if (isHeic) {
        try {
          // @ts-expect-error -- heic-convert에 타입 선언 없음
          const { default: convert } = await import("heic-convert");
          const converted = await convert({
            buffer,
            format: "JPEG",
            quality: 0.9,
          });
          buffer = Buffer.from(converted);
        } catch (e) {
          console.error("[update-profile] heic-convert error:", e);
          return {
            ok: false,
            message: "HEIC 변환에 실패했습니다. JPG로 변환 후 다시 시도해 주세요.",
          };
        }
      }

      let resized: Buffer;
      try {
        const { default: sharp } = await import("sharp");
        resized = await sharp(buffer)
          .rotate()
          .resize(MAX_SIZE, MAX_SIZE, { fit: "cover" })
          .webp({ quality: QUALITY })
          .toBuffer();
      } catch (e) {
        console.error("[update-profile] sharp error:", e);
        return {
          ok: false,
          message: "이미지 처리에 실패했습니다. JPG 또는 PNG로 변환 후 다시 시도해 주세요.",
        };
      }

      const filePath = `${member.id}/${Date.now()}.webp`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, resized, {
          upsert: true,
          contentType: "image/webp",
        });
      if (uploadError) {
        console.error("[update-profile] storage error:", uploadError);
        return { ok: false, message: `업로드 실패: ${uploadError.message}` };
      }

      newAvatarUrl = supabase.storage.from("avatars").getPublicUrl(filePath)
        .data.publicUrl;
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
    if (oldPathToRemove) {
      await supabase.storage.from("avatars").remove([oldPathToRemove]);
    }

    return { ok: true, avatarUrl: newAvatarUrl };
  });
}
