# 칭호 자동 부여 엔진 — 설계 및 운영 가이드

## 1. 개요

칭호 자동 부여 엔진은 **어떤 이벤트(기록 저장, 마일리지런, 출석 등)에서든 단일 함수 `evaluateAndGrantTitles(ctx)` 하나만 호출**하면 칭호 수여가 이루어지도록 설계된 서비스 레이어다.

---

## 2. 세 가지 핵심 개념

### 트리거 (TriggerKind)
"언제 칭호를 검사할지"를 결정한다. 서버 액션에서 엔진을 호출할 때 지정한다.

```
race_record   — 대회 기록 저장 시
mileage_run   — 마일리지런 기록 등록 시
attendance    — 로그인/출석 시
manual_sweep  — 관리자 일괄 재계산 시
```

### 조건 (CondRule)
"무엇을 보고 칭호를 줄지"를 결정한다. 관리자 페이지에서 칭호마다 `cond_rule_json`으로 DB에 저장한다.

```
race_pb_under_sec    — 특정 종목 PB가 N초 이하
race_finish_count    — 특정 종목 완주 N회 이상
mileage_run_complete — 마일리지런 완주
attendance_count     — 기록 등록 누적 N회 이상
membership_days      — 팀 가입 후 N일 이상
```

### 트리거-조건 연결표 (TRIGGER_COND_MAP)
**어떤 트리거가 어떤 조건을 평가할지** 명시적으로 정의한다. `lib/titles/types.ts`에 소스로 관리한다.

```typescript
export const TRIGGER_COND_MAP = {
  race_record:  ["race_pb_under_sec", "race_finish_count"],
  mileage_run:  ["mileage_run_complete"],
  attendance:   ["attendance_count", "membership_days"],
  manual_sweep: ["race_pb_under_sec", "race_finish_count",
                 "mileage_run_complete", "attendance_count", "membership_days"],
};
```

트리거가 발생하면 이 맵에 등록된 조건 유형을 가진 칭호만 평가한다. 등록되지 않은 조건은 해당 트리거에서 실행되지 않는다.

---

## 3. 전체 흐름

```
서버 액션 (예: 기록 저장)
  │
  └─ evaluateAndGrantTitles({ trigger: "race_record", teamId, teamMemId })
       │
       ├─ 1. TRIGGER_COND_MAP["race_record"] 조회
       │      → ["race_pb_under_sec", "race_finish_count"]
       │
       ├─ 2. team_mem_id → mem_id 변환
       │
       ├─ 3. ttl_mst에서 auto 칭호 전체 조회
       │      → 허용된 조건 유형인 칭호만 필터링
       │
       ├─ 4. mem_ttl_rel에서 이미 보유한 칭호 조회 (중복 방지)
       │
       └─ 5. 남은 칭호 조건 평가 → 통과하면 mem_ttl_rel INSERT
```

---

## 4. 파일 구조

```
lib/titles/
  types.ts        CondRule 타입, TriggerKind, TRIGGER_COND_MAP, TitleEvalContext
  evaluators.ts   조건별 순수 평가 함수 (DB 조회만, INSERT 없음)
  engine.ts       evaluateAndGrantTitles() 핵심 엔진

app/actions/
  save-race-record.ts       기록 저장 시 엔진 호출
  admin/sweep-titles.ts     관리자 전체 멤버 일괄 재평가
```

---

## 5. 트리거 추가 방법 (단계별)

새로운 이벤트(예: "첫 로그인")에서 칭호를 검사하고 싶을 때 아래 순서대로 작업한다.

### Step 1 — `lib/titles/types.ts` : TriggerKind에 추가

```typescript
export type TriggerKind =
  | "race_record"
  | "mileage_run"
  | "attendance"
  | "manual_sweep"
  | "first_login";  // ← 추가
```

### Step 2 — `lib/titles/types.ts` : TRIGGER_COND_MAP에 추가

이 트리거에서 어떤 조건 유형을 평가할지 지정한다.

```typescript
export const TRIGGER_COND_MAP = {
  race_record:  ["race_pb_under_sec", "race_finish_count"],
  mileage_run:  ["mileage_run_complete"],
  attendance:   ["attendance_count", "membership_days"],
  manual_sweep: ["race_pb_under_sec", "race_finish_count",
                 "mileage_run_complete", "attendance_count", "membership_days"],
  first_login:  ["membership_days"],  // ← 추가 (로그인 시 가입일 조건만 검사)
} satisfies Record<TriggerKind, CondRule["type"][]>;
```

`satisfies` 키워드가 `TriggerKind`에 있는 모든 트리거가 맵에 등록됐는지 컴파일 타임에 검사한다. 빠뜨리면 타입 에러가 난다.

### Step 3 — `lib/titles/types.ts` : TitleEvalContext에 추가

트리거 호출 시 엔진에 전달할 컨텍스트 타입을 정의한다.

```typescript
export type TitleEvalContextFirstLogin = {
  trigger: "first_login";
  teamId: string;
  teamMemId: string;
  // 이 트리거에서만 필요한 추가 데이터가 있으면 여기에 추가
};

export type TitleEvalContext =
  | TitleEvalContextRaceRecord
  | TitleEvalContextMileageRun
  | TitleEvalContextAttendance
  | TitleEvalContextManualSweep
  | TitleEvalContextFirstLogin;  // ← 추가
```

### Step 4 — 해당 서버 액션에 엔진 호출 추가

트리거가 실제로 발생하는 서버 액션 파일을 찾아서 엔진 호출을 추가한다.

```typescript
// 예: app/actions/auth-callback.ts (로그인 완료 시점)
import { evaluateAndGrantTitles } from "@/lib/titles/engine";

export async function handleAuthCallback(...) {
  // ... 기존 로그인 처리 로직 ...

  // 칭호 자동 평가 — fire-and-forget (실패해도 로그인에 영향 없음)
  evaluateAndGrantTitles({
    trigger: "first_login",
    teamId,
    teamMemId: member.team_mem_id,
  }).catch((e) => console.error("[title-engine] first_login 평가 실패", e));
}
```

> **fire-and-forget 규칙**: 반드시 `await` 없이 `.catch()`만 붙여서 호출한다.
> 칭호 부여 실패가 본 액션(로그인, 기록 저장 등)을 실패시키면 안 되기 때문이다.

---

## 6. 조건(CondRule) 추가 방법 (단계별)

새로운 조건 유형(예: "특정 지역 대회 완주")을 추가하고 싶을 때.

### Step 1 — `lib/titles/types.ts` : CondRule 타입 추가

```typescript
/** 특정 지역 대회 완주 경험이 있는 경우 */
export type CondRegionRaceFinish = {
  type: "region_race_finish";
  region: string; // 예: "서울", "제주"
};

export type CondRule =
  | CondRacePersonalBestUnderSec
  | CondRaceFinishCount
  | CondMileageRunComplete
  | CondAttendanceCount
  | CondMembershipDays
  | CondRegionRaceFinish;  // ← 추가
```

### Step 2 — `lib/titles/evaluators.ts` : 평가 함수 추가

```typescript
export async function evalRegionRaceFinishInternal(
  rule: CondRegionRaceFinish,
  memId: string,
  db: DB,
): Promise<boolean> {
  const { data } = await db
    .from("rec_race_hist")
    .select("race_result_id, comp_mst!inner(loc_nm)")
    .eq("mem_id", memId)
    .eq("del_yn", false)
    .eq("vers", 0);

  return (data ?? []).some((row) => {
    const loc = (row.comp_mst as { loc_nm?: string } | null)?.loc_nm ?? "";
    return loc.includes(rule.region);
  });
}
```

그리고 `evaluateCondition()` switch에 케이스를 추가한다.

```typescript
case "region_race_finish":
  return evalRegionRaceFinishInternal(rule, memId, db);
```

`switch` 맨 아래의 `rule satisfies never`가 케이스를 빠뜨리면 컴파일 에러로 알려준다.

### Step 3 — `lib/titles/types.ts` : TRIGGER_COND_MAP에 등록

이 조건을 어떤 트리거에서 평가할지 지정한다.

```typescript
export const TRIGGER_COND_MAP = {
  race_record:  ["race_pb_under_sec", "race_finish_count", "region_race_finish"],  // ← 추가
  // ...
  manual_sweep: [..., "region_race_finish"],  // manual_sweep에도 반드시 추가
};
```

### Step 4 — 관리자 페이지에서 칭호 등록

`/admin/system/titles`에서 신규 칭호를 등록할 때 `cond_rule_json`에 아래 형식으로 입력한다.

```json
{ "type": "region_race_finish", "region": "제주" }
```

---

## 7. 현재 등록된 조건 유형과 cond_rule_json 예시

| 조건 유형 | 설명 | cond_rule_json 예시 |
|---|---|---|
| `race_pb_under_sec` | 종목 PB ≤ N초 | `{"type":"race_pb_under_sec","sport":"FULL","sec":10800}` |
| `race_finish_count` | 종목 완주 ≥ N회 | `{"type":"race_finish_count","sport":"FULL","count":10}` |
| `mileage_run_complete` | 마일리지런 완주 | `{"type":"mileage_run_complete"}` |
| `attendance_count` | 기록 등록 ≥ N회 | `{"type":"attendance_count","count":100}` |
| `membership_days` | 가입 후 ≥ N일 | `{"type":"membership_days","days":365}` |

**sport 값 참고** (`comp_evt_type` 기준): `FULL`, `HALF`, `10K`, `5K`, `IRONMAN`, `70.3`, `SPRINT`

---

## 8. 현재 등록된 트리거와 평가 조건

| 트리거 | 발생 시점 | 평가하는 조건 |
|---|---|---|
| `race_record` | 대회 기록 저장 | `race_pb_under_sec`, `race_finish_count` |
| `mileage_run` | 마일리지런 기록 등록 | `mileage_run_complete` |
| `attendance` | 로그인/출석 | `attendance_count`, `membership_days` |
| `manual_sweep` | 관리자 일괄 재계산 | 모든 조건 |

---

## 9. 관리자 운영 도구

### 칭호 관리 페이지 (`/admin/system/titles`)

- **신규 칭호 등록**: 칭호명, 유형(자동/수여), 카테고리, `cond_rule_json` 입력
- **칭호 수정**: 조건 변경, 활성화/비활성화 (`use_yn`)
- **일괄 재계산 버튼**: 전체 활성 멤버를 대상으로 모든 조건을 재평가

### 운영 주의사항

- `use_yn = false` 칭호는 엔진이 평가하지 않는다.
- 조건을 변경해도 이미 부여된 칭호는 자동 회수되지 않는다 (수동 회수 필요).
- 일괄 재계산은 이미 보유한 칭호를 중복 부여하지 않는다 — 새 칭호 추가 후 소급 적용 시 사용한다.

---

## 10. 향후 구현 예정

| 항목 | 설명 |
|---|---|
| `mileage_run_complete` 평가 구현 | 마일리지런 스키마 확정 후 `evalMileageRunCompleteInternal` 작성 |
| 출석 트리거 연결 | 로그인 액션에 `attendance` 트리거 추가 |
| 희귀도 보정 배치 | 주 1회 `aply_pt` 재계산 |
| 수여 칭호 수동 부여/회수 UI | 관리자 → 특정 멤버 수동 수여 |
| 칭호 획득 알림 | 신규 칭호 획득 시 토스트 알림 |
