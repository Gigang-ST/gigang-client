# 배치 관리 시스템 설계

> 2026-05-30 | feat/title-management-update 브랜치

## 개요

관리자가 백그라운드 배치 작업을 등록·실행·이력 조회할 수 있는 시스템.
현재는 수동 실행(수시 배치)만 지원하며, 추후 pg_cron 연동으로 자동 배치 확장 예정.

---

## 설계 원칙

- **배치 정의는 DB 관리**: 새 배치 추가 시 UI 코드 변경 없이 `batch_job_mst` INSERT만으로 확장.
- **파라미터 스키마 기반 폼 렌더링**: 배치마다 파라미터가 다르고, `param_schema_json`으로 UI 폼을 동적 생성.
- **이력은 항상 DB에 기록**: 수동/자동 구분 없이 모든 실행 결과를 `batch_run_hist`에 저장.
- **실행 중 상태 표시**: `running` INSERT → 서버 액션 완료 → `success/failed` UPDATE 방식. 폴링/SSE 없이 서버 액션 응답 시점에 UI 갱신.

---

## DB 스키마

### `batch_job_mst` — 배치 정의

```sql
CREATE TABLE batch_job_mst (
  job_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_nm      VARCHAR NOT NULL,           -- 배치 이름 (UI 표시용)
  job_cd      VARCHAR NOT NULL UNIQUE,    -- 코드 식별자 (서버 액션 매핑 키)
  job_desc    TEXT,                       -- 배치 설명
  cron_expr   VARCHAR,                    -- cron 표현식 (자동화 예정, 현재 null)
  param_schema_json  JSONB,              -- 파라미터 스키마 (UI 폼 동적 렌더링용)
  use_yn      BOOLEAN NOT NULL DEFAULT true,
  crt_at      TIMESTAMPTZ DEFAULT NOW(),
  upd_at      TIMESTAMPTZ
);
```

### `batch_run_hist` — 배치 실행 이력

```sql
CREATE TABLE batch_run_hist (
  run_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      UUID NOT NULL REFERENCES batch_job_mst(job_id),
  trig_type   VARCHAR NOT NULL CHECK (trig_type IN ('manual', 'auto')),
  trig_by     VARCHAR REFERENCES mem_mst(mem_id),  -- 수동 실행자 (auto면 null)
  param_json  JSONB,                               -- 실행 시 파라미터 스냅샷
  status      VARCHAR NOT NULL CHECK (status IN ('running', 'success', 'failed')),
  result_msg  TEXT,                                -- 결과 메시지 또는 에러 내용
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  duration_ms INTEGER                              -- 소요 시간 (ms)
);
```

---

## 파라미터 스키마 (`param_schema_json`)

배치마다 다른 파라미터를 UI에서 동적으로 폼 렌더링하기 위한 JSON 스키마.

### 필드 구조

```typescript
type ParamField = {
  key: string;          // 파라미터 키 (param_json에 저장될 필드명)
  label: string;        // UI 라벨
  type: "month"         // 월 선택 (YYYY-MM)
      | "date"          // 날짜 선택 (YYYY-MM-DD)
      | "text"          // 텍스트 입력
      | "number"        // 숫자 입력
      | "boolean";      // 체크박스
  required: boolean;
  default?: string | number | boolean | "prev_month" | "today";
  // "prev_month": 전월 자동 계산
  // "today": 오늘 날짜 자동 계산
  description?: string; // 파라미터 설명 (UI 툴팁)
};
```

### 예시 — 마일리지런 칭호 배치

```json
[
  {
    "key": "base_month",
    "label": "기준 월",
    "type": "month",
    "required": true,
    "default": "prev_month",
    "description": "칭호를 평가할 기준 월. 기본값은 전월."
  }
]
```

---

## 배치 목록

| job_cd | job_nm | 파라미터 | cron (예정) | 설명 |
|--------|--------|---------|------------|------|
| `MILEAGE_TITLE_BATCH` | 마일리지런 칭호 배치 | `base_month` (월) | `0 15 1 * *` (매월 1일 자정 KST) | 전월 마감 후 확정되는 마일리지런 칭호 평가 및 부여 |

---

## 서버 액션 매핑

`job_cd` 값으로 실행할 서버 액션을 매핑.
새 배치 추가 시 이 맵에만 항목 추가하면 됨.

```typescript
// app/actions/admin/run-batch.ts
const BATCH_ACTION_MAP: Record<string, (params: Record<string, unknown>) => Promise<string>> = {
  MILEAGE_TITLE_BATCH: (params) => batchMileageTitles(params.base_month as string),
};
```

---

## UI — `/admin/system/batch`

### 배치 목록 섹션

| 컬럼 | 내용 |
|------|------|
| 배치명 | job_nm + job_desc |
| cron 규칙 | cron_expr (없으면 "수동만") |
| 최근 실행 | started_at (없으면 "-") |
| 최근 상태 | success / failed / running 뱃지 |
| 실행 유형 | 수시 / 자동 |
| 액션 | [즉시 실행] 버튼 |

### 즉시 실행 플로우

```
[즉시 실행] 클릭
  → 파라미터 입력 Sheet 오픈 (param_schema_json 기반 동적 폼)
  → [실행] 클릭
  → batch_run_hist INSERT (status: running)
  → 서버 액션 실행
  → batch_run_hist UPDATE (status: success/failed, result_msg, finished_at, duration_ms)
  → Sheet 닫힘, 목록/이력 갱신
```

### 실행 이력 섹션 (배치 선택 시)

| 컬럼 | 내용 |
|------|------|
| 실행 시각 | started_at |
| 실행 유형 | 수시 / 자동 |
| 파라미터 | param_json 표시 |
| 상태 | success / failed / running 뱃지 |
| 소요 시간 | duration_ms |
| 결과 | result_msg |

---

## 자동 배치 확장 계획 (추후)

1. `batch_job_mst.cron_expr` 값 입력
2. Supabase pg_cron에 등록:
   ```sql
   SELECT cron.schedule(
     'mileage-title-batch',
     '0 15 1 * *',  -- 매월 1일 자정 KST (UTC 15:00)
     $$ SELECT run_batch_job('MILEAGE_TITLE_BATCH', '{"base_month":"auto"}') $$
   );
   ```
3. `trig_type: 'auto'`로 `batch_run_hist` 기록
4. UI에서 자동 배치 on/off 토글 추가

---

## 구현 로드맵

| 단계 | 작업 | 상태 |
|------|------|------|
| 1 | DB 마이그레이션 (`batch_job_mst`, `batch_run_hist`) | 개발 필요 |
| 2 | `batch_job_mst` 초기 데이터 INSERT (마일리지런 배치) | 개발 필요 |
| 3 | `batchMileageTitles` 액션에 이력 기록 로직 추가 | 개발 필요 |
| 4 | `run-batch.ts` 서버 액션 (job_cd → 액션 매핑) | 개발 필요 |
| 5 | `/admin/system/batch` 페이지 UI | 개발 필요 |
| 6 | pg_cron 자동 배치 연동 | 추후 |
