interface UtmbRaceResult {
  date: string;
  dateIso: string;
  race: string;
  time: string;
  isDnf: boolean;
  distance: string;
  elevationGain: number;
}

export type UtmbRecentRaceResult =
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
