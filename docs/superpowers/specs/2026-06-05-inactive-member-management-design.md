# 비활성 회원 관리 시스템 설계

**날짜:** 2026-06-05  
**브랜치:** feat/dues-management  
**상태:** 승인됨

---

## 1. 목적 및 범위

러닝크루 기강 웹앱에 비활성 회원 관리 기능을 추가한다.

### 포함 범위
1. DB 마이그레이션 — `inact_rsn_txt` 컬럼 추가
2. 서버 액션 — 비활성화/활성화 (단건·배치)
3. 비활성 회원 제한 — 서버 액션 레벨에서 액션 거부
4. 조회 화면 필터 — 랭킹, 대회 참가 등에서 비활성 회원 제외
5. 회비관리 UI — 비활성 구분 표시 + 비활성 설정 버튼
6. 회원관리 UI — 테이블 형태 + 다중선택 + 상태 필터

### 제외 범위
- 비활성 회원 전용 페이지 차단(redirect) — 액션 레벨 거부로 충분
- 회비 로직 변경 — 비활성 회원도 회비 계산·표시 대상 유지

---

## 2. DB 변경

### 마이그레이션 파일
`supabase/migrations/20260605100000_add_inact_rsn_txt.sql`

```sql
ALTER TABLE public.team_mem_rel
  ADD COLUMN inact_rsn_txt text;

COMMENT ON COLUMN public.team_mem_rel.inact_rsn_txt
  IS '비활성화 사유 (inactive 상태일 때만 의미 있음)';
```

- dev / prd 양쪽에 동시 적용
- nullable — 사유 없이 비활성화도 허용 (기존 rejectMember 등)
- 활성화(`reactivateMember`) 시 `NULL`로 초기화

---

## 3. 서버 액션

### `lib/queries/member.ts` — 헬퍼 추가

```typescript
// 현재 로그인 회원이 active 상태인지 확인
// inactive면 { ok: false, message: "비활성화된 회원입니다. 관리자에게 문의하세요." }
export async function verifyActive(): Promise<{ ok: true } | { ok: false; message: string }>
```

### `app/actions/admin/manage-member.ts` — 함수 추가

| 함수 | 설명 |
|------|------|
| `deactivateMember(memberId, reason?)` | active → inactive, `inact_rsn_txt` 저장. 관리자만 호출 가능 |
| `reactivateMember(memberId)` | inactive → active, `inact_rsn_txt` = NULL. 관리자만 호출 가능 |
| `batchDeactivateMembers(memberIds, reason?)` | 여러 회원 일괄 비활성화 |
| `batchReactivateMembers(memberIds)` | 여러 회원 일괄 활성화 |

모든 함수는 내부에서 `verifyAdmin()` 확인.

---

## 4. 비활성 회원 제한

### 원칙
- **비활성 회원은 액션을 수행할 수 없다.** 에러 메시지: "비활성화된 회원입니다. 관리자에게 문의하세요."
- **관리자 메뉴는 제외** — 관리자 액션은 `verifyAdmin()`이 통과하면 허용
- 페이지 자체는 차단하지 않음 — 읽기 전용으로 접근 가능

### 적용 대상 서버 액션
비관리자가 호출하는 액션 상단에 `verifyActive()` 추가:
- 대회 참가 신청 / 취소
- 기록 등록 / 수정
- 프로필 수정
- 기타 회원 발의 액션

### 조회 화면 필터 (`mem_st_cd = 'active'` 조건 추가)
- 랭킹 페이지 — 비활성 회원 제외
- 대회 참가자 목록 — 비활성 회원 제외
- 홈 팀 멤버 목록 — 비활성 회원 제외
- 회원 검색 (일반 유저용) — 비활성 회원 제외

**회비관리 / 회원관리(관리자)는 제외** — 전체 회원 표시, 상태만 구분

---

## 5. 회비관리 UI

파일: `app/(info)/admin/dues/members/`

### 데이터 변경
- `dues/members/page.tsx` — `team_mem_rel` join 추가하여 `mem_st_cd`, `inact_rsn_txt` 포함
- `MemberRow` 타입에 `mem_st_cd: string`, `inact_rsn_txt: string | null` 추가

### UI 변경 (`dues-members-client.tsx`)

**회원별 잔액 테이블:**
- 비활성 회원 행: 이름 옆 `[비활성]` 배지 + 행 전체 `opacity-60`
- 비활성 회원도 목록에서 제거하지 않음 (회비 잔액 추적 유지)

**상단 액션 버튼 (선택된 회원 있을 때):**
```
[ 미납 N명 ] [ 미납자 복사 ] | [ 알림 전송 (N명) ] [ 비활성 설정 (N명) ]
```
- 선택된 회원 중 active가 있으면 "비활성 설정" 버튼 표시
- 클릭 시 사유 입력 다이얼로그 → `batchDeactivateMembers()` 호출

---

## 6. 회원관리 UI

파일: `app/(info)/admin/members/`

### 테이블 컬럼

| ☑ | 이름 | 성별 | 생년월일 | 가입일자 | 연락처 | 회원상태 | 회비잔액 |
|---|------|------|----------|----------|--------|----------|----------|

- 회비잔액: `fee_mem_bal_snap`에서 서버 조인
- 회원상태: 배지 (`활성` / `비활성` / `대기` 등)

### 상단 필터
`SegmentControl` — 전체 | 활성 | 비활성

### 다중선택 액션 (상단 플로팅 or 버튼 영역)
- 선택된 회원 중 active 있음 → "비활성 설정 (N명)" 버튼 표시
- 선택된 회원 중 inactive 있음 → "활성화 (N명)" 버튼 표시
- 두 상태 섞여 있으면 두 버튼 모두 표시 (각자 해당하는 회원에게만 작용)

### 행 클릭 → 하단 시트
기존 구조 유지 + 아래 추가:
- **회비잔액** InfoRow 추가
- inactive일 때 **비활성 사유** InfoRow 추가 (없으면 "-")
- 액션 버튼: 기존(관리자 지정/해제, 삭제) + **"비활성 설정" / "활성화"** 개별 버튼
  - active → "비활성 설정" (클릭 시 사유 입력 다이얼로그)
  - inactive → "활성화" (확인 후 즉시 처리)

---

## 7. 데이터 흐름 요약

```
관리자 → 비활성 설정 버튼
  → deactivateMember(memberId, reason)
    → verifyAdmin() 확인
    → team_mem_rel UPDATE SET mem_st_cd='inactive', inact_rsn_txt=reason

비활성 회원 → 대회 참가 시도
  → createCompEntry() 서버 액션
    → verifyActive() 확인
    → return { ok: false, message: "비활성화된 회원입니다. 관리자에게 문의하세요." }
```

---

## 8. 영향받는 파일 목록 (예상)

| 파일 | 변경 유형 |
|------|-----------|
| `supabase/migrations/20260605100000_add_inact_rsn_txt.sql` | 신규 |
| `lib/supabase/database.types.ts` | 타입 재생성 |
| `lib/queries/member.ts` | `verifyActive()` 추가 |
| `app/actions/admin/manage-member.ts` | 4개 함수 추가 |
| `app/actions/dues/recalculate-balance.ts` | `verifyActive()` 적용 여부 검토 |
| `app/(info)/admin/dues/members/page.tsx` | `mem_st_cd`, `inact_rsn_txt` 조인 추가 |
| `app/(info)/admin/dues/members/dues-members-client.tsx` | 비활성 배지 + 버튼 추가 |
| `app/(info)/admin/members/page.tsx` | 회비잔액 조인 추가 |
| `app/(info)/admin/members/admin-members-client.tsx` | 테이블 전환 + 필터 + 다중선택 |
| `app/(main)/records/page.tsx` 등 조회 페이지들 | `mem_st_cd='active'` 필터 추가 |
| 비관리자 서버 액션들 | `verifyActive()` 추가 |
