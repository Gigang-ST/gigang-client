import type { ExtractedRecord } from "@/lib/ocr/race-record";

const KEY_PREFIX = "ocr:";

/** 이미지 바이트 → SHA-256 hex 문자열 */
export async function hashImageFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** sessionStorage "ocr:<hash>" 조회. 없거나 실패하면 null */
export function getCachedExtraction(hash: string): ExtractedRecord | null {
  try {
    const raw = sessionStorage.getItem(KEY_PREFIX + hash);
    return raw ? (JSON.parse(raw) as ExtractedRecord) : null;
  } catch {
    return null;
  }
}

/** sessionStorage "ocr:<hash>"에 저장. 실패(용량/미가용)는 무시 */
export function setCachedExtraction(hash: string, data: ExtractedRecord): void {
  try {
    sessionStorage.setItem(KEY_PREFIX + hash, JSON.stringify(data));
  } catch {
    // best-effort: quota 초과/스토리지 미가용 시 무시
  }
}
