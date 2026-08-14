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
   * 라벨 → 숫자. **고정 필드가 아니다** — 배치마다 세는 게 달라서
   * (회비는 `부여/미해당/기존부여`, 마일리지런은 `평가/부여`) 컬럼을 고정하면
   * 배치를 추가할 때마다 UI를 고쳐야 한다. 화면은 키를 모른 채 칩으로 그린다(설계 §4.2).
   */
  metrics: Record<string, number> | null;
  /** 실제로 바뀐 대상만. 안 바뀐 건 담지 않는다. */
  changes: BatchChange[] | null;
  /** 실패는 아니지만 사람이 봐야 하는 것. */
  warnings: string[] | null;
};

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

/** 이번 실행이 실제로 뭔가를 바꿨나 — 화면이 "변화 없음"을 구분하는 데 쓴다. */
export function hasChanges(result: BatchResult): boolean {
  return (result.changes?.length ?? 0) > 0;
}

/** `batch_run_hist.result_json`에서 읽어 온 값(스키마를 못 믿는 자리). */
export type StoredBatchResult = {
  metrics: Record<string, number>;
  changes: BatchChange[];
  warnings: string[];
};

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

  const metrics: Record<string, number> = {};
  if (raw.metrics && typeof raw.metrics === "object" && !Array.isArray(raw.metrics)) {
    for (const [k, v] of Object.entries(raw.metrics as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v)) metrics[k] = v;
    }
  }

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

  if (!Object.keys(metrics).length && !changes.length && !warnings.length) return null;
  return { metrics, changes, warnings };
}

/**
 * 직전 성공 실행 대비 증감. **월 배치에선 이게 곧 "지난달 대비"**라, 숫자 하나로 이상 징후가
 * 잡힌다(감면이 5명 → 0명이면 뭔가 잘못된 것이다).
 *
 * 이전 실행에 없던 키는 비교하지 않는다(0에서 늘어난 것처럼 보이면 오히려 오해를 만든다).
 */
export function metricDeltas(
  current: Record<string, number>,
  previous: Record<string, number> | null,
): Record<string, number> {
  if (!previous) return {};
  const deltas: Record<string, number> = {};
  for (const [k, v] of Object.entries(current)) {
    if (!(k in previous)) continue;
    const d = v - previous[k];
    if (d !== 0) deltas[k] = d;
  }
  return deltas;
}
