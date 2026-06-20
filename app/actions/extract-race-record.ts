"use server";

import { env } from "@/lib/env";
import {
  extractRaceRecordFromImageData,
  type ExtractedRecord,
} from "@/lib/ocr/race-record";
import { withActive } from "@/lib/actions/auth";

const MAX_BYTES = 10 * 1024 * 1024; // 10MB

type ExtractResult =
  | { ok: true; data: ExtractedRecord }
  | { ok: false; message: string };

export async function extractRaceRecordFromImage(
  formData: FormData,
): Promise<ExtractResult> {
  return withActive(async () => {
    const file = formData.get("image");
    if (!(file instanceof File)) return { ok: false, message: "이미지를 첨부해 주세요." };
    if (!file.type.startsWith("image/")) return { ok: false, message: "이미지 파일만 업로드할 수 있습니다." };
    if (file.size > MAX_BYTES) return { ok: false, message: "이미지 용량은 10MB 이하여야 합니다." };
    if (!env.GEMINI_API_KEY) return { ok: false, message: "OCR 기능을 사용할 수 없습니다." };

    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const data = await extractRaceRecordFromImageData({
        apiKey: env.GEMINI_API_KEY,
        base64: buffer.toString("base64"),
        mimeType: file.type,
      });
      return { ok: true, data };
    } catch (err) {
      console.error("기록증 OCR 추출 실패:", err);
      return { ok: false, message: "사진에서 정보를 읽지 못했습니다. 직접 입력해 주세요." };
    }
  });
}
