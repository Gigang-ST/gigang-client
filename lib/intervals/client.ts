/**
 * intervals.icu API 호출(#760) — 활동 **요약만** 받는다.
 *
 * - 인증: Basic, 사용자명 `API_KEY` · 비밀번호 = 회원의 개인 API 키. 선수 id `0` 은 "키 주인 본인"이다.
 * - `fields` 로 필요한 칸만 요청한다 — 경로·심박 같은 원본은 응답에도 안 실린다(받지 않으니 저장·노출도 없다).
 * - ⚠️ 키는 에러·로그에 싣지 않는다. 던지는 에러엔 상태 코드만 있다.
 * - 화면을 열 때마다 부르지 않는다 — 연결·수동 새로고침·일 배치에서만 부른다(`lib/intervals/core.ts`).
 */

const BASE_URL = "https://intervals.icu/api/v1";
const ACTIVITY_FIELDS = "id,start_date_local,type,distance,moving_time,average_speed";
const TIMEOUT_MS = 15_000;

/** 키가 거부됐다(401·403) — 회원이 다시 연결해야 한다. */
export class IntervalsAuthError extends Error {
  constructor() {
    super("intervals.icu 가 API 키를 받아주지 않았습니다.");
  }
}

/** 그 밖의 호출 실패(네트워크·5xx·형식 오류). 일시적일 수 있다. */
export class IntervalsFetchError extends Error {}

export type IcuActivitySummary = {
  icu_act_id: string;
  act_dt: string;
  sprt_type_nm: string;
  dst_m: number | null;
  mov_sec: number | null;
  avg_spd_mps: number | null;
};

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** 응답 한 건 → 요약. id·날짜·종목이 없으면 null(버린다). */
export function toActivitySummary(raw: unknown): IcuActivitySummary | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === "string" || typeof r.id === "number" ? String(r.id) : null;
  const startLocal = typeof r.start_date_local === "string" ? r.start_date_local : null;
  const date = startLocal && /^\d{4}-\d{2}-\d{2}/.test(startLocal) ? startLocal.slice(0, 10) : null;
  if (!id || !date) return null;
  const type = typeof r.type === "string" && r.type.trim() ? r.type.trim().slice(0, 40) : "Workout";
  const mov = num(r.moving_time);
  return {
    icu_act_id: id,
    act_dt: date,
    sprt_type_nm: type,
    dst_m: num(r.distance),
    mov_sec: mov == null ? null : Math.round(mov),
    avg_spd_mps: num(r.average_speed),
  };
}

export async function fetchIntervalsActivities(
  apiKey: string,
  range: { oldest: string; newest: string },
  fetchImpl: typeof fetch = fetch,
): Promise<IcuActivitySummary[]> {
  const url = `${BASE_URL}/athlete/0/activities?oldest=${range.oldest}&newest=${range.newest}&fields=${ACTIVITY_FIELDS}`;
  let res: Response;
  try {
    res = await fetchImpl(url, {
      headers: {
        Authorization: `Basic ${Buffer.from(`API_KEY:${apiKey}`).toString("base64")}`,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new IntervalsFetchError("intervals.icu 에 연결하지 못했습니다.");
  }
  if (res.status === 401 || res.status === 403) throw new IntervalsAuthError();
  if (!res.ok) throw new IntervalsFetchError(`intervals.icu 응답 오류(${res.status})`);
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new IntervalsFetchError("intervals.icu 응답을 읽지 못했습니다.");
  }
  if (!Array.isArray(body)) throw new IntervalsFetchError("intervals.icu 응답 형식이 달랐습니다.");
  const out: IcuActivitySummary[] = [];
  for (const item of body) {
    const s = toActivitySummary(item);
    if (s) out.push(s);
  }
  return out;
}
