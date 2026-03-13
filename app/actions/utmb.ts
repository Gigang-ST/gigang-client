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

// __NEXT_DATA__에서 파싱되는 최근 대회 결과 타입
interface UtmbRaceResult {
  date: string;
  dateIso: string;
  race: string;
  time: string;
  isDnf: boolean;
  distance: string;
  elevationGain: number;
}

type UtmbRecentRaceResult =
  | { ok: true; raceName: string; raceRecord: string }
  | { ok: false };

/**
 * UTMB 프로필 페이지에서 가장 최근 대회 이름과 기록을 가져온다.
 * __NEXT_DATA__ JSON의 props.pageProps.results.results 배열에서 추출.
 */
export async function fetchUtmbRecentRace(
  profileUrl: string,
): Promise<UtmbRecentRaceResult> {
  const trimmed = profileUrl.trim();

  const match = trimmed.match(
    /^https?:\/\/utmb\.world(?:\/[a-z]{2})?\/runner\/(\d+[\w.-]*)$/,
  );
  if (!match) return { ok: false };

  try {
    const res = await fetch(trimmed, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 3600 },
    });

    if (!res.ok) return { ok: false };

    const html = await res.text();

    // __NEXT_DATA__에서 results 추출
    const nextDataMatch = html.match(
      /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
    );
    if (!nextDataMatch) return { ok: false };

    const nextData = JSON.parse(nextDataMatch[1]);
    const results: UtmbRaceResult[] =
      nextData?.props?.pageProps?.results?.results;

    if (!results || results.length === 0) return { ok: false };

    // dateIso 기준 최신 대회 (이미 DATE 순 정렬되어 있지만 안전하게 재정렬)
    const sorted = [...results].sort(
      (a, b) => new Date(b.dateIso).getTime() - new Date(a.dateIso).getTime(),
    );

    const latest = sorted[0];
    const raceName = latest.race;
    const raceRecord = latest.isDnf ? "DNF" : latest.time;

    return { ok: true, raceName, raceRecord };
  } catch {
    return { ok: false };
  }
}
