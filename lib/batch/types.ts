/**
 * 배치 공용 계약 — 관리자 수동 실행과 크론 자동 실행이 **같은 핸들러**를 부른다.
 *
 * 설계: docs/design/2026-08-14-배치-자동화.md
 */

/**
 * 배치 핸들러가 받는 실행 컨텍스트.
 *
 * 핸들러는 **세션도 요청 헤더도 보지 않는다** — 크론에는 둘 다 없기 때문이다.
 * 권한 검사는 호출부(관리자 액션은 `withAdmin`, 크론은 `CRON_SECRET`)가 이미 끝냈다.
 */
export type BatchContext = {
  /** 대상 팀. 관리자는 요청 Host에서, 크론은 `batch_job_mst.team_id`에서 온다(설계 §3.1). */
  teamId: string;
  /** 실행을 일으킨 관리자. **자동 실행이면 null**이다. */
  actorMemId: string | null;
  /**
   * 이 배치의 `batch_job_mst.job_id`.
   *
   * 핸들러가 **자기 지난 실행 이력**을 볼 수 있게 넘긴다 — 일 배치가 "마지막 성공 이후
   * 새로 생긴 것"만 훑어 대상을 좁히는 데 쓴다(전원을 도는 건 대부분 낭비다).
   */
  jobId: string;
};

/** 이번 실행이 실제로 바꾼 것 한 건. */
export type BatchChange = {
  /** 대상 회원 이름(화면에 그대로 노출) */
  memNm: string;
  /** 무엇이 바뀌었는지 한 줄. 예: "7월 회비 감면 2,000원" */
  what: string;
};

/**
 * `changes`에 담는 상한. 넘으면 자르고 `truncated`를 세운다.
 *
 * 수백 명을 훑어도 대부분은 무변화라 전부 담으면 jsonb만 커지고 정작 볼 게 묻힌다.
 * 그 이상은 원본 테이블을 보는 게 맞다(설계 §4.2).
 */
export const BATCH_CHANGES_LIMIT = 200;

/**
 * 배치 실행 결과.
 *
 * ⚠️ `metrics`·`changes`·`warnings`는 **필수 + nullable**이다(optional 아님).
 * optional로 두면 안 채운 핸들러를 `tsc`가 안 잡아 준다 — 새 배치를 추가할 때 조용히
 * 결과가 비는 걸 컴파일러가 막게 한다.
 */
export type BatchResult = {
  /** 한 줄 요약. `batch_run_hist.result_msg`에 그대로 들어간다. */
  msg: string;
  /**
   * 지표 — **고정 필드가 아니다.** 배치마다 세는 게 달라서(회비는 `대상/부여/미해당`,
   * 마일리지런은 `시즌/평가/부여`) 컬럼을 고정하면 배치를 추가할 때마다 UI를 고쳐야 한다.
   * 화면은 라벨을 모른 채 칩으로 그린다(설계 §4.2).
   *
   * ⚠️ **맵이 아니라 배열이다.** `Record<string, number>`로 두면 jsonb에 저장될 때
   * **Postgres가 키를 정렬해**(길이순 → 사전순) 순서가 뒤섞인다 — `시즌·평가·부여`로 넣은 게
   * 화면에 `부여·시즌·평가`로 나왔다. 지표는 읽는 순서에 뜻이 있으므로(대상 → 부여 → 미해당)
   * 순서를 보존하는 배열로 담는다.
   */
  metrics: BatchMetric[] | null;
  /**
   * **이번 실행이 실제로 바꾼 건수.** 화면의 "변화 없음" 판정은 이 값이 정본이다.
   *
   * `changes.length`로 추측하면 안 된다 — `changes`는 *상세 목록*이라 상한(200)에 잘리기도
   * 하고, 아예 안 채우는 배치도 있다(마일리지런은 누가 무슨 칭호를 받았는지가 엔진 bulk
   * INSERT 안에 있어 여기까지 안 올라온다). 실제로 **칭호 3개를 부여하고도 "변화 없음"**
   * 으로 표시된 적이 있다.
   */
  changedCount: number;
  /** 실제로 바뀐 대상 목록(상세). 담을 수 있는 배치만 담는다. */
  changes: BatchChange[] | null;
  /** 실패는 아니지만 사람이 봐야 하는 것. */
  warnings: string[] | null;
};

/** 지표 한 칸. 배열로 담아 **순서를 보존한다**(jsonb 객체는 키 순서가 뒤섞인다). */
export type BatchMetric = { label: string; value: number };

/** `changes`를 상한으로 자르고, 잘렸으면 경고를 한 줄 붙인다. */
export function capChanges(
  changes: BatchChange[],
  warnings: string[] = [],
): { changes: BatchChange[]; warnings: string[] } {
  if (changes.length <= BATCH_CHANGES_LIMIT) return { changes, warnings };
  return {
    changes: changes.slice(0, BATCH_CHANGES_LIMIT),
    warnings: [
      ...warnings,
      `변경 ${changes.length}건 중 ${BATCH_CHANGES_LIMIT}건만 기록했습니다(나머지는 원본 내역에서 확인).`,
    ],
  };
}

/** `batch_run_hist.result_json`에서 읽어 온 값(스키마를 못 믿는 자리). */
export type StoredBatchResult = {
  metrics: BatchMetric[];
  /** null = 옛 이력이라 알 수 없음. 화면은 이때만 `changes.length`로 폴백한다. */
  changedCount: number | null;
  changes: BatchChange[];
  warnings: string[];
};

/**
 * 이번 실행이 실제로 뭔가를 바꿨나.
 *
 * `changedCount`가 정본이고, **없을 때만**(이 필드가 생기기 전에 쌓인 이력) `changes` 길이로
 * 폴백한다. 폴백을 기본으로 두면 changes를 안 채우는 배치가 영원히 "변화 없음"이 된다.
 */
export function didChange(stored: StoredBatchResult): boolean {
  if (stored.changedCount !== null) return stored.changedCount > 0;
  return stored.changes.length > 0;
}

/**
 * `result_json`을 화면이 쓸 모양으로 좁힌다.
 *
 * jsonb는 **무엇이든 들어올 수 있다** — 옛 이력은 아예 null이고, 배치가 바뀌면 키도 바뀐다.
 * 화면이 `result.metrics.대상`처럼 곧바로 파고들면 옛 행 하나에 관리자 페이지가 통째로
 * 터진다. 여기서 한 번 거르고 나면 렌더는 안심하고 돈다.
 */
export function parseStoredBatchResult(json: unknown): StoredBatchResult | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const raw = json as Record<string, unknown>;

  const metrics: BatchMetric[] = [];
  if (Array.isArray(raw.metrics)) {
    for (const m of raw.metrics) {
      if (!m || typeof m !== "object") continue;
      const row = m as Record<string, unknown>;
      if (typeof row.label === "string" && typeof row.value === "number" && Number.isFinite(row.value)) {
        metrics.push({ label: row.label, value: row.value });
      }
    }
  } else if (raw.metrics && typeof raw.metrics === "object") {
    // 배열로 바꾸기 전(2026-08-14 이전)에 쌓인 이력은 객체다. 순서는 이미 뒤섞였지만
    // 값은 살아 있으므로 읽어는 준다 — 옛 행이 빈칸으로 보이는 것보다 낫다.
    for (const [k, v] of Object.entries(raw.metrics as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v)) metrics.push({ label: k, value: v });
    }
  }

  const changedCount =
    typeof raw.changedCount === "number" && Number.isFinite(raw.changedCount)
      ? raw.changedCount
      : null;

  const changes: BatchChange[] = [];
  if (Array.isArray(raw.changes)) {
    for (const c of raw.changes) {
      if (!c || typeof c !== "object") continue;
      const row = c as Record<string, unknown>;
      if (typeof row.memNm === "string" && typeof row.what === "string") {
        changes.push({ memNm: row.memNm, what: row.what });
      }
    }
  }

  const warnings = Array.isArray(raw.warnings)
    ? raw.warnings.filter((w): w is string => typeof w === "string")
    : [];

  if (!metrics.length && !changes.length && !warnings.length && changedCount === null) return null;
  return { metrics, changedCount, changes, warnings };
}

/**
 * 지난 회차 대비 증감. **월 배치에선 이게 곧 "지난달 대비"**라, 숫자 하나로 이상 징후가
 * 잡힌다(감면이 5명 → 0명이면 뭔가 잘못된 것이다).
 *
 * 이전 실행에 없던 라벨은 비교하지 않는다(0에서 늘어난 것처럼 보이면 오히려 오해를 만든다).
 *
 * ⚠️ **비교 상대는 `findComparableRun`이 고른다** — 아무 직전 성공이나 잡으면 안 된다.
 */
export type ComparableRun = {
  param_json: Record<string, string> | null;
  result_json: unknown;
};

/**
 * 증감을 비교할 **지난 회차**를 고른다. 없으면 null(증감을 안 그린다).
 *
 * 후보는 최신순으로 넘어오고, 그중 **파라미터가 다른 첫 실행**을 고른다.
 *
 * ⚠️ **"직전 성공"을 그냥 잡으면 안 된다.** 같은 달을 다시 돌리면 두 번째는 이미 부여돼
 * 0이 나오는데, 직전 성공(=같은 달 첫 실행)과 비교해 `▼3`이 뜬다 — 정상 동작인데 경고처럼
 * 보인다. 실제로 그렇게 나와서 고쳤다. 보고 싶은 건 "지난달과 얼마나 다른가"이지
 * "같은 달을 두 번 돌리면 두 번째는 0"이 아니다.
 */
export function findComparableRun(
  current: ComparableRun,
  olderRuns: ComparableRun[],
): StoredBatchResult | null {
  const key = (r: ComparableRun) => JSON.stringify(r.param_json ?? {});
  const currentKey = key(current);
  for (const run of olderRuns) {
    if (key(run) === currentKey) continue; // 같은 파라미터 = 같은 회차의 재실행
    const parsed = parseStoredBatchResult(run.result_json);
    if (parsed) return parsed;
  }
  return null;
}

export function metricDeltas(
  current: BatchMetric[],
  previous: BatchMetric[] | null,
): Record<string, number> {
  if (!previous) return {};
  const prevByLabel = new Map(previous.map((m) => [m.label, m.value]));
  const deltas: Record<string, number> = {};
  for (const m of current) {
    const prev = prevByLabel.get(m.label);
    if (prev === undefined) continue;
    const d = m.value - prev;
    if (d !== 0) deltas[m.label] = d;
  }
  return deltas;
}
