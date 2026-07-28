/**
 * 운동기록 사진 규격 + 브라우저 선압축.
 *
 * **왜 클라이언트에서 미리 줄이는가**: 최종 저장물은 300KB 안팎인데, 예전엔 그걸 만들려고
 * 원본(아이폰 12MP = 3~9MB)을 통째로 서버까지 보냈다. 서버 처리 자체는 260ms로 빠르고
 * 병목은 오직 **전송 구간**이라, 모바일 회선에서 업로드가 길어지면 Next.js 액션 한도
 * (`bodySizeLimit`)나 함수 실행 시간에 걸려 "됐다 안 됐다" 하는 간헐적 실패가 났다.
 * 미리 줄여 보내면 전송량이 수십 분의 1이 되어 그 경계에 아예 닿지 않는다.
 *
 * **두 번 인코딩해도 화질은 사실상 같다**: 브라우저가 이미 1080으로 줄여 보내면 서버의
 * `fit: inside` + `withoutEnlargement`가 "이미 상한 안"이라 **축소를 하지 않고** 재인코딩만
 * 한다. 픽셀을 두 번 깎는 게 아니라서 손실이 미미하다(실측 PSNR 차이 0.33dB — 육안 식별
 * 불가 수준). 전송량 60배 감소와 맞바꿀 값이 아니다.
 *
 * **서버 리사이즈는 그대로 둔다.** 여기는 최적화지 검증이 아니다 — 브라우저 압축이
 * 실패하거나(HEIC·구형 브라우저) 아예 없는 경로로 들어와도 서버가 규격을 다시 맞춘다.
 *
 * 규격 상수가 여기 있는 이유: `lib/storage/post-photo.ts`는 `server-only`를 물고 있어
 * 클라이언트 컴포넌트가 import하는 순간 번들 빌드가 깨진다. 서버도 이 파일에서 가져다 써
 * **두 곳의 목표 크기가 갈리지 않게** 한다(갈리면 브라우저가 줄인 걸 서버가 또 줄인다).
 */

/**
 * 최대 폭 — 아바타(512 정사각 crop)와 달리 비율을 유지하고 폭만 제한한다.
 * 1080은 **인스타 업로드 상한과 같은 값**이다(그보다 크게 올려도 인스타가 1080으로 줄인다).
 */
export const PHOTO_MAX_WIDTH = 1080;

/**
 * 최대 높이 — 9:16 스토리(1080×1920) 기준. 세로로 아주 긴 사진(파노라마 등)이
 * 폭 제한만으로는 안 잡혀 용량이 터지는 걸 막는다. 일반 세로사진(3:4=1440)은 안 걸린다.
 */
export const PHOTO_MAX_HEIGHT = 1920;

/**
 * 품질 90 — 예전 80에서 올렸다.
 *
 * **인스타 스토리 내보내기가 목적**이라서다: 우리 서버 사진이 곧 인스타에 올라갈 원본이
 * 되는데, 80으로 한 번 깎은 걸 인스타가 다시 재인코딩하면 손실이 두 번 겹친다.
 * 90이면 눈으로는 원본과 구분이 어렵고 용량은 감당할 만하다(대략 2~3배).
 */
export const PHOTO_QUALITY = 90;

/**
 * 브라우저 canvas로 선압축 가능한 타입.
 *
 * HEIC/HEIF는 제외한다 — canvas가 못 읽어서 `createImageBitmap`이 던진다(서버가 변환한다).
 * 실제로는 아이폰 Safari가 `<input type="file">`로 넘길 때 대부분 JPEG로 자동 변환해 주므로
 * 아이폰에서도 이 경로를 탄다(Storage에 쌓인 파일이 전부 image/jpeg인 것과 일치).
 */
const COMPRESSIBLE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** 브라우저에서 줄일 수 있는 타입인지 */
export function shouldCompressInBrowser(type: string): boolean {
  return (COMPRESSIBLE_TYPES as readonly string[]).includes(type);
}

/**
 * 상한 안에 들어가도록 축소할 크기를 계산한다(비율 유지·확대 없음).
 *
 * 서버 sharp의 `fit: "inside"` + `withoutEnlargement: true`와 **같은 규칙**이어야 한다 —
 * 어긋나면 브라우저가 줄인 걸 서버가 또 줄여 손실이 한 번 더 겹친다.
 * 이미 상한 안이면 원래 크기를 그대로 돌려준다(scale 1).
 */
export function computeFitInside(
  width: number,
  height: number,
  maxWidth: number = PHOTO_MAX_WIDTH,
  maxHeight: number = PHOTO_MAX_HEIGHT,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width, height };
  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * 업로드 전 사진을 1080×1920 JPEG로 줄인다.
 *
 * **JPEG로 내보낸다(webp 아님)** — 서버가 JPEG로 저장하므로 포맷을 맞춰야 서버에서
 * 한 번 더 포맷 변환이 일어나지 않는다(아바타는 webp라 여기와 다르다).
 *
 * EXIF 회전은 **건드리지 않는다**: `createImageBitmap`은 브라우저에 따라 EXIF를 적용하기도
 * 하고 아니기도 해서 여기서 손대면 기기마다 사진이 눕는 방향이 갈린다. 회전은 서버 sharp의
 * `.rotate()` 한 곳에 맡긴다 — canvas를 거치면 EXIF가 떨어져 나가지만, 그때는 이미 픽셀이
 * 올바른 방향으로 그려진 뒤라 결과가 같다.
 *
 * 실패하면 **원본을 그대로 돌려준다**(안전): 압축은 전송량을 줄이는 최적화일 뿐이고,
 * 규격을 실제로 보장하는 건 서버다. 여기서 던지면 올릴 수 있었던 사진까지 막힌다.
 */
export async function compressPostPhoto(file: File): Promise<File> {
  if (typeof document === "undefined") return file;
  if (!shouldCompressInBrowser(file.type)) return file;

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    const { width, height } = computeFitInside(bitmap.width, bitmap.height);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", PHOTO_QUALITY / 100),
    );
    if (!blob) return file;

    // 줄인 게 더 크면(작은 PNG 등) 원본을 쓴다 — 압축의 목적은 전송량 감소다
    if (blob.size >= file.size) return file;

    return new File([blob], "photo.jpg", { type: "image/jpeg" });
  } catch {
    return file;
  } finally {
    bitmap?.close();
  }
}
