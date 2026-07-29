import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  PHOTO_MAX_HEIGHT,
  PHOTO_MAX_WIDTH,
  PHOTO_QUALITY,
} from "@/lib/image/post-photo-compress";
import { POST_PHOTO_MAX_BYTES, POST_PHOTO_TYPES } from "@/lib/validations/post";

// 규격 상수(1080×1920 · 품질 90)는 `lib/image/post-photo-compress.ts`에 있다 —
// 클라이언트가 업로드 전에 **같은 크기로** 미리 줄이기 때문이다(이 파일은 `server-only`라
// 클라이언트가 import할 수 없어 상수를 그쪽에 뒀다). 두 값이 갈리면 브라우저가 줄여 보낸
// 사진을 서버가 한 번 더 줄여 손실이 겹치므로, 반드시 한 출처를 공유한다.

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
      // fit: "inside" — 폭·높이 **둘 다** 상한 안에 들어가게 줄이되 비율은 유지한다.
      // crop이 아니다(잘리는 픽셀 없음). 세로로 긴 사진만 높이에 먼저 걸린다.
      .resize({
        width: PHOTO_MAX_WIDTH,
        height: PHOTO_MAX_HEIGHT,
        fit: "inside",
        withoutEnlargement: true,
      })
      // **JPEG로 저장한다(WebP 아님).** 인스타 스토리 업로드가 WebP를 받지 않아서다 —
      // 나중에 "인스타로 바로 올리기"를 붙일 때 우리 서버 파일이 그대로 원본이 되려면
      // 인스타가 먹는 포맷이어야 한다. WebP로 두면 내보내는 순간 재인코딩이 필요하고,
      // 그건 이미 손실 압축된 것 위에 손실을 한 번 더 얹는 것이다.
      // mozjpeg — 같은 품질에서 파일이 더 작다(JPEG 전환으로 늘어난 용량을 일부 상쇄).
      .jpeg({ quality: PHOTO_QUALITY, mozjpeg: true })
      .toBuffer();
  } catch (e) {
    console.error("[uploadPostPhoto] sharp 실패", e);
    return {
      ok: false,
      message: "이미지 처리에 실패했습니다. JPG 또는 PNG로 다시 시도해 주세요.",
    };
  }

  // 확장자·contentType은 위 `.jpeg()`와 **함께 움직여야 한다** — 한쪽만 바꾸면 브라우저가
  // 엉뚱한 타입으로 받아 캐시·다운로드에서 어긋난다(내보내기에서 특히 문제가 된다).
  //
  // 뒤에 랜덤 접미사를 붙인다: 다건 입력(최대 20건)은 저장을 누를 때 사진을 한꺼번에
  // 올리므로 두 장이 같은 밀리초에 걸릴 수 있다. `upsert: false`(기본)라 덮어쓰기 대신
  // 업로드 실패로 끝나는데, 사용자에겐 원인 모를 "사진 업로드 실패"로만 보인다.
  const suffix = Math.random().toString(36).slice(2, 8);
  const path = `${memId}/${Date.now()}-${suffix}.jpg`;
  const { error } = await supabase.storage
    .from(POST_PHOTO_BUCKET)
    .upload(path, resized, {
      contentType: "image/jpeg",
      /**
       * 1년 캐시 — **재방문 전송량을 없애는 가장 싼 수단**이다.
       *
       * 지정하지 않으면 Supabase 기본값이 **1시간**이라, 아침에 격자를 본 사람이 저녁에
       * 다시 들어오면 사진 16장을 통째로 다시 받는다. 무료 플랜 egress(5GB/월)에서 이
       * 반복분이 실제 트래픽의 대부분을 차지한다 — 첫 조회는 사람당 한 번뿐이지만
       * 재방문은 매일 쌓이기 때문.
       *
       * **1년이 안전한 이유**: 경로가 `{mem_id}/{타임스탬프}-{랜덤}.jpg`라 업로드마다 새
       * 주소이고 `upsert: false`(기본)라 덮어쓰지 않는다. 즉 **같은 URL의 내용이 바뀌는 일이
       * 구조적으로 없다**. 사진을 교체하면 새 URL이 생기고 DB가 그걸 가리키므로 헌 캐시는
       * 아무도 안 본다.
       *
       * ⚠️ 아바타(`update-profile.ts`)에는 걸면 안 된다 — 저긴 `upsert: true`로 **같은 경로를
       * 덮어쓰므로** 길게 캐시하면 프로필 사진을 바꿔도 안 바뀐 것처럼 보인다.
       */
      cacheControl: "31536000",
    });
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
