import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { AVATAR_TARGET_PX } from "@/lib/image/avatar-compress";

/**
 * 아바타 사진 처리 — 검증 → HEIC 변환 → 정사각 리사이즈 → Storage 업로드 → 옛 파일 제거.
 *
 * **두 경로가 공유한다**: 프로필 수정 화면 전체 저장(`updateProfile`)과 프로필탭의 사진만
 * 바꾸기(`updateAvatar`). 액션마다 복붙해 두면 한쪽만 EXIF 회전(`.rotate()`)이나 HEIC 변환을
 * 빠뜨려도 아무도 모른다 — 사진이 눕거나 아이폰 기본 포맷 업로드가 실패하는 건 눈으로 봐야만
 * 드러난다(`lib/storage/post-photo.ts`와 같은 이유·같은 어법).
 *
 * 규격 상수(512px)는 `lib/image/avatar-compress.ts`에 있다 — 클라이언트가 업로드 전에
 * **같은 크기로** 미리 줄이기 때문이다(이 파일은 `server-only`라 클라이언트가 import할 수
 * 없어 상수를 그쪽에 뒀다). 두 값이 갈리면 브라우저가 줄여 보낸 사진을 서버가 한 번 더
 * 줄여 손실이 겹친다.
 */

/** 아바타가 사는 버킷. 멤버별 폴더(`{mem_id}/{timestamp}.webp`) */
export const AVATAR_BUCKET = "avatars";

/** webp 품질 — 클라이언트 선압축(0.85)보다 낮게 잡아도 이미 줄어든 사진이라 차이가 작다 */
const AVATAR_QUALITY = 80;

export const AVATAR_MAX_BYTES = 10 * 1024 * 1024;

export const AVATAR_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

/** 업로드 전 검증 — 통과하면 null, 아니면 사용자에게 보여줄 문구 */
export function validateAvatarFile(file: File): string | null {
  if (file.size > AVATAR_MAX_BYTES) return "이미지는 10MB 이하만 가능합니다.";
  if (!(AVATAR_TYPES as readonly string[]).includes(file.type))
    return "JPG, PNG, WebP, HEIC 형식만 가능합니다.";
  return null;
}

/**
 * 현재 아바타 URL이 우리 버킷 안 파일이면 그 경로를, 아니면 null.
 *
 * 카카오·구글 OAuth가 넣어 준 외부 URL은 우리가 지울 수 없으므로 여기서 걸러진다.
 */
export function avatarPathInBucket(
  supabase: SupabaseClient,
  avatarUrl: string | null,
): string | null {
  if (!avatarUrl) return null;
  const bucketUrl = supabase.storage.from(AVATAR_BUCKET).getPublicUrl("").data
    .publicUrl;
  return avatarUrl.startsWith(bucketUrl)
    ? avatarUrl.replace(bucketUrl, "")
    : null;
}

export type UploadAvatarResult =
  | { ok: false; message: string }
  | { ok: true; url: string };

/**
 * 아바타 업로드 — HEIC 변환 → 512 정사각 webp → Storage.
 *
 * 옛 파일 제거는 **여기서 하지 않는다.** DB 커밋이 실패했는데 파일을 먼저 지우면 프로필
 * 사진이 통째로 사라지므로, 호출자가 `mem_mst` update 성공 후에 `removeAvatarFile()`을 부른다.
 */
export async function uploadAvatar(
  supabase: SupabaseClient,
  memberId: string,
  file: File,
): Promise<UploadAvatarResult> {
  const invalid = validateAvatarFile(file);
  if (invalid) return { ok: false, message: invalid };

  let buffer = Buffer.from(await file.arrayBuffer());

  const isHeic = file.type === "image/heic" || file.type === "image/heif";
  if (isHeic) {
    try {
      // @ts-expect-error -- heic-convert에 타입 선언 없음
      const { default: convert } = await import("heic-convert");
      const converted = await convert({ buffer, format: "JPEG", quality: 0.9 });
      buffer = Buffer.from(converted);
    } catch (e) {
      console.error("[avatar] heic-convert error:", e);
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
      // EXIF 회전을 먼저 먹인다 — 빼면 아이폰 세로 사진이 눕는다
      .rotate()
      .resize(AVATAR_TARGET_PX, AVATAR_TARGET_PX, { fit: "cover" })
      .webp({ quality: AVATAR_QUALITY })
      .toBuffer();
  } catch (e) {
    console.error("[avatar] sharp error:", e);
    return {
      ok: false,
      message:
        "이미지 처리에 실패했습니다. JPG 또는 PNG로 변환 후 다시 시도해 주세요.",
    };
  }

  const filePath = `${memberId}/${Date.now()}.webp`;
  const { error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(filePath, resized, { upsert: true, contentType: "image/webp" });
  if (error) {
    console.error("[avatar] storage error:", error);
    return { ok: false, message: `업로드 실패: ${error.message}` };
  }

  return {
    ok: true,
    url: supabase.storage.from(AVATAR_BUCKET).getPublicUrl(filePath).data
      .publicUrl,
  };
}

/** 옛 파일 제거 — DB 커밋 성공 후에만 부른다. 실패는 무시(고아 파일은 사용자에게 안 보인다) */
export async function removeAvatarFile(
  supabase: SupabaseClient,
  path: string | null,
): Promise<void> {
  if (!path) return;
  await supabase.storage.from(AVATAR_BUCKET).remove([path]);
}
