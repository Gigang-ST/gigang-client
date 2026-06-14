# 기록증 OCR 자동 입력 설계

작성일: 2026-06-14
대상 기능: 대회 기록증 사진을 Gemini 2.5 Flash로 읽어 기록 입력 폼을 자동으로 채우기

## 배경 / 목적

현재 `RaceRecordDialog`(`components/profile/race-record-dialog.tsx`)는 3단계 수동 입력이다.

1. 대회 선택 (DB에 등록된 대회 — 최근 3개월 참가 목록 또는 날짜+이름 검색)
2. 종목/코스 선택 (10K / HALF / FULL, 트라이애슬론 등)
3. 기록 입력 (완주 시간. 트라이애슬론은 수영/바이크/런 분할 + 트랜지션 자동계산)

완주 후 기록증 사진을 들고 시간을 직접 옮겨 적는 마찰을 줄인다. 사용자가 가진 **Google AI Studio Gemini API 키**로 기록증 이미지에서 정보를 추출해 폼을 미리 채운다.

## 역할 분담 (핵심 원칙)

- **사람이 정한다**: 대회(검색·선택·매칭 확정), 종목/코스(자전거/러닝 등 종목, 몇 km 코스).
- **AI가 채운다**: 대회 이름, 완주 시간. 트라이애슬론은 수영/바이크/런 시간이 기록증에 있을 때만, 없으면 빈칸.
- **AI는 채우기만, 확정은 사람.** 추출값은 전부 기존 편집 가능한 입력칸에 미리 채워지고, 사용자가 각 단계에서 보고 수정/확인 후 저장한다. 별도 확인 화면 없이 기존 입력칸이 곧 검증 UI다.

## 데이터 흐름

```
[0단계 업로드 화면]
  사용자: 기록증 사진 선택 (accept="image/*", 갤러리/카메라)
      │
      ▼
  extractRaceRecordFromImage(FormData)  ← 서버 액션
      │  Gemini 2.5 Flash 호출 (responseSchema로 JSON 강제, temperature 0)
      ▼
  { competitionName, raceDate, totalTime, swimTime, bikeTime, runTime }  (없는 값은 null)
      │
      ▼
  ┌─ raceDate        → ①단계 날짜 피커 prefill → 대회 자동 검색
  ├─ competitionName → ①단계 검색어 prefill (목록 좁히기)
  └─ totalTime, swim/bike/run → ocrTimes에 stash → ③단계 입력칸 prefill
```

대회명·날짜는 **검색을 돕는 prefill일 뿐**, 어느 대회인지는 사람이 ①단계에서 확정한다.

## 컴포넌트 / 책임

### 1. 서버 액션 — `app/actions/extract-race-record.ts`

```typescript
extractRaceRecordFromImage(formData: FormData):
  Promise<
    | { ok: true; data: ExtractedRecord }
    | { ok: false; message: string }
  >
```

- 입력: `FormData`의 `image` 파일 1개.
- 인증: `getCurrentMember()` + `verifyActive()` — 로그인·활성 멤버만 호출 가능 (우리 API 키 오남용 방지).
- 가드: MIME `image/*` 화이트리스트 + 용량 상한 10MB. 초과/비이미지면 `{ ok:false }`.
- 호출: `@google/genai` SDK, 모델 `gemini-2.5-flash`, `config.responseMimeType="application/json"` + `responseSchema`, `temperature: 0`.
- 응답을 Zod로 한 번 더 검증 → `ExtractedRecord`.
- 시간 정규화: Gemini가 `1:23:45` / `83분` 등으로 줄 수 있으므로 서버에서 `timeStringToSeconds`(`lib/dayjs`)로 파싱 가능한 `HH:MM:SS`로 정돈. 파싱 실패 항목은 `null`.

`ExtractedRecord`:

```typescript
{
  competitionName: string | null,   // 대회명
  raceDate: string | null,          // "YYYY-MM-DD" (없으면 null)
  totalTime: string | null,         // "HH:MM:SS" 완주 시간
  swimTime: string | null,          // 트라이애슬론 수영 (없으면 null)
  bikeTime: string | null,          // 트라이애슬론 자전거
  runTime: string | null,           // 트라이애슬론 러닝
  // 트랜지션은 폼이 total - swim - bike - run 으로 자동계산하므로 추출하지 않음
}
```

프롬프트 요지: "기록증 이미지에서 다음을 추출. 없으면 null. 시간은 HH:MM:SS 형식. 날짜는 YYYY-MM-DD. 추측 금지, 이미지에 명시된 값만."

### 2. 환경변수 — `lib/env.ts`

- server에 `GEMINI_API_KEY: z.string().min(1)` 추가 + `runtimeEnv` 매핑.
- `.env.example`에 `GEMINI_API_KEY=` (값 없이) 한 줄 추가.
- 키는 `.env.development.local`(gitignore됨)에 보관. 배포는 Vercel 환경변수에 별도 등록.

### 3. 클라이언트 — `components/profile/race-record-dialog.tsx`

- `step` 타입 `0 | 1 | 2 | 3`, 다이얼로그 열릴 때 초기 `step = 0`.
- **0단계 업로드 화면**: "기록증 사진 올리기"(파일 선택) + "사진 없이 직접 입력"(→ step 1).
- 업로드 후:
  - 썸네일 미리보기 + "기록 읽는 중..." 로딩.
  - 성공: `raceDate`→날짜 prefill, `competitionName`→검색어 prefill, 시간들→`ocrTimes` stash, `step=1`.
  - 실패/빈 결과: "사진에서 정보를 못 읽었어요. 직접 입력해 주세요." 후 `step=1`.
- **stash → step 3 prefill**: step 3 진입 시 시간 입력칸이 비어 있으면 `ocrTimes`를 `formatTimeInput` 거쳐 채움. 사용자가 이미 손댄 값은 덮어쓰지 않음.
- **프리필 투명성**: AI가 채운 칸 아래 `· 사진에서 읽음 — 확인해 주세요` 힌트. 수정하면 힌트 사라짐.
- 뒤로가기: step 1 → step 0 분기 추가.

추가 상태:

| 상태 | 용도 |
|------|------|
| `step: 0` | 업로드 화면 |
| `imagePreview` | 썸네일 URL (`URL.createObjectURL`) |
| `ocrLoading` | 추출 중 로딩 |
| `ocrTimes` | 추출 시간 stash (step 3에서 소비) |
| `ocrFilledFields` | AI 프리필 칸 추적 (힌트 표시) |

### 변경 없는 것

서버 저장(`saveRaceRecord`), 대회/코스 선택 로직, 트라이애슬론 트랜지션 자동계산은 그대로. OCR은 입력만 거들고 기존 검증·저장 경로를 100% 재사용한다.

## 에러 / 엣지 처리

- Gemini 호출 실패(네트워크/쿼터): `{ ok:false, message }` → 사용자에게 안내 후 수동 진행. 기능 차단 아님.
- 추출 0건: 모든 필드 null → step 1로 보내고 수동.
- 오인식: 사람이 각 단계에서 확인·수정. 프리필 힌트로 "AI가 채운 값"임을 표시.
- 비이미지/대용량 파일: 서버 가드에서 거절.
- 비로그인/비활성: 액션이 거절.

## 테스트

- 단위: 시간 정규화 함수(`"1:23:45"`→`"01:23:45"`, `"83분"`→`null` 또는 변환, 파싱 실패→null).
- 통합(수동): 실제 기록증(`SEOUL 2025 MARATHON`, 이현근, 03:25:29, FULL, 2025-03-16)으로 추출 → 기대값
  `{ competitionName:"SEOUL 2025 MARATHON"(유사), raceDate:"2025-03-16", totalTime:"03:25:29", swim/bike/run:null }`.
- E2E(수동): 다이얼로그 0단계 업로드 → step 1 검색 prefill 확인 → 대회/코스 선택 → step 3 시간 prefill 확인 → 저장.

## 범위 밖 (YAGNI)

- 트랜지션 직접 추출 (자동계산으로 충분).
- 대회 자동 생성/매칭 (사람이 확정).
- 진행률 스트리밍, 여러 장 일괄 처리.
- 추출 정확도 학습/피드백 루프.
