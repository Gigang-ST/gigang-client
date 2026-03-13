# 프로필 대회기록 입력 및 퍼스널 베스트 리디자인 구현 계획

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development to implement this plan.

**Goal:** 프로필 퍼스널 베스트를 race_result 기반 읽기 전용으로 변경하고, 대회기록 입력 다이얼로그 추가

**Architecture:** race_result 테이블에 철인3종 분할 기록 컬럼 추가. 프로필 그리드는 race_result MIN 쿼리로 읽기 전용 표시. UTMB는 그리드 4번째 칸으로 이동. 새 다이얼로그로 대회기록 입력.

**Tech Stack:** Next.js App Router, Supabase, React, Tailwind CSS, shadcn/ui Dialog

---

### Task 1: DB 마이그레이션 - race_result 철인3종 컬럼 추가

**Files:**
- Create: `supabase/migrations/20260313_add_triathlon_splits.sql`

- [ ] **Step 1:** Supabase MCP로 마이그레이션 적용
```sql
ALTER TABLE race_result ADD COLUMN swim_time_sec integer;
ALTER TABLE race_result ADD COLUMN bike_time_sec integer;
ALTER TABLE race_result ADD COLUMN run_time_sec integer;
```

---

### Task 2: 프로필 서버 컴포넌트 수정

**Files:**
- Modify: `app/(main)/profile/page.tsx`

- [ ] **Step 1:** personal_best 쿼리를 race_result MIN 쿼리로 변경
  - race_result에서 member_id별 event_type별 MIN(record_time_sec) 조회
  - utmb_profile 조회는 유지
- [ ] **Step 2:** UtmbIndexSection import 제거
- [ ] **Step 3:** PersonalBestGrid에 utmbData, memberId 전달
- [ ] **Step 4:** 기록입력 버튼 영역 추가 (RaceRecordDialog 호출)

---

### Task 3: PersonalBestGrid 리팩토링 (읽기 전용 + UTMB)

**Files:**
- Modify: `components/profile/personal-best-grid.tsx`

- [ ] **Step 1:** 그리드를 FULL/HALF/10K/UTMB 4칸으로 변경
- [ ] **Step 2:** FULL/HALF/10K는 읽기 전용 (탭 불가, race_result 최고기록 표시)
- [ ] **Step 3:** UTMB 칸은 탭 시 기존 UTMB 다이얼로그 오픈
- [ ] **Step 4:** 기존 편집 다이얼로그/CompetitionSearchDialog 코드 제거

---

### Task 4: RaceRecordDialog 생성

**Files:**
- Create: `components/profile/race-record-dialog.tsx`

- [ ] **Step 1:** 다이얼로그 기본 구조 (open/onOpenChange props)
- [ ] **Step 2:** Step 1 - 대회 선택
  - 최근 1개월 대회 목록 자동 표시
  - 대회 선택 시 대회명/날짜/sport 자동 채움
  - "직접 입력" 옵션
- [ ] **Step 3:** Step 2 - 종목/코스 선택
  - 선택한 대회의 event_types에서 코스 표시
  - 철인3종 감지 (sport === 'triathlon')
- [ ] **Step 4:** Step 3 - 기록 입력 (일반)
  - HH:MM:SS 시간 입력
- [ ] **Step 5:** Step 3 - 기록 입력 (철인3종)
  - 총 시간 + 수영/자전거/러닝 개별 입력
  - 트랜지션 자동 계산
- [ ] **Step 6:** 저장 로직
  - race_result INSERT
  - 성공 후 콜백으로 부모 리프레시

---

### Task 5: 통합 및 정리

- [ ] **Step 1:** utmb-index-section.tsx에서 UTMB 다이얼로그 로직을 personal-best-grid.tsx로 이동
- [ ] **Step 2:** profile/page.tsx에서 모든 컴포넌트 연결
- [ ] **Step 3:** 빌드 확인
- [ ] **Step 4:** 커밋
