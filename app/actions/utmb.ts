"use server";

type UtmbResult =
  | { ok: true; index: number; name: string; recentRaceName: string | null; recentRaceRecord: string | null }
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
      cache: "no-store",
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
    if (!indexMatch || parseInt(indexMatch[1], 10) === 0) {
      return { ok: false, error: "아직 UTMB Index가 부여되지 않은 프로필입니다. 대회 참여 후 점수가 반영되면 다시 시도해 주세요." };
    }

    const index = parseInt(indexMatch[1], 10);

    // Extract name from meta title
    // Format: "{Name} - His/Her Trail results and UTMB® Index"
    const titleMatch = html.match(
      /<meta\s+name="title"\s+content="([^"]+)"/,
    );
    const name = titleMatch
      ? titleMatch[1].replace(/ - (?:His|Her) Trail results.*/, "").trim()
      : "";

    // Extract recent race from __NEXT_DATA__
    let recentRaceName: string | null = null;
    let recentRaceRecord: string | null = null;
    try {
      const nextDataMatch = html.match(
        /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
      );
      if (nextDataMatch) {
        const nextData = JSON.parse(nextDataMatch[1]);
        const results = nextData?.props?.pageProps?.results?.results;
        if (Array.isArray(results) && results.length > 0) {
          const sorted = [...results].sort(
            (a: { dateIso: string }, b: { dateIso: string }) =>
              new Date(b.dateIso).getTime() - new Date(a.dateIso).getTime(),
          );
          const latest = sorted[0];
          recentRaceName = latest.race ?? null;
          recentRaceRecord = latest.isDnf ? "DNF" : (latest.time ?? null);
        }
      }
    } catch {
      // 최근 대회 파싱 실패해도 Index는 반환
    }

    return { ok: true, index, name, recentRaceName, recentRaceRecord };
  } catch {
    return { ok: false, error: "UTMB 서버에 연결할 수 없습니다." };
  }
}
