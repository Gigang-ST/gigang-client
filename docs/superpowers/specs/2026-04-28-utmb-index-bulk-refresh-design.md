# UTMB 인덱스 일괄 갱신 (관리자) — 디자인

## 배경

UTMB.world 인덱스 시스템이 개편되어 회원들의 점수가 재계산되었다. 현재 `mem_utmb_prf` 테이블의 `utmb_idx` 값은 모두 2026-04-18 시점에 한 번 백필된 후 자동 갱신 메커니즘이 없으며, 회원이 본인 프로필에서 직접 입력해야만 최신화된다. 운영자가 한 번에 전 회원 인덱스를 새로 긁어와 저장할 수 있는 관리자 도구가 필요하다.

## 검증된 사실

UTMB.world 페이지 구조 분석 결과(2026-04-28):

- meta description의 `Index is {N}` 포맷은 **유지** → 기존 `app/actions/utmb.ts#fetchUtmbIndex` 정규식이 그대로 동작
- `__NEXT_DATA__.props.pageProps.results.results` 배열도 **유지** → 최근 대회 추출 로직 그대로 동작
- 새로 등장한 `__NEXT_DATA__.props.pageProps.performanceIndexes`(general/20k/50k/100k/100m 카테고리별 점수)는 본 작업 범위에서 **사용하지 않음** (YAGNI)

따라서 **파서 코드 수정 없이** 일괄 트리거만 추가하면 된다.

## 목표

- 관리자 한 번 클릭으로 등록된 모든 회원 UTMB 인덱스를 utmb.world에서 재조회해 DB에 저장
- 회원별 변경 전/후를 한눈에 확인 가능
- 개별 회원 실패가 다른 회원 처리를 막지 않음

## 비목표

- 자동(cron) 갱신 — 수동 트리거만
- 거리별 sub-index(20k/50k/100k/100m) 저장 — 향후 별도 과제
- 회원 본인이 트리거하는 갱신 흐름 변경 — 기존 프로필 폼 그대로
- 별도 audit log 테이블 — `upd_at`으로 충분

## 아키텍처

### 진입점

- `/admin` 대시보드(`app/(info)/admin/page.tsx`)에 신규 "도구" 섹션 추가
- "UTMB 인덱스 갱신" 카드 한 장 → 클릭 시 `/admin/utmb-refresh`로 이동
- 카드 보조 텍스트: 마지막 갱신 시각(가장 최근 `mem_utmb_prf.upd_at` MAX 값)

### 신규 페이지

`app/(info)/admin/utmb-refresh/page.tsx` (서버 컴포넌트)

- `verifyAdmin()` 통과 못 하면 `redirect("/")`
- 페이지에 등록된 UTMB 회원 수, 마지막 갱신 시각 표시
- 클라이언트 컴포넌트 `<UtmbRefreshClient />`에 위 데이터를 props로 전달

`components/admin/utmb-refresh-client.tsx` (클라이언트 컴포넌트)

- "전체 갱신 시작" 버튼
- 실행 중: 버튼 disabled + 스피너 + 안내 문구("자리를 비우지 말고 잠시만 기다려 주세요")
- 완료 후: 결과 요약 배지 + 결과 표

### 서버 액션

`app/actions/admin/refresh-utmb-indexes.ts`

```ts
"use server";

type RefreshRow = {
  memId: string;
  name: string;
  before: number;
  after: number | null;
  status: "updated" | "unchanged" | "failed";
  error?: string;
};

type RefreshResult = {
  rows: RefreshRow[];
  summary: { updated: number; unchanged: number; failed: number };
};

export async function refreshUtmbIndexes(): Promise<RefreshResult> { ... }
```

내부 흐름:

1. `verifyAdmin()` — 비관리자면 throw
2. service role 클라이언트로 `mem_utmb_prf`(vers=0, del_yn=false) + `mem_mst`(이름) join 조회
3. for-of 루프, 각 행마다:
   - `fetchUtmbIndex(row.utmb_prf_url)` 호출
   - 결과 분기:
     - 값 변경: `update` `utmb_idx`, `rct_race_nm`, `rct_race_rec`, `upd_at`
     - 값 동일: `update` `upd_at`만 (마지막 시도 시각 추적)
     - 실패: DB 안 건드림, 에러 사유 수집
   - `setTimeout 500ms` 후 다음 회원
4. 결과 배열 반환 (정렬: updated → failed → unchanged)

## 데이터 흐름

```
[관리자 클릭]
    ↓
refreshUtmbIndexes() (서버 액션)
    ↓
verifyAdmin()
    ↓
mem_utmb_prf 전체 조회 (service role)
    ↓
for row in rows:
   fetchUtmbIndex(row.url)
   분기 처리 + DB update
   sleep 500ms
    ↓
return { rows, summary }
    ↓
클라이언트: 결과 표 렌더 + 페이지 라우터 refresh()로 카드 "마지막 갱신" 갱신
```

## UI 사양

### 결과 표 컬럼

| 멤버 | 변경 전 | 변경 후 | 상태 |
|------|--------|--------|------|

### 상태 표시

| 상태 | 배지 색 | 본문 강조 |
|------|--------|----------|
| `갱신됨` (updated) | `--success` | "변경 후" 굵게 |
| `변동 없음` (unchanged) | 회색 (muted) | 일반 |
| `실패` (failed) | `--destructive` | 사유를 caption으로 노출 |

### 페이지 레이아웃

```
[BackHeader: "UTMB 인덱스 갱신"]

[설명 카드 (CardItem)]
  대상: 등록된 N명
  마지막 갱신: 2026-04-18 13:43

[Button: "전체 갱신 시작"]
  실행 중 → disabled + LoadingSpinner

[결과 요약 배지] (실행 후에만)
  ● 갱신 N   ● 변동 없음 N   ● 실패 N

[결과 표]
  멤버 | 변경 전 | 변경 후 | 상태
  (정렬: updated → failed → unchanged)
```

### 디자인 토큰 준수

DESIGN.md에 따라:
- 텍스트: `<H2>`, `<Body>`, `<Caption>` 사용 (매직넘버 금지)
- 카드: `CardItem`
- 색상: `--success`, `--destructive`, `--muted-foreground` 토큰만
- 간격: 페이지 `px-6`, 섹션 `gap-7`

## 에러 처리

| 케이스 | 처리 | 표시 |
|--------|------|------|
| `ok: true`, 값 변경 | `utmb_idx`, `rct_race_*`, `upd_at` 모두 update | `갱신됨` |
| `ok: true`, 값 동일 | `upd_at`만 update | `변동 없음` |
| URL 형식 오류 | DB 안 건드림 | `실패: URL 형식 오류` |
| 프로필 없음(404) | DB 안 건드림 | `실패: 프로필 없음` |
| 인덱스 미부여 | DB 안 건드림 | `실패: 인덱스 미부여` |
| utmb 연결 실패 | DB 안 건드림 | `실패: utmb 연결 실패` |
| 예상치 못한 throw | catch 흡수 | `실패: 알 수 없는 오류` |

원칙:
- **continue-on-error**: 한 회원 실패해도 루프 진행
- 트랜잭션 X — 각 회원 update 독립
- 부분 성공 보존: 도중 페이지 닫혀도 처리된 행은 유지

Rate limit 보호:
- 매 fetch 사이 500ms delay
- 50명 × ~1.5초 = ~75초 (Vercel 함수 limit 300s 안)
- 100명 초과 시 chunk 처리 검토 (현재 한참 못 미침)

## 권한 & 보안

- `/admin/utmb-refresh` 페이지: `verifyAdmin()` → 비관리자 `redirect("/")`
- 서버 액션: `verifyAdmin()` 진입 시 검증, throw로 차단
- DB 쓰기: `createServiceRoleClient`로 RLS 우회 (관리자가 다른 회원 행 갱신해야 함)
  - service role 클라이언트는 액션 함수 스코프 안에서만 생성·사용·폐기
  - 환경변수 `SUPABASE_SERVICE_ROLE_KEY` 재사용 (lib/env.ts에 이미 존재)
- 외부 fetch: `User-Agent: Mozilla/5.0`, `cache: "no-store"` 유지 (기존 `fetchUtmbIndex` 그대로)
- URL 검증: `fetchUtmbIndex` 내부 정규식이 utmb.world 도메인만 허용 (SSRF 방지)
- 동시 실행 방어 X — 관리자 적고 결과 동일

## 검증 계획

자동 테스트는 추가하지 않음 (프로젝트에 테스트 인프라 부재, YAGNI).

수동 QA 체크리스트:

1. 비관리자 계정으로 `/admin/utmb-refresh` 직접 접근 → `/`로 리다이렉트되는지
2. 관리자 계정에서 회원 한 명의 `utmb_prf_url`을 의도적으로 잘못된 값으로 변경 (DB 직접 수정)
3. "전체 갱신 시작" 클릭 → 버튼 disabled + 스피너 → 완료 후 결과 표 노출
4. 결과 표 검증:
   - `갱신됨` 행: 변경 전/후 숫자가 다름
   - `변동 없음` 행: 변경 전/후 동일
   - `실패` 행: 빨간 배지 + 사유 표시
5. DB 직접 확인: 갱신된 행의 `utmb_idx`, `upd_at`이 실제 변경됨
6. 새로고침: 결과 표 사라지지만 카드의 "마지막 갱신" 시각은 갱신
7. 모바일 viewport(375px)에서 결과 표 가독성

`chrome-devtools` MCP로 dev 환경에서 위 흐름 1회 수행 권장.

## 변경 파일 목록

신규:
- `app/actions/admin/refresh-utmb-indexes.ts` — 일괄 갱신 서버 액션
- `app/actions/admin/get-utmb-last-refreshed-at.ts` — 카드의 "마지막 갱신" 시각 조회 액션 (`mem_utmb_prf.upd_at`의 MAX)
- `app/(info)/admin/utmb-refresh/page.tsx` — 신규 페이지 (서버 컴포넌트)
- `components/admin/utmb-refresh-client.tsx` — 버튼 + 결과 표 (클라이언트)

수정:
- `app/(info)/admin/page.tsx` — "도구" 섹션과 "UTMB 인덱스 갱신" 카드 추가, 마지막 갱신 시각 표시

`get-admin-stats.ts`는 건드리지 않음 (기존 카드 데이터에 영향을 주지 않기 위해 신규 액션으로 분리).

DB 마이그레이션: 없음.
