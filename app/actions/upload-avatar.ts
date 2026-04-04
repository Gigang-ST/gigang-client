"use server";

import sharp from "sharp";
// @ts-expect-error -- heic-convert에 타입 선언 없음
import convert from "heic-convert";
import { getCurrentMember } from "@/lib/queries/member";

const MAX_SIZE = 256;
const QUALITY = 80;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

export async function uploadAvatar(formData: FormData) {
  const file = formData.get("file") as File | null;
  const memberId = formData.get("memberId") as string | null;

  if (!file || !memberId) {
    return { error: "잘못된 요청입니다." };
  }

  if (file.size > MAX_FILE_SIZE) {
    return { error: "이미지는 10MB 이하만 가능합니다." };
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return { error: "JPG, PNG, WebP, HEIC 형식만 가능합니다." };
  }

  // 인증 + 본인 확인
  const { member, supabase } = await getCurrentMember();

  if (!member || member.id !== memberId) {
    return { error: "권한이 없습니다." };
  }

  let buffer = Buffer.from(await file.arrayBuffer());

  // HEIC/HEIF → JPEG 변환
  const isHeic = file.type === "image/heic" || file.type === "image/heif";
  if (isHeic) {
    try {
      const converted = await convert({
        buffer,
        format: "JPEG",
        quality: 0.9,
      });
      buffer = Buffer.from(converted);
    } catch (e) {
      console.error("[upload-avatar] heic-convert error:", e);
      return { error: "HEIC 변환에 실패했습니다. JPG로 변환 후 다시 시도해 주세요." };
    }
  }

  // Sharp로 리사이징
  let resized: Buffer;
  try {
    resized = await sharp(buffer)
      .rotate()
      .resize(MAX_SIZE, MAX_SIZE, { fit: "cover" })
      .webp({ quality: QUALITY })
      .toBuffer();
  } catch (e) {
    console.error("[upload-avatar] sharp error:", e);
    return { error: "이미지 처리에 실패했습니다. JPG 또는 PNG로 변환 후 다시 시도해 주세요." };
  }

  const filePath = `${memberId}/${Date.now()}.webp`;

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(filePath, resized, {
      upsert: true,
      contentType: "image/webp",
    });

  if (uploadError) {
    console.error("[upload-avatar] storage error:", uploadError);
    return { error: `업로드 실패: ${uploadError.message}` };
  }

  const { data: urlData } = supabase.storage
    .from("avatars")
    .getPublicUrl(filePath);

  const { error: updateMst } = await supabase
    .from("mem_mst")
    .update({ avatar_url: urlData.publicUrl })
    .eq("mem_id", memberId)
    .eq("vers", 0)
    .eq("del_yn", false);

  if (updateMst) {
    console.error("[upload-avatar] mem_mst error:", updateMst);
    return { error: `DB 저장 실패: ${updateMst.message}` };
  }

  const { error: updateError } = await supabase
    .from("member")
    .update({ avatar_url: urlData.publicUrl })
    .eq("id", memberId);

  if (updateError) {
    console.error("[upload-avatar] db error:", updateError);
    return { error: `DB 저장 실패: ${updateError.message}` };
  }

  // 기존 아바타가 같은 버킷에 있으면 삭제
  if (member.avatar_url) {
    const bucketUrl = supabase.storage.from("avatars").getPublicUrl("").data.publicUrl;
    if (member.avatar_url.startsWith(bucketUrl)) {
      const oldPath = member.avatar_url.replace(bucketUrl, "");
      await supabase.storage.from("avatars").remove([oldPath]);
    }
  }

  return { url: urlData.publicUrl };
}
