# OCR 기록입력 UX 개선 설계

작성일: 2026-06-14
대상: `RaceRecordDialog` OCR 기반 기록입력 흐름 개선 (기록↔대회 링크 = 정합성 유지)

## 배경

[기록증 OCR 자동입력](2026-06-14-기록증-ocr-자동입력-design.md) 기능 도입 후 실사용에서 마찰 발견:

1. **OCR 결과가 "대회 추가" 우회에서 사라짐.** 매칭되는 대회가 없어 `대회 추가`로 가면, 새 대회를 만들어도 아무 일도 안 일어난다(`race-record-dialog.tsx`의 `onCreated={(_comp) => {}}` 빈 함수). 새 대회가 자동 선택되지 않아 사용자는 진행이 막히고, 추출 결과가 날아간 것처럼 느낀다.
2. **토큰 재호출 낭비.** 같은 기록증을 다시 올리면 Gemini를 또 호출한다. 비용이 든다.

전제: 기록은 대회에 묶는다(`rec_race_hist.comp_id` 유지). 랭킹·칭호·대회 탭 정합성을 위해 모델·스키마·랭킹 쿼리는 변경하지 않는다. 이 문서는 그 제약 안에서 OCR 입력 UX만 개선한다.

## 목표

- OCR 결과를 세션 내내 보존하고, "대회 추가" 우회를 건너도 살아남게 한다.
- 같은 사진은 Gemini를 다시 부르지 않는다(토큰 절약).
- 대회 추가가 거의 자동이 되도록 OCR 정보로 prefill하고, 생성 후 그 대회로 직결한다.

## 변경 단위

### 1. 사진 해시 캐시 — `lib/ocr/ocr-cache.ts` (신규)

클라이언트 전용 유틸. 같은 이미지면 서버 액션(Gemini)을 건너뛴다.

```typescript
// 이미지 바이트 → SHA-256 hex
export async function hashImageFile(file: File): Promise<string>;

// sessionStorage "ocr:<hash>" 조회/저장 (ExtractedRecord JSON)
export function getCachedExtraction(hash: string): ExtractedRecord | null;
export function setCachedExtraction(hash: string, data: ExtractedRecord): void;
```

- 해시: `crypto.subtle.digest("SHA-256", await file.arrayBuffer())` → hex 문자열.
- 저장소: `sessionStorage` (탭 단위, 닫으면 비움 — 누적/스테일 방지). 키 `ocr:<hash>`.
- 직렬화 실패/용량 초과/`sessionStorage` 미가용 시 조용히 무시(캐시는 best-effort, 실패해도 정상 추출로 폴백).
- `ExtractedRecord` 타입은 `@/lib/ocr/race-record`에서 import.

### 2. 다이얼로그 업로드 핸들러 — `components/profile/race-record-dialog.tsx`

`handleImageSelected`를 캐시 경유로 변경:

```
1. setImagePreview (기존)
2. hash = await hashImageFile(file)
3. cached = getCachedExtraction(hash)
   - HIT  → applyOcrResult(cached); 로딩 없이 즉시. (토큰 0)
   - MISS → setOcrLoading(true) → 서버 액션 호출
             → 성공: setCachedExtraction(hash, data); applyOcrResult(data)
             → 실패: setOcrError(메시지)
```

인메모리 stash(`ocrTimes`/`raceDate`/`searchQuery`)는 기존대로 유지되어 세션 내 보존. 변경 없음.

### 3. 대회 추가 직결 — `components/profile/race-record-dialog.tsx`

`onCreated` 빈 함수를 본체로 교체:

```typescript
onCreated={(comp) => {
  setRegisterOpen(false);
  handleSelectCompetition(comp, { useCalendarPickForRecordDate: true });
}}
```

- `handleSelectCompetition`은 이미 `selectedComp` 설정 + (참가종목 있으면) `applyOcrTimesToStep3()` 호출 + step 진행을 한다. 새로 만든 대회는 참가종목이 없으므로 step 2(코스 선택)로 가고, 코스 선택 시 `applyOcrTimesToStep3()`가 시간 prefill.
- `useCalendarPickForRecordDate: true`로 OCR/달력 날짜(`raceDate`)를 기록일로 사용.
- 생성된 `comp`(= `Competition`)에는 새 대회라 `event_types`가 비어 있을 수 있다. 그래도 코스 옵션은 종목 기본값 + 기타(직접입력)로 채워지므로(`eventTypeOptions` 기존 로직) 코스 선택 가능.

`Competition` 타입 정합: `CompetitionRegisterDialog.onCreated`가 넘기는 객체가 다이얼로그 내부 `Competition` 형태(`id/title/start_date/location/sport/event_types`)와 호환되는지 확인하고, 필요한 필드만 매핑한다.

### 4. 대회 추가 폼 prefill — `components/races/competition-register-dialog.tsx`

`prefillTitle?: string` prop 추가 (현재 `prefillStartDate`만 존재).

- props 인터페이스에 `prefillTitle?: string` 추가.
- `reset` 기본값 병합부(현재 `...(prefillStartDate?.trim() ? { startDate: prefillStartDate.trim() } : {})`)에 동일 패턴으로 `...(prefillTitle?.trim() ? { title: prefillTitle.trim() } : {})` 추가.
- `useEffect` 의존성 배열에 `prefillTitle` 추가.

`race-record-dialog.tsx`에서 전달:

```tsx
<CompetitionRegisterDialog
  ...
  prefillStartDate={raceDate.trim() || undefined}
  prefillTitle={ocrCompetitionName?.trim() || undefined}
  onCreated={(comp) => { ... }}
/>
```

- OCR로 읽은 대회명은 `applyOcrResult`에서 `searchQuery`에 이미 담긴다. 별도 상태 추가 없이 `searchQuery`를 `prefillTitle`로 넘긴다(검색어 = OCR 대회명).

## 데이터 흐름

```
사진 선택
  → SHA-256 해시 → sessionStorage("ocr:<hash>") 조회
      ├ HIT  → 캐시 ExtractedRecord 즉시 적용 (Gemini 호출 0)
      └ MISS → 서버 액션(Gemini) → 결과 캐시 저장 → 적용
  적용(applyOcrResult): raceDate→날짜, competitionName→searchQuery, 시간→ocrTimes stash, step 1
      │
  step 1: 날짜로 대회 목록 자동 로딩 + 이름으로 좁힘
      ├ 맞는 대회 있음 → 선택 → (step 2 코스) → step 3 시간 prefill
      └ 없음 → 대회 추가(이름·날짜 prefill) → 생성 → onCreated 직결
                → handleSelectCompetition(새 대회) → step 2 코스 → step 3 시간 prefill
```

## 에러 / 엣지

- 캐시 실패(스토리지 미가용/용량/직렬화): 조용히 무시하고 정상 서버 호출. 기능 차단 없음.
- 해시 실패(`crypto.subtle` 미가용): 캐시 건너뛰고 서버 호출.
- 생성된 대회에 코스 설정 없음: 종목 기본 코스 + 기타로 선택 가능(기존 `resolveOrCreateCompEvtId`가 저장 시 코스 자동 생성).
- OCR 추출 실패: 기존대로 안내 후 수동 진행.

## 테스트

- `lib/ocr/ocr-cache.ts`: 임시 node 스크립트로 해시 일관성(같은 바이트 → 같은 hex), get/set 라운드트립(sessionStorage 모킹) 검증.
- 통합(수동, 로컬 Supabase 기동 후): 같은 사진 2회 업로드 시 2번째는 네트워크 호출 없음(개발자도구 Network 확인). 대회 추가 → 자동 선택 → 시간 prefill 확인. 대회 추가 폼에 이름·날짜 prefill 확인.
- `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build` 컴파일.

## 범위 밖 (YAGNI)

- 명시적 중복 경고(step 1 날짜 목록이 후보를 이미 노출).
- 서버측/DB 캐시(sessionStorage로 충분).
- 스키마·랭킹 쿼리 변경(정합성 모델 유지).
- "지난번 결과 이어서" 재오픈 복원 프롬프트(사진 해시 캐시로 같은 사진 재업로드 시 자동 해결).
