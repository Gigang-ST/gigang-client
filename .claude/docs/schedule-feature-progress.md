# 일정(Schedule) 기능 개발 진행 상황

> 브랜치: `feature/home-calendar-schedule` → **dev 머지 완료**
> 작성일: 2026-06-11
> 최종 수정: 2026-06-15
> 상태: **대부분 완료** — 소소한 미완성 항목만 남음

---

## 완료된 작업

### 1. DB — `sch_post` 테이블

**마이그레이션 파일**:
- `supabase/migrations/20260611100000_sch_post.sql` — 테이블 생성
- `supabase/migrations/20260614100000_sch_post_add_post_type.sql` — `post_type` 컬럼 추가

```sql
CREATE TABLE public.sch_post (
  sch_post_id  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id      uuid        NOT NULL REFERENCES public.team_mst(team_id),
  sch_nm       text        NOT NULL,
  evt_stt_at   timestamptz NOT NULL,
  evt_end_at   timestamptz,
  url          text,
  cont_txt     text,
  post_type    text        NOT NULL DEFAULT 'general'
                           CHECK (post_type IN ('general', 'race_entry', 'event')),
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

### 6. CalendarRace 타입

**파일**: `components/home/mini-calendar.tsx`

```typescript
export type CalendarRace = {
  id: string;
  title: string;
  start_date: string;
  type: "gigang" | "mine" | "schedule";
  post_type?: string | null;
  end_date?: string | null;
  location?: string | null;
  url?: string | null;
  cont_txt?: string | null;
  crt_by?: string;
  evt_stt_at?: string | null;
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

### 8. ScheduleListView — 무한 스크롤 리스트 뷰

**파일**: `components/home/schedule-list-view.tsx`

- 높이: `h-[320px]` 고정
- 기준 달로 초기화, 위로 스크롤 → 과거 달 자동 로드, 아래로 → 미래 달
- sticky 월 헤더
- 아이템 디자인:
  - `schedule`: 왼쪽 파란 세로선 + 제목 / 시간범위 / URL 또는 내용
  - `gigang`/`mine`: 왼쪽 컬러 세로선 + 제목 / 날짜 / 장소 + 우측 참가 버튼

### 9. page.tsx — 데이터 패칭

**파일**: `app/(main)/page.tsx`

- `sch_post` 이번 달 조회 → `calendarSchPosts` → `MiniCalendar`에 `schPosts` prop 전달
- `post_type` 포함 SELECT

---

## 남은 작업

### 우선순위 높음

- [ ] **`sch_post` → `sch_post_mst` 테이블 리네임** — 약어 사전 `_mst` 규칙과 불일치. 댓글 기능 구현 전에 마이그레이션 올릴 것 (`ALTER TABLE sch_post RENAME TO sch_post_mst`)

### 우선순위 중간

- [ ] **공유 일정 상세 팝업** — 비작성자가 클릭했을 때 상세 뷰 없음
  - 작성자/관리자: 수정 폼 팝업
  - 일반 멤버: 읽기 전용 상세 팝업 (제목/시간/URL/내용, 닫기만)

### 우선순위 낮음 (모임 기능 구현 후)

- [ ] 리스트뷰 / 캘린더에 `gthr_mst` (모임) 타입 추가 — `gathering-design.md` 참고
- [ ] 알림 설정에 `신규 일정` 카테고리 추가

---

## 관련 파일 목록

| 파일 | 역할 | 상태 |
|------|------|------|
| `supabase/migrations/20260611100000_sch_post.sql` | DB 마이그레이션 | ✅ |
| `supabase/migrations/20260614100000_sch_post_add_post_type.sql` | post_type 추가 | ✅ |
| `lib/validations/schedule.ts` | Zod 스키마 | ✅ |
| `app/actions/schedule/manage-sch-post.ts` | 서버 액션 | ✅ |
| `components/schedule/sch-post-form-dialog.tsx` | 등록/수정 폼 다이얼로그 | ✅ |
| `components/home/mini-calendar.tsx` | 캘린더/리스트 뷰 전환 | ✅ |
| `components/home/schedule-list-view.tsx` | 무한 스크롤 리스트 뷰 | ✅ |
| `app/(main)/page.tsx` | 서버 데이터 패칭 | ✅ |
| `lib/supabase/database.types.ts` | Supabase 타입 | ✅ |
