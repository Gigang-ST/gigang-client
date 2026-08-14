import { dayjs } from "@/lib/dayjs";

const KST = "Asia/Seoul";

/**
 * 좀비 `running` 판정 시간(분). 이 시간을 넘긴 `running`은 죽은 것으로 보고 무시한다.
 *
 * 함수가 타임아웃으로 죽으면 `running` 행이 영영 남아 **그 job이 영원히 막힌다**.
 * 잠금을 완벽히 만들려고 별도 락 테이블을 두는 건 배치 몇 개짜리 규모에 과하다(설계 §3.5).
 */
export const STALE_RUNNING_MINUTES = 30;

export type FreqCd = "daily" | "monthly";

export type RunRow = {
  status: string;
  started_at: string;
};

/**
 * 이번 주기(오늘/이번 달, KST)의 시작 시각.
 *
 * cron 표현식을 파싱하지 않는 이유(설계 §3.2): `0 15 1 * *`는 UTC 매월 1일 15시 =
 * **KST 2일 자정**이고, 의도한 "KST 1일 자정"은 UTC 전월 말일 15시인데 말일이 28~31로
 * 변해 표준 cron으로 표현이 안 된다. "이번 주기에 이미 성공했나"로 판정하면
 * **크론이 밀려도 따라잡고**(catch-up) **수동으로 먼저 돌렸으면 건너뛴다**(멱등).
 */
export function currentCycleStart(freq: FreqCd, now = dayjs().tz(KST)): string {
  const base = now.tz(KST);
  return (freq === "daily" ? base.startOf("day") : base.startOf("month")).toISOString();
}

/** 이번 주기에 이미 성공한 실행이 있나 — 있으면 자동 실행은 건너뛴다. */
export function hasSucceededThisCycle(runs: RunRow[], freq: FreqCd, now?: dayjs.Dayjs): boolean {
  const since = currentCycleStart(freq, now);
  return runs.some((r) => r.status === "success" && r.started_at >= since);
}

/**
 * 지금 돌고 있는(살아 있는) 실행이 있나 — 있으면 겹쳐 돌리지 않는다.
 *
 * `STALE_RUNNING_MINUTES`를 넘긴 `running`은 죽은 것으로 보고 **무시한다**(그 행은
 * 호출부가 `failed`로 마감한다).
 */
export function hasLiveRun(runs: RunRow[], now = dayjs()): boolean {
  const cutoff = now.subtract(STALE_RUNNING_MINUTES, "minute").toISOString();
  return runs.some((r) => r.status === "running" && r.started_at >= cutoff);
}

/** 좀비로 판정되어 `failed`로 마감해야 할 실행들. */
export function staleRunningIds<T extends RunRow & { run_id: string }>(
  runs: T[],
  now = dayjs(),
): string[] {
  const cutoff = now.subtract(STALE_RUNNING_MINUTES, "minute").toISOString();
  return runs.filter((r) => r.status === "running" && r.started_at < cutoff).map((r) => r.run_id);
}

/**
 * `param_schema_json`의 `default`를 실제 값으로 해석한다(자동 실행 전용).
 *
 * 관리자는 폼에서 직접 고르지만 크론에는 사람이 없다. 스키마가 처음부터 `"prev_month"` 같은
 * 기본값을 들고 있었으므로(마일리지런 배치 시드) 그걸 그대로 쓴다.
 */
export function resolveDefaultParam(def: string, now = dayjs().tz(KST)): string | null {
  switch (def) {
    case "prev_month":
      return now.tz(KST).subtract(1, "month").format("YYYY-MM");
    case "cur_month":
      return now.tz(KST).format("YYYY-MM");
    case "today":
      return now.tz(KST).format("YYYY-MM-DD");
    default:
      // 리터럴 기본값(예: "2026-07")은 그대로 쓴다. 빈 문자열은 미지정으로 본다.
      return def || null;
  }
}

export type ParamField = { key: string; default?: string | null };

/** 자동 실행에 쓸 파라미터 묶음을 스키마 기본값으로 만든다. */
export function buildAutoParams(schema: ParamField[] | null, now?: dayjs.Dayjs): Record<string, string> {
  const params: Record<string, string> = {};
  for (const f of schema ?? []) {
    if (!f?.key || f.default == null) continue;
    const v = resolveDefaultParam(f.default, now);
    if (v != null) params[f.key] = v;
  }
  return params;
}
