"use server";

type UtmbResult =
  | { ok: true; index: number; name: string }
  | { ok: false; error: string };

export async function fetchUtmbIndex(profileUrl: string): Promise<UtmbResult> {
  const trimmed = profileUrl.trim();

  // Validate URL format
  const match = trimmed.match(
    /^https?:\/\/utmb\.world(?:\/[a-z]{2})?\/runner\/(\d+[\w.-]*)$/,
  );
  if (!match) {
    return {
      ok: false,
      error: "올바른 UTMB 프로필 URL을 입력해 주세요. (예: https://utmb.world/runner/1234567.firstname.lastname)",
    };
  }

  try {
    const res = await fetch(trimmed, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      return { ok: false, error: "UTMB 프로필을 찾을 수 없습니다." };
    }

    const html = await res.text();

    // Extract UTMB Index from meta description
    // Format: "{Name}'s UTMB® Index is {number}."
    const descMatch = html.match(
      /<meta\s+name="description"\s+content="([^"]+)"/,
    );
    if (!descMatch) {
      return { ok: false, error: "UTMB Index 정보를 찾을 수 없습니다." };
    }

    const desc = descMatch[1];
    const indexMatch = desc.match(/Index is (\d+)/);
    if (!indexMatch) {
      return { ok: false, error: "UTMB Index 점수를 파싱할 수 없습니다." };
    }

    // Extract name from meta title
    // Format: "{Name} - His/Her Trail results and UTMB® Index"
    const titleMatch = html.match(
      /<meta\s+name="title"\s+content="([^"]+)"/,
    );
    const name = titleMatch
      ? titleMatch[1].replace(/ - (?:His|Her) Trail results.*/, "").trim()
      : "";

    return { ok: true, index: parseInt(indexMatch[1], 10), name };
  } catch {
    return { ok: false, error: "UTMB 서버에 연결할 수 없습니다." };
  }
}
