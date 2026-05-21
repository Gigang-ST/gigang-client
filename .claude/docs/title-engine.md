# 칭호 시스템 — 설계 및 운영 가이드

## 1. 개요

칭호에는 두 가지 종류가 있다.

| 종류 | ttl_kind_enm | 설명 |
|------|--------------|------|
| 자동 칭호 | `auto` | 조건 충족 시 엔진이 자동 부여 |
| 수여 칭호 | `awarded` | 관리자가 특정 멤버에게 수동 수여 |

자동 칭호는 **`evaluateAndGrantTitles(ctx)` 하나만 호출**하면 조건 평가와 수여가 이루어진다.
수여 칭호는 관리자 페이지에서 직접 수여/회수한다.

---

## 2. DB 테이블 구조

### `ttl_mst` — 칭호 마스터

| 컬럼 | 설명 |
|------|------|
| `ttl_id` | PK |
| `team_id` | 팀 |
| `ttl_kind_enm` | `auto` / `awarded` |
| `ttl_ctgr_cd` | 카테고리 (running, triathlon, trail, cycling, awarded) |
| `ttl_nm` | 칭호명 |
| `cond_rule_json` | 자동 칭호 조건 JSON. awarded는 null |
| `base_pt` | 기본 점수 |
| `use_yn` | false면 엔진이 평가하지 않음 |
| `vers` / `del_yn` | 소프트 삭제 컨벤션 |

### `mem_ttl_rel` — 회원 보유 칭호

| 컬럼 | 설명 |
|------|------|
| `mem_ttl_id` | PK |
| `team_mem_id` | 보유자 |
| `ttl_id` | 칭호 |
| `vers` | 0 = 활성, 1 이상 = 회수된 이력 |
| `del_yn` | true = 회수됨 |
| `pt_chg_rsn_cd` | `initial_grant` / `revoke` / `manual_adjust` 등 |
| `grnt_by_mem_id` | 수여한 관리자 ID (자동 수여 시 null) |
| `grnt_rsn_txt` | 수여 사유 텍스트 |

**UNIQUE 제약**: `(team_mem_id, ttl_id, vers)` — 회수 시 `vers+1`로 올려야 `vers=0` 슬롯이 비워져 재수여가 가능하다.

**수여/회수/재수여 흐름**:
```
수여:   vers=0, del_yn=false INSERT
회수:   vers=0 → vers=1, del_yn=true UPDATE  (vers=0 슬롯 해제)
재수여: vers=0, del_yn=false INSERT           (슬롯이 비어있으므로 충돌 없음)
```

---

## 3. 자동 칭호 — 세 가지 핵심 개념

### 트리거 (TriggerKind)
"언제 칭호를 검사할지"를 결정한다. 서버 액션에서 엔진을 호출할 때 지정한다.

```
race_record   — 대회 기록 저장 시
mileage_run   — 마일리지런 기록 등록 시  (호출부 미연결 — 아래 §9 참고)
attendance    — 로그인/출석 시           (호출부 미연결 — 아래 §9 참고)
manual_sweep  — 관리자 일괄 재계산 시
```

### 조건 (CondRule)
"무엇을 보고 칭호를 줄지"를 결정한다. 관리자 페이지에서 칭호마다 `cond_rule_json`으로 DB에 저장한다.

| 조건 유형 | 설명 | 평가 함수 상태 |
|-----------|------|---------------|
| `race_pb_under_sec` | 특정 종목 PB ≤ N초 | 구현 완료 |
| `race_finish_count` | 특정 종목 완주 ≥ N회 | 구현 완료 |
| `attendance_count` | 기록 등록 누적 ≥ N회 | 구현 완료 |
| `membership_days` | 팀 가입 후 ≥ N일 | 구현 완료 |
| `mileage_run_complete` | 마일리지런 완주 | **stub — 항상 false 반환** (마일리지런 스키마 확정 후 구현 필요) |

### 트리거-조건 연결표 (TRIGGER_COND_MAP)
`lib/titles/types.ts`에 소스로 관리한다. 트리거가 발생하면 이 맵에 등록된 조건 유형을 가진 칭호만 평가한다.

```typescript
export const TRIGGER_COND_MAP = {
  race_record:  ["race_pb_under_sec", "race_finish_count"],
  mileage_run:  ["mileage_run_complete"],
  attendance:   ["attendance_count", "membership_days"],
  manual_sweep: ["race_pb_under_sec", "race_finish_count",
                 "mileage_run_complete", "attendance_count", "membership_days"],
} satisfies Record<TriggerKind, CondRule["type"][]>;
```

---

## 4. 자동 칭호 전체 흐름

```
서버 액션 (예: 기록 저장)
  │
  └─ evaluateAndGrantTitles({ trigger: "race_record", teamId, teamMemId })
       │
       ├─ 1. TRIGGER_COND_MAP["race_record"] 조회
       │      → ["race_pb_under_sec", "race_finish_count"]
       │
       ├─ 2. team_mem_id → mem_id 변환 (rec_race_hist 등이 mem_id 기반)
       │
       ├─ 3. ttl_mst에서 auto + use_yn=true 칭호 전체 조회
       │      → cond_rule_json.type이 허용 목록에 있는 칭호만 필터링
       │
       ├─ 4. mem_ttl_rel에서 현재 활성(vers=0, del_yn=false) 보유 칭호 조회
       │      → 중복 수여 방지
       │
       └─ 5. 남은 칭호 조건 평가 → 통과하면 mem_ttl_rel INSERT (vers=0)
```

---

## 5. 파일 구조

```
lib/titles/
  types.ts        CondRule 타입, TriggerKind, TRIGGER_COND_MAP, TitleEvalContext
  evaluators.ts   조건별 순수 평가 함수 (DB 조회만, INSERT 없음)
  engine.ts       evaluateAndGrantTitles() 핵심 엔진

app/actions/
  save-race-record.ts       기록 저장 시 엔진 호출 (race_record 트리거)
  admin/sweep-titles.ts     관리자 전체 멤버 일괄 재평가 (manual_sweep 트리거)
  admin/grant-title.ts      관리자 수동 수여
  admin/revoke-title.ts     관리자 수동 회수
```

---

## 6. cond_rule_json 예시

관리자 페이지(`/admin/system/titles`)에서 칭호 등록 시 이 형식으로 입력한다.

| 조건 유형 | cond_rule_json 예시 |
|-----------|---------------------|
| `race_pb_under_sec` | `{"type":"race_pb_under_sec","sport":"FULL","sec":10800}` |
| `race_finish_count` | `{"type":"race_finish_count","sport":"10K","count":1}` |
| `attendance_count` | `{"type":"attendance_count","count":100}` |
| `membership_days` | `{"type":"membership_days","days":365}` |
| `mileage_run_complete` | `{"type":"mileage_run_complete"}` ← 현재 미동작 |

**sport 값** (`comp_evt_type` 기준): `FULL`, `HALF`, `10K`, `5K`, `IRONMAN`, `70.3`, `SPRINT`

> **현재 DB 상태**: `ttl_mst`에 등록된 칭호들의 `cond_rule_json`이 모두 null이라 자동 부여가 실제로 동작하지 않는다. 관리자 페이지에서 조건을 입력해야 한다.

---

## 7. 새 조건(CondRule) 추가 방법

새로운 조건 유형을 추가하고 싶을 때 아래 순서대로 작업한다.

### Step 1 — `lib/titles/types.ts` : CondRule 타입 추가

```typescript
/** 예: 특정 지역 대회 완주 경험이 있는 경우 */
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

### Step 2 — `lib/titles/evaluators.ts` : 평가 함수 + switch 케이스 추가

```typescript
// 1) 평가 함수 작성
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

// 2) evaluateCondition() switch에 케이스 추가
case "region_race_finish":
  return evalRegionRaceFinishInternal(rule, memId, db);
```

`switch` 맨 아래의 `rule satisfies never`가 케이스를 빠뜨리면 컴파일 에러로 알려준다.

### Step 3 — `lib/titles/types.ts` : TRIGGER_COND_MAP에 등록

어떤 트리거에서 이 조건을 평가할지 지정한다. `manual_sweep`에도 반드시 추가한다.

```typescript
export const TRIGGER_COND_MAP = {
  race_record:  ["race_pb_under_sec", "race_finish_count", "region_race_finish"],  // ← 추가
  // ...
  manual_sweep: [..., "region_race_finish"],  // ← 반드시 추가
};
```

### Step 4 — 관리자 페이지에서 칭호 등록

`/admin/system/titles`에서 신규 칭호를 등록할 때 `cond_rule_json`에 입력한다.

```json
{ "type": "region_race_finish", "region": "제주" }
```

---

## 8. 새 트리거 추가 방법

새로운 이벤트(예: "첫 로그인")에서 칭호를 검사하고 싶을 때.

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

```typescript
export const TRIGGER_COND_MAP = {
  // ... 기존 항목 ...
  first_login: ["membership_days"],  // ← 이 트리거에서 평가할 조건 유형 지정
} satisfies Record<TriggerKind, CondRule["type"][]>;
```

`satisfies`가 TriggerKind에 있는 모든 트리거가 맵에 등록됐는지 컴파일 타임에 검사한다.

### Step 3 — `lib/titles/types.ts` : TitleEvalContext에 추가

```typescript
export type TitleEvalContextFirstLogin = {
  trigger: "first_login";
  teamId: string;
  teamMemId: string;
};

export type TitleEvalContext =
  | TitleEvalContextRaceRecord
  | TitleEvalContextMileageRun
  | TitleEvalContextAttendance
  | TitleEvalContextManualSweep
  | TitleEvalContextFirstLogin;  // ← 추가
```

### Step 4 — 해당 서버 액션에 엔진 호출 추가

```typescript
import { evaluateAndGrantTitles } from "@/lib/titles/engine";

// fire-and-forget — 반드시 await 없이 .catch()만 붙인다.
// 칭호 부여 실패가 본 액션을 실패시키면 안 된다.
evaluateAndGrantTitles({
  trigger: "first_login",
  teamId,
  teamMemId: member.team_mem_id,
}).catch((e) => console.error("[title-engine] first_login 평가 실패", e));
```

---

## 9. 현재 구현 상태

### 트리거 연결 현황

| 트리거 | 호출 위치 | 상태 |
|--------|-----------|------|
| `race_record` | `app/actions/save-race-record.ts` | ✅ 연결됨 |
| `manual_sweep` | `app/actions/admin/sweep-titles.ts` | ✅ 연결됨 |
| `mileage_run` | 마일리지런 기록 저장 액션 | ❌ 호출부 없음 |
| `attendance` | 로그인 액션 | ❌ 호출부 없음 |

### 미구현 항목

| 항목 | 설명 |
|------|------|
| `mileage_run` 트리거 연결 | 마일리지런 기록 저장 액션에 호출부 추가 필요 |
| `mileage_run_complete` 평가 함수 | `lib/titles/evaluators.ts`의 `evalMileageRunCompleteInternal`이 stub. 마일리지런 스키마 확정 후 구현 |
| `attendance` 트리거 연결 | 로그인 액션에 호출부 추가 필요 (평가 함수는 완성) |
| 칭호 획득 알림 | 신규 칭호 획득 시 토스트 알림 |
| 희귀도 보정 배치 | 주 1회 `aply_pt` 재계산 |

---

## 10. 관리자 운영 도구

### 칭호 관리 페이지 (`/admin/system/titles`)
- **신규 칭호 등록**: 칭호명, 유형(자동/수여), 카테고리, `cond_rule_json` 입력
- **칭호 수정**: 조건 변경, 활성화/비활성화 (`use_yn`)
- **일괄 재계산 버튼**: 전체 활성 멤버를 대상으로 모든 조건 재평가

### 회원 관리 페이지 (`/admin/members`)
- **수동 수여**: 특정 멤버에게 수여 칭호 직접 부여
- **수동 회수**: 부여된 칭호 회수 (이력은 `vers+1, del_yn=true`로 보존)

### 운영 주의사항
- `use_yn = false` 칭호는 엔진이 평가하지 않는다.
- 조건을 변경해도 이미 부여된 칭호는 자동 회수되지 않는다 (수동 회수 필요).
- 일괄 재계산은 이미 보유한 칭호를 중복 부여하지 않는다 — 새 칭호 추가 후 소급 적용 시 사용한다.
