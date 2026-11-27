import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * intervals.icu 개인 API 키 암호화(#760) — AES-256-GCM.
 *
 * 비밀(`INTERVALS_KEY_SECRET`)은 인자로 받는다 — 환경변수를 읽는 얇은 껍데기는 `lib/intervals/server.ts`.
 * 그래서 이 파일은 `lib/env` 를 모르고 테스트에서 그대로 부를 수 있다.
 *
 * 저장 형식: `v1:<iv>:<tag>:<암호문>` (각각 base64). 앞의 `v1` 은 나중에 알고리즘·비밀을 바꿀 때
 * 옛 값을 구분하는 표식이다. 복호화가 실패하면(비밀이 바뀜·값이 깨짐) 던진다 — 호출부는
 * 그 연결을 "다시 연결 필요"로 돌린다.
 *
 * ⚠️ 평문 키·비밀은 로그·에러 메시지에 싣지 않는다 — 여기서 던지는 에러엔 값이 없다.
 */

const VERSION = "v1";

function deriveKey(secret: string): Buffer {
  if (secret.length < 16) throw new Error("암호화 비밀이 너무 짧습니다.");
  return createHash("sha256").update(secret, "utf8").digest();
}

export function encryptApiKey(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

export function decryptApiKey(stored: string, secret: string): string {
  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) throw new Error("지원하지 않는 암호문 형식입니다.");
  const [, iv, tag, enc] = parts;
  try {
    const decipher = createDecipheriv("aes-256-gcm", deriveKey(secret), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(enc, "base64")), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("API 키를 복호화하지 못했습니다.");
  }
}
