# 프로필 대회기록 입력 및 퍼스널 베스트 리디자인

## 1. 퍼스널 베스트 그리드 변경

### 현재
- 4칸: FULL / HALF / 10K / 5K
- 각 칸 탭하면 기록 편집 다이얼로그
- 별도 UTMB 인덱스 섹션

### 변경
- 4칸: **FULL / HALF / 10K / UTMB Index**
- FULL, HALF, 10K는 **읽기 전용** (탭 불가)
- 기록값은 `race_result` 테이블에서 해당 멤버의 종목별 최고기록(MIN record_time_sec) 자동 표시
- UTMB Index 칸만 탭 가능 → 기존 UTMB 프로필 URL 입력 다이얼로그
- 기존 `personal_best` 테이블 의존 제거 → `race_result` 기반으로 전환

## 2. 기록입력 버튼

- 기존 UTMB 인덱스 섹션 자리에 **"기록입력"** 버튼 배치
- 탭하면 대회기록 입력 다이얼로그(시트) 오픈

## 3. 대회기록 입력 폼

### Step 1: 대회 선택
- 최근 1개월 내 대회 목록 표시 (competition 테이블, start_date 기준)
- 대회 선택 시 → 대회명, 날짜 자동 채움
- "직접 입력" 옵션: 대회명, 날짜 수동 입력

### Step 2: 종목/코스 선택
- 선택한 대회의 `event_types` 배열에서 코스 목록 표시
- 직접 입력 시: 텍스트 입력 (예: FULL, HALF, 10K, OLYMPIC 등)
- 철인3종 대회인 경우 (sport === 'triathlon') → 철인3종 입력 모드 활성화

### Step 3: 기록 입력
**일반 (마라톤/러닝):**
- 총 기록: HH:MM:SS 입력

**철인3종:**
- 대회 총 시간: HH:MM:SS
- 수영: HH:MM:SS
- 자전거: HH:MM:SS
- 러닝: HH:MM:SS
- 트랜지션: 자동 계산 (총 시간 - 수영 - 자전거 - 러닝), 읽기 전용 표시

### 저장
- `race_result` 테이블에 INSERT
- 프로필 퍼스널 베스트 자동 갱신 (최고기록이면 표시 변경)

## 4. DB 변경

### race_result 테이블 컬럼 추가
```sql
ALTER TABLE race_result ADD COLUMN swim_time_sec integer;
ALTER TABLE race_result ADD COLUMN bike_time_sec integer;
ALTER TABLE race_result ADD COLUMN run_time_sec integer;
```
- nullable: 마라톤은 null, 철인3종만 사용
- transition = record_time_sec - swim - bike - run (앱에서 계산)

### event_type 값 매핑
- 마라톤: FULL, HALF, 10K
- 철인3종: TRIATHLON_FULL, TRIATHLON_HALF, TRIATHLON_OLYMPIC

## 5. 컴포넌트 구조

```
components/profile/
  personal-best-grid.tsx  → 리팩토링 (읽기 전용 + UTMB 칸)
  utmb-index-section.tsx  → 제거 (UTMB는 그리드 안으로 이동)
  race-record-dialog.tsx  → 새로 생성 (대회기록 입력 폼)
```

## 6. 데이터 흐름

```
profile/page.tsx (서버)
  → race_result에서 멤버별 종목 최고기록 조회
  → utmb_profile에서 UTMB 인덱스 조회
  → PersonalBestGrid에 전달 (읽기 전용 데이터)
  → RaceRecordDialog (클라이언트, 입력/저장)
```
