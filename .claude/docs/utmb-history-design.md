# UTMB 대회 히스토리 연동 설계

> 작성일: 2026-06-01  
> 상태: 설계 완료 (미구현)  
> 목적: UTMB 프로필에서 트레일런 대회 히스토리 전체를 가져와 칭호 조건 평가에 활용

---

## 배경 및 목적

현재는 대회 기록을 수동으로 `rec_race_hist`에 등록해야 칭호 조건 평가에 반영된다.  
트레일런 대회는 UTMB가 공식 집계하므로, UTMB 프로필에서 히스토리를 자동으로 가져오면 수동 등록 없이 칭호를 부여할 수 있다.

**원칙:**
- 트레일런(`trail_run`) 종목은 `rec_race_hist` 수동 등록을 칭호 조건에 사용하지 않는다.
- 대신 `mem_utmb_race_hist` (새 테이블)에서 가져온 UTMB 히스토리를 사용한다.
- 로드런/울트라/철인3종/사이클 등 다른 종목은 기존 `rec_race_hist` 그대로 유지.

---

## 1. UTMB 페이지 데이터 구조 파악

### 현재 파싱 중인 필드 (`app/actions/utmb.ts`)

| 출처 | 필드 | 저장 위치 |
|------|------|-----------|
| `<meta name="description">` | UTMB Index 수치 | `mem_utmb_prf.utmb_idx` |
| `<meta name="title">` | 이름 | (저장 안 함) |
| `__NEXT_DATA__.props.pageProps.results.results[].race` | 최근 대회명 | `mem_utmb_prf.rct_race_nm` |
| `__NEXT_DATA__.props.pageProps.results.results[].dateIso` | 날짜 | (정렬에만 사용) |
| `__NEXT_DATA__.props.pageProps.results.results[].time` | 기록 | `mem_utmb_prf.rct_race_rec` |
| `__NEXT_DATA__.props.pageProps.results.results[].isDnf` | DNF 여부 | `mem_utmb_prf.rct_race_rec` ("DNF") |

### UTMB 페이지에 표시되는 추가 필드 (파싱 가능 추정)

실제 프로필 페이지(https://utmb.world/runner/7965644.hojung.kang)에서 확인된 컬럼:

| 필드명(추정) | 설명 | 예시 값 |
|-------------|------|---------|
| `race` | 대회명 | "OXFAM TRAILWALKER 25K" |
| `dateIso` | 날짜(ISO) | "2026-05-16" |
| `distance` | 거리(km) | 26.3 |
| `elevation` | 누적 고도(m+) | 1063 |
| `time` | 완주 기록(HH:MM:SS) | "06:08:05" |
| `rankOverall` | 전체 순위 | 17 |
| `rankOverallTotal` | 전체 참가자 수 | 276 |
| `rankGender` | 성별 순위 | 5 |
| `rankGenderTotal` | 성별 참가자 수 | 120 |
| `isDnf` | DNF 여부 | false |
| `utmbScore` / `points` | UTMB Index 기여 점수 | 636 (최고점) |

> **주의**: `__NEXT_DATA__` JSON의 실제 키 이름은 구현 시점에 브라우저 소스 보기로 직접 확인 필요.  
> 현재 코드에서 `latest.race`, `latest.isDnf`, `latest.time`, `latest.dateIso` 접근하는 것으로 봐서 이 4개는 확실하고, 나머지는 실제 파싱 시 검증 필요.

---

## 2. DB 설계

### 신규 테이블: `mem_utmb_race_hist`

```sql
create table mem_utmb_race_hist (
  utmb_race_id  uuid primary key default gen_random_uuid(),
  mem_id        uuid not null references mem_mst(mem_id),
  race_nm       text not null,           -- 대회명
  race_dt       date not null,           -- 대회 날짜
  dist_km       numeric(6,2),            -- 거리(km)
  elev_m        integer,                 -- 누적 고도(m+)
  fin_time      text,                    -- 완주 기록 (HH:MM:SS, DNF이면 null)
  fin_time_sec  integer,                 -- 완주 기록(초, 칭호 조건 계산용)
  is_dnf        boolean not null default false,
  rank_overall  integer,                 -- 전체 순위
  rank_gender   integer,                 -- 성별 순위
  utmb_score    integer,                 -- UTMB Index 기여 점수
  synced_at     timestamptz not null default now(),
  vers          integer not null default 0,
  del_yn        boolean not null default false
);

create index on mem_utmb_race_hist(mem_id, race_dt desc);
```

### 기존 테이블 변경 없음

`mem_utmb_prf`는 그대로 유지. `rct_race_nm`, `rct_race_rec`은 프로필 표시용으로 계속 사용.

---

## 3. 데이터 수집 흐름

### 트리거 시점

| 시점 | 설명 |
|------|------|
| 프로필 최초 등록 | `saveUtmbProfile()` 호출 시 히스토리도 함께 저장 |
| 수동 새로고침 | 관리자 페이지 "UTMB 새로고침" 버튼 → 현재 `refresh-utmb-indexes.ts` 확장 |
| 주기적 배치 | (선택) 월 1회 cron으로 자동 동기화 |

### 수집 로직 (`fetchUtmbIndex` 확장)

```typescript
// app/actions/utmb.ts 수정안
type UtmbRaceResult = {
  raceName: string;
  dateIso: string;
  distanceKm: number | null;
  elevationM: number | null;
  finTime: string | null;      // "HH:MM:SS" or null
  finTimeSec: number | null;   // 칭호 계산용
  isDnf: boolean;
  rankOverall: number | null;
  rankGender: number | null;
  utmbScore: number | null;
};

type UtmbResult =
  | {
      ok: true;
      index: number;
      name: string;
      recentRaceName: string | null;
      recentRaceRecord: string | null;
      raceHistory: UtmbRaceResult[];   // 신규
    }
  | { ok: false; error: string };
```

`__NEXT_DATA__`에서 `results` 배열 전체를 순회하며 위 타입으로 매핑.  
`finTime`(HH:MM:SS)을 초로 변환하는 유틸 필요 (`lib/time.ts` 등).

---

## 4. 칭호 조건 연동 설계

### evaluator 변경 원칙

트레일런(`sport_ctgr = "trail_run"`) 조건을 평가할 때:
- `rec_race_hist` 대신 `mem_utmb_race_hist` 조회
- 또는 두 소스를 합쳐서(union) 평가

가장 단순한 접근: **evaluator에서 trail_run일 때 소스를 분기**

```typescript
// evaluators.ts 개념 코드
async function evalRaceFinishCountInternal(rule, memId, db) {
  if (rule.sport_ctgr === "trail_run") {
    // UTMB 히스토리에서 조회
    const { count } = await db
      .from("mem_utmb_race_hist")
      .select("*", { count: "exact", head: true })
      .eq("mem_id", memId)
      .eq("is_dnf", false)
      .eq("del_yn", false);
    return (count ?? 0) >= rule.count;
  }
  // 기존 rec_race_hist 로직
  ...
}
```

영향받는 CondRule 타입:
| CondRule | 변경 필요 여부 | 비고 |
|----------|--------------|------|
| `race_finish_count` | O | `sport_ctgr=trail_run`이면 UTMB 소스 |
| `race_pb_under_sec` | O | `fin_time_sec` 컬럼으로 PB 계산 |
| `race_finish_in_month_range` | O | `race_dt`의 월로 필터 |
| `race_finish_all_of` | O | trail_run 포함 시 |
| `race_finish_total` | △ | trail_run을 포함할지 정책 결정 필요 |
| `race_finish_in_year` | △ | 동일 |
| `race_rank_by_gender` | O | UTMB 히스토리의 `rank_gender` 활용 가능 |
| `race_pb_faster_than_member` | O | trail_run PB 비교 시 |

### MemberSnapshot 확장

`snapshot.ts`의 `MemberSnapshot` 타입에 `utmbRaceHist` 필드 추가:

```typescript
type UtmbRaceHistRow = {
  race_nm: string;
  race_dt: string;
  dist_km: number | null;
  fin_time_sec: number | null;
  is_dnf: boolean;
  rank_overall: number | null;
  rank_gender: number | null;
};

type MemberSnapshot = {
  // ... 기존 필드
  utmbRaceHist: UtmbRaceHistRow[];  // 신규
};
```

---

## 5. 구현 순서 (추후 착수 시)

1. **데이터 파악** — 실제 UTMB 프로필 HTML 소스에서 `__NEXT_DATA__` 키 이름 확인
2. **DB 마이그레이션** — `mem_utmb_race_hist` 테이블 생성
3. **`fetchUtmbIndex` 확장** — `raceHistory` 배열 파싱 추가
4. **`saveUtmbProfile` 확장** — 히스토리 upsert 로직 추가
5. **`refresh-utmb-indexes.ts` 확장** — 배치 갱신에 히스토리 동기화 포함
6. **evaluators.ts 수정** — trail_run 조건 소스 분기
7. **snapshot.ts 수정** — `utmbRaceHist` 필드 추가 및 bulk sweep 연동
8. **기존 칭호 조건 검토** — trail_run 관련 조건 재정의 필요 여부 확인

---

## 6. 미결 사항 (구현 전 결정 필요)

- [ ] `race_finish_total`, `race_finish_in_year`에 UTMB 히스토리를 포함할지 (트레일런 이중 카운팅 방지)
- [ ] 수동 등록된 `rec_race_hist` 트레일런 기록은 칭호 평가에서 완전히 제외할지, 병존할지
- [ ] UTMB에 등록되지 않은 소규모 트레일런 대회 처리 방침
- [ ] `dist_km` / `elev_m` 기반 새 칭호 조건 추가 여부 (예: "100km 이상 완주")
- [ ] 동기화 주기 및 방식 (사용자가 직접 갱신 vs 자동 배치)
