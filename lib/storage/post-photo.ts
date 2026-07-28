import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { POST_PHOTO_MAX_BYTES, POST_PHOTO_TYPES } from "@/lib/validations/post";

/** 자랑 사진 최대 폭 — 아바타(512 정사각 crop)와 달리 비율을 유지하고 폭만 제한한다 */
const PHOTO_MAX_WIDTH = 1080;
const PHOTO_QUALITY = 80;

/** 사진이 사는 버킷. 멤버별 폴더(`{mem_id}/{timestamp}.webp`) */
export const POST_PHOTO_BUCKET = "post-photos";

export type UploadPostPhotoResult =
  | { ok: false; message: string }
  | { ok: true; url: string; path: string };

/**
 * 운동기록 사진 업로드 — 검증 → HEIC 변환 → 리사이즈 → Storage 업로드.
 *
 * **두 경로가 공유한다**: 기강이야기 직접 작성(`createRecordFlex`)과 마일리지런 기록
 * (`logActivity`/`updateActivity`). 같은 버킷·같은 규격이어야 하는데, 예전처럼 액션마다
 * 복붙해 두면 한쪽만 EXIF 회전이나 HEIC 변환을 빠뜨려도 아무도 모른다 — 실제로 사진이
 * 눕거나 아이폰 기본 포맷이 업로드에 실패하는 건 눈으로 봐야만 드러난다.
 *
 * 반환하는 `path`는 **되돌리기용**이다. 사진을 먼저 올리고 DB에 나중에 쓰는 순서라
 * (반대로 하면 사진 없는 행이 남아 지면이 반쪽으로 뜬다), DB 쓰기가 실패하면 호출자가
 * 이 경로로 `removePostPhoto()`를 불러 고아 파일을 지운다.
 *
 * 업로드는 **세션 클라이언트**로 한다 — Storage RLS가 자기 폴더만 쓰게 막는 게 경계다.
 * (DB INSERT 쪽은 admin 클라이언트를 쓰는 것과 다른 층이다.)
 */
export async function uploadPostPhoto(
  supabase: SupabaseClient,
  memId: string,
  file: File,
): Promise<UploadPostPhotoResult> {
  if (file.size > POST_PHOTO_MAX_BYTES) {
    return { ok: false, message: "사진은 10MB 이하만 가능합니다." };
  }
  if (!POST_PHOTO_TYPES.includes(file.type)) {
    return { ok: false, message: "JPG, PNG, WebP, HEIC 형식만 가능합니다." };
  }

  let buffer = Buffer.from(await file.arrayBuffer());

  // iPhone 기본 포맷 — sharp가 HEIC를 못 읽으므로 JPEG로 먼저 돌린다(아바타와 동일)
  if (file.type === "image/heic" || file.type === "image/heif") {
    try {
      // @ts-expect-error -- heic-convert에 타입 선언 없음
      const { default: convert } = await import("heic-convert");
      buffer = Buffer.from(await convert({ buffer, format: "JPEG", quality: 0.9 }));
    } catch (e) {
      console.error("[uploadPostPhoto] heic-convert 실패", e);
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
      // .rotate()는 EXIF 방향을 적용한다 — 없으면 세로로 찍은 사진이 눕는다
      .rotate()
      .resize({ width: PHOTO_MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: PHOTO_QUALITY })
      .toBuffer();
  } catch (e) {
    console.error("[uploadPostPhoto] sharp 실패", e);
    return {
      ok: false,
      message: "이미지 처리에 실패했습니다. JPG 또는 PNG로 다시 시도해 주세요.",
    };
  }

  const path = `${memId}/${Date.now()}.webp`;
  const { error } = await supabase.storage
    .from(POST_PHOTO_BUCKET)
    .upload(path, resized, { contentType: "image/webp" });
  if (error) {
    console.error("[uploadPostPhoto] 업로드 실패", error);
    return { ok: false, message: "사진 업로드에 실패했습니다." };
  }

  const url = supabase.storage.from(POST_PHOTO_BUCKET).getPublicUrl(path).data
    .publicUrl;
  return { ok: true, url, path };
}

/**
 * 올린 사진을 지운다 — DB 쓰기 실패 시 되돌리기, 그리고 사진 교체 시 이전 파일 정리.
 *
 * 실패해도 throw하지 않는다. 파일 하나가 남는 것보다 사용자 흐름이 끊기는 게 더 나쁘다.
 */
export async function removePostPhoto(
  supabase: SupabaseClient,
  path: string,
): Promise<void> {
  const { error } = await supabase.storage.from(POST_PHOTO_BUCKET).remove([path]);
  if (error) console.error("[removePostPhoto] 삭제 실패", path, error);
}

/**
 * 공개 URL에서 버킷 내부 경로를 뽑는다 — 사진 교체·삭제 때 이전 파일을 지우려면 필요하다.
 *
 * DB엔 URL만 저장하고 경로는 안 남긴다(컬럼을 둘로 늘릴 값이 아니다). 공개 URL은
 * `.../object/public/post-photos/{mem_id}/{ts}.webp` 꼴이라 버킷 이름 뒤가 곧 경로다.
 * 형태가 안 맞으면 null — 남의 버킷 URL이나 손으로 넣은 값에 지우기를 시도하지 않는다.
 */
export function postPhotoPathFromUrl(url: string | null): string | null {
  if (!url) return null;
  const marker = `/${POST_PHOTO_BUCKET}/`;
  const at = url.indexOf(marker);
  if (at === -1) return null;
  const path = url.slice(at + marker.length).split("?")[0];
  return path || null;
}
