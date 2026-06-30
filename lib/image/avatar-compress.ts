/** 아바타 최종 한 변 길이(px). 서버 sharp와 동일. 큰 프로필 보기까지 대비. */
export const AVATAR_TARGET_PX = 512;

/** 브라우저 canvas로 선압축 가능한 타입. HEIC/HEIF는 제외(서버 변환). */
export const CLIENT_COMPRESSIBLE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/** 브라우저에서 압축할 수 있는 이미지 타입인지. */
export function shouldCompressInBrowser(type: string): boolean {
  return (CLIENT_COMPRESSIBLE_TYPES as readonly string[]).includes(type);
}

/** cover(가운데 정사각형 크롭) 영역 계산. side = 짧은 변, 나머지는 가운데 정렬. */
export function computeCoverCrop(
  width: number,
  height: number,
): { sx: number; sy: number; side: number } {
  const side = Math.min(width, height);
  const sx = Math.floor((width - side) / 2);
  const sy = Math.floor((height - side) / 2);
  return { sx, sy, side };
}

/**
 * 아바타용 이미지를 브라우저에서 512px webp로 선압축한다.
 * - JPG/PNG/WebP: canvas로 가운데 정사각형 크롭 → 512px webp(q0.85)
 * - HEIC/HEIF 등: 압축하지 않고 원본 그대로 반환(서버가 변환)
 * - 처리 실패 시 원본 반환(안전)
 */
export async function compressAvatarFile(file: File): Promise<File> {
  if (!shouldCompressInBrowser(file.type)) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const { sx, sy, side } = computeCoverCrop(bitmap.width, bitmap.height);

    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_TARGET_PX;
    canvas.height = AVATAR_TARGET_PX;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      bitmap,
      sx,
      sy,
      side,
      side,
      0,
      0,
      AVATAR_TARGET_PX,
      AVATAR_TARGET_PX,
    );
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.85),
    );
    if (!blob) return file;

    return new File([blob], "avatar.webp", { type: "image/webp" });
  } catch {
    return file;
  }
}
