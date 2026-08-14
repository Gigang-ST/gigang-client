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

/**
 * 배치 디스패처 크론이 도는 시각(KST 기준 시).
 *
 * ⚠️ **`vercel.json`의 `/api/cron/batch` 스케줄과 같이 고쳐야 한다.** Vercel 크론은 UTC라
 * `0 0 * * *`(UTC 자정)가 KST 09:00이다. json은 TS를 못 읽어 두 곳에 나뉠 수밖에 없으므로,
 * 화면 라벨이 실제와 어긋나지 않게 여기 상수를 정본으로 두고 한쪽을 고칠 때 반드시 같이 본다.
 *
 * 자정이 아니라 09:00인 건 알림 때문이다 — 칭호 부여가 푸시까지 나가므로 자정 배치는
 * 새벽에 알림을 쏜다(설계 §2).
 */
export const BATCH_CRON_HOUR_KST = 9;

/**
 * 화면에 보여줄 실제 스케줄 문구.
 *
 * `freq_cd`와 크론 시각을 **함께** 읽어 만든다 — 예전엔 "매월 자동"처럼 고정 문자열이라
 * 언제 도는지를 알 수 없었고, 그 전엔 `cron_expr`을 그대로 보여줘 `0 15 1 * *`(=KST 2일
 * 자정)라는 **틀린 시각**을 적고 있었다.
 */
export function scheduleLabel(freqCd: string | null): string {
  const hh = `${String(BATCH_CRON_HOUR_KST).padStart(2, "0")}:00`;
  if (freqCd === "daily") return `매일 ${hh} (KST)`;
  // 월 배치는 "그 달에 아직 성공 안 했으면" 도는 구조라, 실제로는 매월 1일 크론에서 걸린다.
  if (freqCd === "monthly") return `매월 1일 ${hh} (KST)`;
  return "수동 전용";
}

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
export function currentCycleStart(freq: FreqCd, now = dayjs()): string {
  const base = now.tz(KST);
  return (freq === "daily" ? base.startOf("day") : base.startOf("month")).toISOString();
}

/**
 * `started_at`이 기준 시각 **이후**인가.
 *
 * ⚠️ **문자열로 비교하지 않는다.** PostgREST는 timestamptz를 `2026-08-14T09:00:00+00:00`
 * 형태로 돌려주는데 `toISOString()`은 `2026-08-14T09:00:00.000Z`다. 같은 순간이라도
 * 오프셋 표기(`+00:00`)와 `Z`, 소수 자릿수가 달라 사전식 비교가 실제 시각과 어긋난다
 * (`+`(0x2B) < `.`(0x2E) < `Z`). 파싱해서 절대 시각으로 비교한다.
 */
function isAtOrAfter(startedAt: string, since: string): boolean {
  return !dayjs(startedAt).isBefore(dayjs(since));
}

/** 이번 주기에 이미 성공한 실행이 있나 — 있으면 자동 실행은 건너뛴다. */
export function hasSucceededThisCycle(runs: RunRow[], freq: FreqCd, now?: dayjs.Dayjs): boolean {
  const since = currentCycleStart(freq, now);
  return runs.some((r) => r.status === "success" && isAtOrAfter(r.started_at, since));
}

/**
 * 지금 돌고 있는(살아 있는) 실행이 있나 — 있으면 겹쳐 돌리지 않는다.
 *
 * `STALE_RUNNING_MINUTES`를 넘긴 `running`은 죽은 것으로 보고 **무시한다**(그 행은
 * 호출부가 `failed`로 마감한다).
 */
export function hasLiveRun(runs: RunRow[], now = dayjs()): boolean {
  const cutoff = now.subtract(STALE_RUNNING_MINUTES, "minute").toISOString();
  return runs.some((r) => r.status === "running" && isAtOrAfter(r.started_at, cutoff));
}

/** 좀비로 판정되어 `failed`로 마감해야 할 실행들. */
export function staleRunningIds<T extends RunRow & { run_id: string }>(
  runs: T[],
  now = dayjs(),
): string[] {
  const cutoff = now.subtract(STALE_RUNNING_MINUTES, "minute").toISOString();
  return runs
    .filter((r) => r.status === "running" && !isAtOrAfter(r.started_at, cutoff))
    .map((r) => r.run_id);
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
