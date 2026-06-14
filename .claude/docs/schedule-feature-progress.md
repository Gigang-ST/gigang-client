# 일정(Schedule) 기능 개발 진행 상황

> 브랜치: `feature/home-calendar-schedule`
> 작성일: 2026-06-11
> 상태: **진행 중** — DB/서버액션/폼 구현 완료, UI 다듬기 중

---

## 완료된 작업

### 1. DB — `sch_post` 테이블

**마이그레이션 파일**: `supabase/migrations/20260611100000_sch_post.sql`
**개발 DB 적용 완료** (MCP로 직접 적용)

```sql
CREATE TABLE public.sch_post (
  sch_post_id  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id      uuid        NOT NULL REFERENCES public.team_mst(team_id),
  sch_nm       text        NOT NULL,          -- 일정명
  evt_stt_at   timestamptz NOT NULL,          -- 시작 일시
  evt_end_at   timestamptz,                   -- 종료 일시 (선택)
  url          text,                          -- 관련 링크 (선택)
  cont_txt     text,                          -- 본문 내용 (선택)
  crt_by       uuid        NOT NULL REFERENCES public.mem_mst(mem_id),
  crt_at       timestamptz NOT NULL DEFAULT now(),
  upd_at       timestamptz NOT NULL DEFAULT now(),
  del_yn       boolean     NOT NULL DEFAULT false,
  vers         integer     NOT NULL DEFAULT 0
);
```

- RLS: 팀 멤버 조회, 팀 멤버 등록, 작성자/관리자 수정(soft delete 포함)
- 인덱스: `ix_sch_post_team_evt_stt_at`, `ix_sch_post_crt_by`
- `database.types.ts` 재생성 완료

### 2. 약어 사전 업데이트

**파일**: `.claude/docs/database-abbreviation-dictionary.md`

- 도메인 약어에 `sch` (schedule) 추가
- 테이블 목록에 `sch_post` 추가
- `sch_post` 도메인 컬럼 약어 섹션 추가
- 네이밍 규칙에 `도메인_nm` 패턴, `*_at` vs `*_dt` 구분 규칙 추가

### 3. Zod 스키마

**파일**: `lib/validations/schedule.ts`

```typescript
export const createSchPostSchema  // team_id, sch_nm, evt_stt_at, evt_end_at?, url?, cont_txt?
export const updateSchPostSchema  // createSchPostSchema.partial() + sch_post_id
```

### 4. 서버 액션

**파일**: `app/actions/schedule/manage-sch-post.ts`

- `createSchPost` — 팀 멤버 누구나 등록
- `updateSchPost` — 작성자 본인만 수정
- `deleteSchPost` — soft delete (del_yn=true), 작성자/관리자
- 모두 `revalidatePath("/")` 포함

### 5. 일정 등록/수정 폼 다이얼로그

**파일**: `components/schedule/sch-post-form-dialog.tsx`

- Props: `open`, `onOpenChange`, `mode: "create" | "edit"`, `initialData?`, `onSuccess?`
- 필드: 일정명, 시작 일시(`datetime-local`), 종료 일시, URL, 내용
- 수정 모드: [삭제] [취소] [저장하기]
- 등록 모드: [취소] [등록하기]
- 삭제 시 `window.confirm` 확인

### 6. CalendarRace 타입 확장

**파일**: `components/home/mini-calendar.tsx`

```typescript
export type CalendarRace = {
  id: string;
  title: string;
  start_date: string;
  type: "gigang" | "mine" | "schedule";
  end_date?: string | null;
  location?: string | null;    // 대회 장소
  url?: string | null;         // sch_post 전용
  cont_txt?: string | null;    // sch_post 전용
  crt_by?: string;             // 수정 권한 확인용
  evt_stt_at?: string | null;  // 시간 표시용 원본 일시
  evt_end_at?: string | null;
};
```

### 7. MiniCalendar — 캘린더/리스트 뷰 전환

**파일**: `components/home/mini-calendar.tsx`

- 헤더 왼쪽: `[CalendarDays] [List]` 토글 아이콘 + `SCHEDULE` 라벨
- 헤더 오른쪽: 캘린더 뷰일 때만 월 이동 (`<` / `>`)
- 리스트 뷰일 때 헤더 오른쪽에 `+ 일정 추가` 버튼 (로그인 멤버만)
- 캘린더 셀: 날짜 패널 하단 `+` 버튼으로 해당 날짜 기본값 세팅해 일정 등록
- `schedule` 타입 도트: `bg-info/15 text-info`
- 대회 클릭 → `handleRaceClick` (참가 팝업), 일정 클릭 → `openEditForm` (수정 폼)
- 참가/수정/취소 성공 시 `handleSchPostSuccess()` 호출 → 캘린더 데이터 자동 리프레시

### 8. ScheduleListView — 무한 스크롤 리스트 뷰

**파일**: `components/home/schedule-list-view.tsx`

- 높이: `h-[320px]` 고정 (캘린더 뷰와 비슷한 높이)
- 기준 달로 초기화, 위로 스크롤 → 과거 달 자동 로드, 아래로 → 미래 달
- IntersectionObserver `root: containerRef.current` 설정 → 마운트 시 자동 발화 없음
- **sticky 월 헤더**: 스크롤 컨테이너 내에서 상단 고정 (일정 많아도 현재 달 표시 유지)
- 같은 id 중복 제거 (`seenIds`)
- 아이템 디자인:
  - `schedule` (공유 일정): 왼쪽 파란 세로선 + 제목 / 시간범위 / URL 또는 내용
  - `gigang`/`mine` (대회): 왼쪽 컬러 세로선 + 제목 / 날짜 / 장소 + 우측 **참가** 버튼
    - 내 대회(`mine`): 참가 버튼 초록색
    - 기강 대회(`gigang`): 참가 버튼 기본 스타일
- Props 명시적 분리: `onClickSchedule` / `onClickCompetition` → 타입 혼선 완전 차단

### 9. CompetitionDetailDialog 개선

**파일**: `components/races/competition-detail-dialog.tsx`

- 팝업 닫을 때 `editing` 상태 리셋 → 다음 대회 클릭 시 수정 모드로 열리던 버그 수정
- 참가/신청 폼 맨 아래 **닫기** 버튼 추가 (스크롤 내려도 닫기 접근 가능)

### 10. page.tsx — 데이터 패칭 추가

**파일**: `app/(main)/page.tsx`

- `sch_post` 이번 달 조회 추가 → `calendarSchPosts` → `MiniCalendar`에 `schPosts` prop으로 전달
- `calendarSchPosts` 매핑에 `evt_stt_at`, `evt_end_at` 포함
- `calendarMyRaces` 매핑에 `location: comp.loc_nm` 포함
- `calendarGigangRaces` 매핑에 `location: row.loc_nm` 포함

---

## 남은 작업 (다음 세션)

### 우선순위 높음

- [ ] **리스트뷰 새로 로드된 달** (`fetchMonth` 결과)에서도 `location` / `evt_stt_at` / `evt_end_at` 정상 전달 확인
  - `ScheduleListView` 내부 `fetchMonth`의 `calendarMyRaces` 부분: `loc_nm` SELECT에 포함 완료 (`comp_mst!inner(comp_id, comp_nm, stt_dt, loc_nm)`)
  - `gigangRows`의 `loc_nm` 포함 완료 (RPC 자체가 `loc_nm` 반환)
- [ ] **리스트뷰 UI 최종 확인** — 개발 서버 띄워서 실제 동작 점검
  - 공유 일정 클릭 → 수정 폼 팝업 확인
  - 대회 클릭 → 참가 팝업 확인
  - 위/아래 스크롤 → 과거/미래 달 로드 확인
  - sticky 월 헤더 동작 확인

### 우선순위 중간

- [ ] **공유 일정 상세 팝업** — 현재 편집 폼만 있음. 비작성자가 클릭했을 때 상세 뷰가 없음
  - 작성자/관리자: 수정 폼 팝업
  - 일반 멤버: 일정 상세 보기 팝업 (제목/시간/URL/내용 표시, 닫기만)
- [ ] **리스트뷰 `+ 일정 추가` 버튼** — 현재 prop으로는 전달되지만 `ScheduleListView` 내부에서 실제로 렌더링 안 됨 (기능 확인 필요)

### 우선순위 낮음 (모임 기능 구현 후)

- [ ] 리스트뷰에 `gthr_mst` (모임) 타입 추가 — `gathering-design.md` 참고
- [ ] 알림 설정에 `신규 일정` 카테고리 추가

---

## 관련 파일 목록

| 파일 | 역할 | 상태 |
|------|------|------|
| `supabase/migrations/20260611100000_sch_post.sql` | DB 마이그레이션 | ✅ 완료 |
| `lib/validations/schedule.ts` | Zod 스키마 | ✅ 완료 |
| `app/actions/schedule/manage-sch-post.ts` | 서버 액션 | ✅ 완료 |
| `components/schedule/sch-post-form-dialog.tsx` | 등록/수정 폼 다이얼로그 | ✅ 완료 |
| `components/home/mini-calendar.tsx` | 캘린더/리스트 뷰 전환, 일정 상태 관리 | ✅ 완료 |
| `components/home/schedule-list-view.tsx` | 무한 스크롤 리스트 뷰 | ✅ 완료 |
| `components/races/competition-detail-dialog.tsx` | 대회 참가 팝업 (editing 리셋, 닫기 버튼) | ✅ 완료 |
| `app/(main)/page.tsx` | 서버 데이터 패칭 + props 전달 | ✅ 완료 |
| `lib/supabase/database.types.ts` | Supabase 타입 (sch_post 포함) | ✅ 완료 |
| `.claude/docs/database-abbreviation-dictionary.md` | 약어 사전 | ✅ 완료 |
