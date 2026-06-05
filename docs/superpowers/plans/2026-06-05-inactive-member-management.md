# 비활성 회원 관리 시스템 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 비활성 회원 상태 관리(설정/해제), 회비관리 UI 연동, 회원관리 테이블 UI, 비활성 회원 액션 차단을 구현한다.

**Architecture:** `team_mem_rel.inact_rsn_txt` 컬럼 추가로 사유를 저장하고, `verifyActive()` 헬퍼로 서버 액션 레벨에서 비활성 회원 차단. 관리자 전용 `deactivateMember/reactivateMember/batch*` 액션으로 상태 전환. 조회 페이지에서는 `.eq("mem_st_cd", "active")` 필터로 비활성 회원 제외.

**Tech Stack:** Next.js App Router, Supabase (PostgreSQL + MCP), TypeScript, shadcn/ui (Table, Dialog, Badge), React Hook Form 없음(간단한 controlled input)

**Spec:** `docs/superpowers/specs/2026-06-05-inactive-member-management-design.md`

---

## 파일 맵

| 파일 | 역할 |
|------|------|
| `supabase/migrations/20260605100000_add_inact_rsn_txt.sql` | 신규: inact_rsn_txt 컬럼 추가 |
| `lib/supabase/database.types.ts` | 수정: MCP로 타입 재생성 |
| `lib/queries/member.ts` | 수정: `verifyActive()` 추가 |
| `app/actions/admin/manage-member.ts` | 수정: `deactivateMember`, `reactivateMember`, `batchDeactivateMembers`, `batchReactivateMembers` 추가 |
| `app/actions/save-race-record.ts` | 수정: `verifyActive()` 적용 |
| `app/actions/upload-avatar.ts` | 수정: `verifyActive()` 적용 |
| `app/actions/save-utmb-profile.ts` | 수정: `verifyActive()` 적용 |
| `app/actions/mileage-run.ts` | 수정: 사용자 호출 함수에 `verifyActive()` 적용 |
| `app/actions/profile/update-collection.ts` | 수정: `verifyActive()` 적용 |
| `app/(main)/page.tsx` | 수정: recent joiners 쿼리에 `mem_st_cd='active'` 필터 |
| `app/(info)/admin/dues/members/page.tsx` | 수정: `mem_st_cd`, `inact_rsn_txt` 조인 추가 |
| `app/(info)/admin/dues/members/dues-members-client.tsx` | 수정: 비활성 배지 + 비활성 설정 버튼 |
| `app/(info)/admin/members/admin-members-client.tsx` | 수정: 테이블 전환 + 다중선택 + 필터 + 시트 확장 |

---

## Task 1: DB 마이그레이션 파일 작성 + dev/prd 적용 + 타입 재생성

**Files:**
- Create: `supabase/migrations/20260605100000_add_inact_rsn_txt.sql`
- Modify: `lib/supabase/database.types.ts`

- [ ] **Step 1: 마이그레이션 파일 작성**

`supabase/migrations/20260605100000_add_inact_rsn_txt.sql` 파일을 생성한다:

```sql
ALTER TABLE public.team_mem_rel
  ADD COLUMN inact_rsn_txt text;

COMMENT ON COLUMN public.team_mem_rel.inact_rsn_txt
  IS '비활성화 사유 (inactive 상태일 때만 의미 있음)';
```

- [ ] **Step 2: dev 환경에 마이그레이션 적용**

MCP `mcp__supabase-gigang-dev__apply_migration` 도구를 사용한다:
- name: `add_inact_rsn_txt`
- query: 위의 SQL 전체

성공 응답 확인.

- [ ] **Step 3: prd 환경에 마이그레이션 적용**

MCP `mcp__supabase-gigang-prd__apply_migration` 도구를 사용한다:
- name: `add_inact_rsn_txt`
- query: 위의 SQL 전체

성공 응답 확인.

- [ ] **Step 4: TypeScript 타입 재생성**

MCP `mcp__supabase-gigang-dev__generate_typescript_types` 도구를 실행하여 반환된 타입 코드를 `lib/supabase/database.types.ts`에 전체 교체한다.

`team_mem_rel` 테이블의 Row 타입에 `inact_rsn_txt: string | null` 이 포함되어 있는지 확인한다.

- [ ] **Step 5: 타입 체크**

```bash
pnpm tsc --noEmit
```

에러 없음 확인.

- [ ] **Step 6: 커밋**

```bash
git add supabase/migrations/20260605100000_add_inact_rsn_txt.sql lib/supabase/database.types.ts
git commit -m "feat(db): team_mem_rel에 inact_rsn_txt 컬럼 추가"
```

---

## Task 2: verifyActive() 헬퍼 + 비활성화/활성화 서버 액션

**Files:**
- Modify: `lib/queries/member.ts`
- Modify: `app/actions/admin/manage-member.ts`

- [ ] **Step 1: `verifyActive()` 헬퍼 추가**

`lib/queries/member.ts` 파일의 `verifyAdmin()` 함수 바로 아래에 추가한다:

```typescript
/**
 * 현재 로그인한 유저가 active 상태인지 확인한다.
 * inactive면 { ok: false } 반환.
 */
export async function verifyActive(): Promise<{ ok: true } | { ok: false; message: string }> {
  const { member } = await getCurrentMember();
  if (!member) return { ok: false, message: "로그인이 필요합니다." };
  if (member.status === "inactive") {
    return { ok: false, message: "비활성화된 회원입니다. 관리자에게 문의하세요." };
  }
  return { ok: true };
}
```

- [ ] **Step 2: `manage-member.ts`에 4개 함수 추가**

`app/actions/admin/manage-member.ts` 파일의 `deleteMember` 함수 아래에 추가한다:

```typescript
export async function deactivateMember(memberId: string, reason?: string) {
  const adminUser = await verifyAdmin();
  if (!adminUser) return { ok: false, message: "권한이 없습니다" };

  if (adminUser.id === memberId) {
    return { ok: false, message: "본인을 비활성화할 수 없습니다" };
  }

  const { teamId } = await getRequestTeamContext();
  const db = createAdminClient();

  const { data: rel } = await db
    .from("team_mem_rel")
    .select("team_role_cd")
    .eq("mem_id", memberId)
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false)
    .maybeSingle();

  if (rel?.team_role_cd === "owner") {
    return { ok: false, message: "크루장은 비활성화할 수 없습니다" };
  }

  const { error } = await db
    .from("team_mem_rel")
    .update({ mem_st_cd: "inactive", inact_rsn_txt: reason ?? null })
    .eq("mem_id", memberId)
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false)
    .eq("mem_st_cd", "active");

  if (error) return { ok: false, message: "비활성화에 실패했습니다" };
  return { ok: true, message: null };
}

export async function reactivateMember(memberId: string) {
  const adminUser = await verifyAdmin();
  if (!adminUser) return { ok: false, message: "권한이 없습니다" };

  const { teamId } = await getRequestTeamContext();
  const db = createAdminClient();

  const { error } = await db
    .from("team_mem_rel")
    .update({ mem_st_cd: "active", inact_rsn_txt: null })
    .eq("mem_id", memberId)
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false)
    .eq("mem_st_cd", "inactive");

  if (error) return { ok: false, message: "활성화에 실패했습니다" };
  return { ok: true, message: null };
}

export async function batchDeactivateMembers(memberIds: string[], reason?: string) {
  if (!memberIds.length) return { ok: false, message: "대상이 없습니다" };

  const adminUser = await verifyAdmin();
  if (!adminUser) return { ok: false, message: "권한이 없습니다" };

  const { teamId } = await getRequestTeamContext();
  const db = createAdminClient();

  // 본인 및 크루장 제외
  const { data: rels } = await db
    .from("team_mem_rel")
    .select("mem_id, team_role_cd")
    .in("mem_id", memberIds)
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false);

  const safeIds = (rels ?? [])
    .filter((r) => r.mem_id !== adminUser.id && r.team_role_cd !== "owner")
    .map((r) => r.mem_id);

  if (!safeIds.length) return { ok: false, message: "처리 가능한 대상이 없습니다" };

  const { error } = await db
    .from("team_mem_rel")
    .update({ mem_st_cd: "inactive", inact_rsn_txt: reason ?? null })
    .in("mem_id", safeIds)
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false)
    .eq("mem_st_cd", "active");

  if (error) return { ok: false, message: "일괄 비활성화에 실패했습니다" };
  return { ok: true, message: null };
}

export async function batchReactivateMembers(memberIds: string[]) {
  if (!memberIds.length) return { ok: false, message: "대상이 없습니다" };

  const adminUser = await verifyAdmin();
  if (!adminUser) return { ok: false, message: "권한이 없습니다" };

  const { teamId } = await getRequestTeamContext();
  const db = createAdminClient();

  const { error } = await db
    .from("team_mem_rel")
    .update({ mem_st_cd: "active", inact_rsn_txt: null })
    .in("mem_id", memberIds)
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false)
    .eq("mem_st_cd", "inactive");

  if (error) return { ok: false, message: "일괄 활성화에 실패했습니다" };
  return { ok: true, message: null };
}
```

- [ ] **Step 3: 타입 체크**

```bash
pnpm tsc --noEmit
```

에러 없음 확인.

- [ ] **Step 4: 커밋**

```bash
git add lib/queries/member.ts app/actions/admin/manage-member.ts
git commit -m "feat(admin): 비활성화/활성화 서버 액션 추가 및 verifyActive() 헬퍼"
```

---

## Task 3: 비관리자 서버 액션에 verifyActive() 적용

**Files:**
- Modify: `app/actions/save-race-record.ts`
- Modify: `app/actions/upload-avatar.ts`
- Modify: `app/actions/save-utmb-profile.ts`
- Modify: `app/actions/mileage-run.ts`
- Modify: `app/actions/profile/update-collection.ts`

각 파일에서 `getCurrentMember`를 import하는 라인 옆에 `verifyActive`를 추가하고, member null 체크 바로 뒤에 verifyActive 호출을 삽입한다.

- [ ] **Step 1: `save-race-record.ts` 수정**

파일 상단 import 수정:
```typescript
import { getCurrentMember, verifyActive } from "@/lib/queries/member";
```

`saveRaceRecord` 함수(또는 파일 내 유일한 export 함수) 내부에서 `getCurrentMember()` 호출 바로 아래에 삽입:
```typescript
const { member } = await getCurrentMember();
if (!member) return { ok: false as const, message: "로그인이 필요합니다." };

const activeCheck = await verifyActive();
if (!activeCheck.ok) return { ok: false as const, message: activeCheck.message };
```

- [ ] **Step 2: `upload-avatar.ts` 수정**

파일 상단 import 수정:
```typescript
import { getCurrentMember, verifyActive } from "@/lib/queries/member";
```

`uploadAvatar` 함수 내 `getCurrentMember()` 호출 바로 아래:
```typescript
const { member } = await getCurrentMember();
if (!member) return { ok: false as const, message: "로그인이 필요합니다." };

const activeCheck = await verifyActive();
if (!activeCheck.ok) return { ok: false as const, message: activeCheck.message };
```

- [ ] **Step 3: `save-utmb-profile.ts` 수정**

파일 상단 import 수정:
```typescript
import { getCurrentMember, verifyActive } from "@/lib/queries/member";
```

`saveUtmbProfile` 함수 내 member null 체크 바로 아래:
```typescript
const { member, supabase } = await getCurrentMember();
if (!member) return { ok: false as const, message: "로그인이 필요합니다." };

const activeCheck = await verifyActive();
if (!activeCheck.ok) return { ok: false as const, message: activeCheck.message };
```

- [ ] **Step 4: `mileage-run.ts` 수정**

파일 내 `verifyAdmin()`을 사용하지 않는 user-callable export 함수들을 찾는다 (grep으로 확인). `getCurrentMember()`만 쓰는 함수마다 동일 패턴 적용:

```typescript
import { getCurrentMember, verifyActive, verifyAdmin } from "@/lib/queries/member";
```

각 해당 함수에서 getCurrentMember 반환 직후:
```typescript
const activeCheck = await verifyActive();
if (!activeCheck.ok) return { ok: false as const, message: activeCheck.message };
```

- [ ] **Step 5: `profile/update-collection.ts` 수정**

파일 상단 import 수정:
```typescript
import { getCurrentMember, verifyActive } from "@/lib/queries/member";
```

파일 내 `setPrimaryTitle`, `setPrimaryFrame`, `setPrimaryBadgeEffect` 등 각 함수의 member null 체크 바로 아래에 동일 패턴 적용:
```typescript
const activeCheck = await verifyActive();
if (!activeCheck.ok) return { ok: false, message: activeCheck.message };
```

- [ ] **Step 6: 타입 체크 + 린트**

```bash
pnpm tsc --noEmit && pnpm run lint
```

에러 없음 확인.

- [ ] **Step 7: 커밋**

```bash
git add app/actions/save-race-record.ts app/actions/upload-avatar.ts app/actions/save-utmb-profile.ts app/actions/mileage-run.ts app/actions/profile/update-collection.ts
git commit -m "feat(auth): 비활성 회원 서버 액션 차단 적용"
```

---

## Task 4: 공개 조회 화면 비활성 회원 필터

**Files:**
- Modify: `app/(main)/page.tsx`

(랭킹 페이지는 `get_public_team_race_rankings` RPC를 사용하므로 RPC 레벨에서 이미 처리되거나 나중에 별도 마이그레이션으로 처리. 이번 태스크는 직접 쿼리하는 홈 페이지만 수정.)

- [ ] **Step 1: 홈 페이지 recent joiners 쿼리에 active 필터 추가**

`app/(main)/page.tsx`에서 `team_mem_rel` 쿼리(약 123번째 줄)에 `.eq("mem_st_cd", "active")` 추가:

변경 전:
```typescript
admin
  .from("team_mem_rel")
  .select("mem_id, join_dt, mem_mst!inner(mem_nm)")
  .eq("team_id", teamId)
  .eq("vers", 0)
  .eq("del_yn", false)
  .order("join_dt", { ascending: false })
  .limit(10)
```

변경 후:
```typescript
admin
  .from("team_mem_rel")
  .select("mem_id, join_dt, mem_mst!inner(mem_nm)")
  .eq("team_id", teamId)
  .eq("mem_st_cd", "active")
  .eq("vers", 0)
  .eq("del_yn", false)
  .order("join_dt", { ascending: false })
  .limit(10)
```

- [ ] **Step 2: 타입 체크**

```bash
pnpm tsc --noEmit
```

- [ ] **Step 3: 커밋**

```bash
git add "app/(main)/page.tsx"
git commit -m "feat(home): 비활성 회원 공개 조회 화면에서 제외"
```

---

## Task 5: 회비관리 UI — 비활성 배지 + 비활성 설정 버튼

**Files:**
- Modify: `app/(info)/admin/dues/members/page.tsx`
- Modify: `app/(info)/admin/dues/members/dues-members-client.tsx`

- [ ] **Step 1: page.tsx 쿼리 수정**

`app/(info)/admin/dues/members/page.tsx`에서 members 쿼리의 select 변경:

변경 전:
```typescript
.select("mem_id, mem_nm, birth_dt, team_mem_rel!inner(join_dt)")
```

변경 후:
```typescript
.select("mem_id, mem_nm, birth_dt, team_mem_rel!inner(join_dt, mem_st_cd, inact_rsn_txt)")
```

그리고 `memberList` 매핑에서 `join_dt` 추출 패턴과 동일하게 추가:

변경 전:
```typescript
return {
  mem_id: m.mem_id,
  mem_nm: m.mem_nm,
  birth_dt: m.birth_dt ?? null,
  join_dt: Array.isArray(m.team_mem_rel) ? (m.team_mem_rel[0]?.join_dt ?? null) : null,
  snap,
  is_stale,
};
```

변경 후:
```typescript
const rel = Array.isArray(m.team_mem_rel) ? m.team_mem_rel[0] : m.team_mem_rel;
return {
  mem_id: m.mem_id,
  mem_nm: m.mem_nm,
  birth_dt: m.birth_dt ?? null,
  join_dt: (rel as { join_dt?: string | null } | null)?.join_dt ?? null,
  mem_st_cd: (rel as { mem_st_cd?: string | null } | null)?.mem_st_cd ?? "active",
  inact_rsn_txt: (rel as { inact_rsn_txt?: string | null } | null)?.inact_rsn_txt ?? null,
  snap,
  is_stale,
};
```

- [ ] **Step 2: dues-members-client.tsx MemberRow 타입 확장**

`dues-members-client.tsx` 파일의 `MemberRow` 타입 수정:

```typescript
type MemberRow = {
  mem_id: string;
  mem_nm: string;
  birth_dt: string | null;
  join_dt: string | null;
  snap: { bal_snap_id: string; bal_amt: number; last_calc_dt: string; last_calc_at: string | null } | null;
  is_stale: boolean;
  mem_st_cd: string;
  inact_rsn_txt: string | null;
};
```

- [ ] **Step 3: 비활성 설정 import 추가**

파일 상단 import에 추가:
```typescript
import { batchDeactivateMembers } from "@/app/actions/admin/manage-member";
import { UserMinus } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
```

(Textarea가 없으면 Input으로 대체 가능)

- [ ] **Step 4: 비활성 설정 상태 변수 추가**

`DuesMembersClient` 함수 안에 기존 state 아래에 추가:
```typescript
const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);
const [deactivateReason, setDeactivateReason] = useState("");
```

- [ ] **Step 5: 비활성 설정 핸들러 추가**

`handleSendNoti` 함수 아래에 추가:
```typescript
const activeSelectedMembers = [...selectedIds].filter(
  (id) => members.find((m) => m.mem_id === id)?.mem_st_cd === "active"
);

async function handleDeactivate() {
  if (!deactivateReason.trim()) return;
  startTransition(async () => {
    const res = await batchDeactivateMembers(activeSelectedMembers, deactivateReason.trim());
    if (res.ok) {
      setDeactivateDialogOpen(false);
      setDeactivateReason("");
      setSelectedIds(new Set());
      router.refresh();
    } else {
      alert(res.message);
    }
  });
}
```

- [ ] **Step 6: 상단 액션 버튼에 비활성 설정 버튼 추가**

기존 알림 전송 버튼 바로 뒤에:

```tsx
{activeSelectedMembers.length > 0 && (
  <Button
    variant="outline"
    size="sm"
    onClick={() => setDeactivateDialogOpen(true)}
    disabled={isPending}
  >
    <UserMinus className="size-3.5 mr-1" />
    비활성 설정 ({activeSelectedMembers.length}명)
  </Button>
)}
```

- [ ] **Step 7: 비활성 배지 및 행 스타일 적용**

`displayedMembers.map` 내부 `TableRow`와 이름 셀에서:

`TableRow`에 조건부 클래스 추가:
```tsx
<TableRow
  key={m.mem_id}
  className={`${isChecked ? "bg-muted/40" : ""} ${m.mem_st_cd === "inactive" ? "opacity-60" : ""}`}
  onClick={() => toggleMember(m.mem_id)}
>
```

이름 `TableCell` 안에 배지 추가:
```tsx
<TableCell className="text-center">
  <div className="flex items-center justify-center gap-1.5">
    <Caption className="text-xs font-semibold whitespace-nowrap">{m.mem_nm}</Caption>
    {m.mem_st_cd === "inactive" && (
      <Badge variant="secondary" className="text-[10px] px-1 py-0">비활성</Badge>
    )}
  </div>
</TableCell>
```

- [ ] **Step 8: 비활성 설정 다이얼로그 추가**

기존 면제 등록 다이얼로그 아래에 추가:
```tsx
<Dialog open={deactivateDialogOpen} onOpenChange={(o) => { if (!o) { setDeactivateDialogOpen(false); setDeactivateReason(""); } }}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>비활성 설정 ({activeSelectedMembers.length}명)</DialogTitle>
    </DialogHeader>
    <div className="flex flex-col gap-4 pt-2">
      <div className="flex flex-col gap-1.5">
        <Label>비활성화 사유</Label>
        <Input
          value={deactivateReason}
          onChange={(e) => setDeactivateReason(e.target.value)}
          placeholder="예: 장기 미참여, 자진 탈퇴 요청 등"
        />
      </div>
      <Button
        onClick={handleDeactivate}
        disabled={isPending || !deactivateReason.trim()}
        variant="destructive"
      >
        {isPending ? <LoadingSpinner /> : "비활성 설정"}
      </Button>
    </div>
  </DialogContent>
</Dialog>
```

- [ ] **Step 9: 타입 체크 + 린트**

```bash
pnpm tsc --noEmit && pnpm run lint
```

- [ ] **Step 10: 커밋**

```bash
git add "app/(info)/admin/dues/members/page.tsx" "app/(info)/admin/dues/members/dues-members-client.tsx"
git commit -m "feat(dues): 회비관리 비활성 회원 표시 및 비활성 설정 버튼 추가"
```

---

## Task 6: 회원관리 UI — 테이블 + 다중선택 + 상태 필터 + 시트 확장

**Files:**
- Modify: `app/(info)/admin/members/admin-members-client.tsx`

이 태스크는 큰 리팩토링이다. `GrantPanel`, `TitleSection`은 그대로 유지하고 `AdminMembersClient` 메인 컴포넌트와 `InfoRow`만 변경한다.

- [ ] **Step 1: import 확장**

파일 상단에서 기존 import를 다음으로 교체한다:

```typescript
"use client";

import { useEffect, useRef, useState, useCallback, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { grantTitle } from "@/app/actions/admin/grant-title";
import {
  toggleAdmin,
  deleteMember,
  deactivateMember,
  reactivateMember,
  batchDeactivateMembers,
  batchReactivateMembers,
} from "@/app/actions/admin/manage-member";
import { revokeTitle } from "@/app/actions/admin/revoke-title";
import {
  Search,
  Shield,
  ShieldOff,
  UserRound,
  UserX,
  UserMinus,
  UserCheck,
  ChevronRight,
  X,
} from "lucide-react";
import { Avatar } from "@/components/common/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { H2, Body, Caption, SectionLabel } from "@/components/common/typography";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CardItem } from "@/components/ui/card";
import { EmptyState } from "@/components/common/empty-state";
import { Checkbox } from "@/components/ui/checkbox";
import { SegmentControl } from "@/components/common/segment-control";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { InfoRow } from "@/components/common/info-row";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { dayjs } from "@/lib/dayjs";
```

- [ ] **Step 2: Member 타입 확장**

```typescript
type Member = {
  id: string;
  team_mem_id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  gender: string | null;
  birthday: string | null;
  avatar_url: string | null;
  status: string | null;
  admin: boolean | null;
  joined_at: string | null;
  inact_rsn_txt: string | null;
  bal_amt: number | null;
};
```

- [ ] **Step 3: loadMembers 함수를 병렬 쿼리로 수정**

`AdminMembersClient` 컴포넌트 내의 `loadMembers` 함수 전체를 교체:

```typescript
const loadMembers = useCallback(async () => {
  const supabase = createClient();
  const [{ data: membersData }, { data: snapsData }] = await Promise.all([
    supabase
      .from("team_mem_rel")
      .select(
        "team_mem_id, mem_id, team_role_cd, mem_st_cd, join_dt, inact_rsn_txt, mem_mst!inner(mem_nm, phone_no, email_addr, gdr_enm, birth_dt, avatar_url)",
      )
      .eq("team_id", teamId)
      .eq("vers", 0)
      .eq("del_yn", false)
      .eq("mem_mst.vers", 0)
      .eq("mem_mst.del_yn", false)
      .order("join_dt", { ascending: false }),
    supabase
      .from("fee_mem_bal_snap")
      .select("mem_id, bal_amt")
      .eq("team_id", teamId)
      .eq("vers", 0)
      .eq("del_yn", false),
  ]);

  const snapMap = new Map((snapsData ?? []).map((s) => [s.mem_id, s.bal_amt]));

  type Mst = {
    mem_nm: string;
    phone_no: string | null;
    email_addr: string | null;
    gdr_enm: string | null;
    birth_dt: string | null;
    avatar_url: string | null;
  };

  setMembers(
    (membersData ?? []).map((r) => {
      const m = r.mem_mst as unknown as Mst;
      return {
        id: r.mem_id,
        team_mem_id: r.team_mem_id,
        full_name: m.mem_nm,
        phone: m.phone_no,
        email: m.email_addr,
        gender: m.gdr_enm,
        birthday: m.birth_dt,
        avatar_url: m.avatar_url,
        status: r.mem_st_cd,
        admin: r.team_role_cd === "admin" || r.team_role_cd === "owner",
        joined_at: r.join_dt,
        inact_rsn_txt: r.inact_rsn_txt ?? null,
        bal_amt: snapMap.get(r.mem_id) ?? null,
      };
    }),
  );
  setLoading(false);
}, [teamId]);
```

- [ ] **Step 4: AdminMembersClient 상태 변수 추가**

기존 상태 변수들 아래에 추가:
```typescript
const [isPending, startTransition] = useTransition();
const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
const [deactivateTarget, setDeactivateTarget] = useState<{ ids: string[]; single?: boolean } | null>(null);
const [deactivateReason, setDeactivateReason] = useState("");
```

- [ ] **Step 5: 필터·선택·핸들러 로직 추가**

기존 `filtered` 변수 아래에 추가:
```typescript
const statusFiltered = filtered.filter((m) => {
  if (statusFilter === "all") return true;
  if (statusFilter === "active") return m.status === "active";
  if (statusFilter === "inactive") return m.status === "inactive";
  return true;
});

const activeSelectedIds = [...selectedIds].filter(
  (id) => statusFiltered.find((m) => m.id === id)?.status === "active"
);
const inactiveSelectedIds = [...selectedIds].filter(
  (id) => statusFiltered.find((m) => m.id === id)?.status === "inactive"
);

const displayedIds = statusFiltered.map((m) => m.id);
const isAllSelected = displayedIds.length > 0 && displayedIds.every((id) => selectedIds.has(id));
const isIndeterminate = !isAllSelected && displayedIds.some((id) => selectedIds.has(id));

function toggleMember(id: string) {
  setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
}

function toggleAll() {
  const allSelected = displayedIds.every((id) => selectedIds.has(id));
  setSelectedIds((prev) => {
    const next = new Set(prev);
    if (allSelected) displayedIds.forEach((id) => next.delete(id));
    else displayedIds.forEach((id) => next.add(id));
    return next;
  });
}

async function handleBatchDeactivate(reason: string) {
  const ids = deactivateTarget?.ids ?? [];
  startTransition(async () => {
    const res = await batchDeactivateMembers(ids, reason);
    if (res.ok) {
      setDeactivateTarget(null);
      setDeactivateReason("");
      setSelectedIds(new Set());
      await loadMembers();
    } else {
      alert(res.message);
    }
  });
}

async function handleBatchReactivate(memberIds: string[]) {
  if (!confirm(`${memberIds.length}명을 활성화하시겠습니까?`)) return;
  startTransition(async () => {
    const res = await batchReactivateMembers(memberIds);
    if (res.ok) {
      setSelectedIds(new Set());
      await loadMembers();
    } else {
      alert(res.message);
    }
  });
}

async function handleSingleDeactivate(memberId: string, reason: string) {
  startTransition(async () => {
    const res = await deactivateMember(memberId, reason);
    if (res.ok) {
      setDeactivateTarget(null);
      setDeactivateReason("");
      setSelectedMember(null);
      await loadMembers();
    } else {
      alert(res.message);
    }
  });
}

async function handleSingleReactivate(memberId: string) {
  if (!confirm("활성화하시겠습니까?")) return;
  startTransition(async () => {
    const res = await reactivateMember(memberId);
    if (res.ok) {
      setSelectedMember(null);
      await loadMembers();
    } else {
      alert(res.message);
    }
  });
}
```

- [ ] **Step 6: 기존 handleDeleteMember, handleToggleAdmin 수정**

두 함수의 마지막에서 `setMembers(prev => ...)` 방식 대신 `loadMembers()` 호출로 교체 (데이터 일관성):

```typescript
const handleDeleteMember = async (memberId: string, name: string) => {
  if (!confirm(`${name} 회원을 삭제하시겠습니까?`)) return;
  setActioning(true);
  const result = await deleteMember(memberId);
  if (result.ok) {
    setSelectedMember(null);
    await loadMembers();
  } else {
    alert(result.message);
  }
  setActioning(false);
};

const handleToggleAdmin = async (memberId: string, isAdmin: boolean) => {
  const label = isAdmin ? "관리자로 지정" : "관리자 해제";
  if (!confirm(`${label}하시겠습니까?`)) return;
  setActioning(true);
  const result = await toggleAdmin(memberId, isAdmin);
  if (result.ok) {
    await loadMembers();
    setSelectedMember((prev) =>
      prev?.id === memberId ? { ...prev, admin: isAdmin } : prev,
    );
  } else {
    alert(result.message);
  }
  setActioning(false);
};
```

- [ ] **Step 7: 상태 배지 헬퍼 함수 추가**

`AdminMembersClient` 컴포넌트 밖(위 또는 아래)에 추가:

```typescript
function StatusBadge({ status }: { status: string | null }) {
  if (status === "active") return <Badge variant="default" className="text-[10px] px-1.5 py-0">활성</Badge>;
  if (status === "inactive") return <Badge variant="secondary" className="text-[10px] px-1.5 py-0 text-destructive border-destructive/30">비활성</Badge>;
  if (status === "pending") return <Badge variant="outline" className="text-[10px] px-1.5 py-0">대기</Badge>;
  return <Badge variant="outline" className="text-[10px] px-1.5 py-0">{status ?? "-"}</Badge>;
}
```

- [ ] **Step 8: 메인 JSX 교체 — 테이블 UI**

`AdminMembersClient` 컴포넌트의 return 블록 전체를 교체:

```tsx
if (loading) {
  return (
    <div className="flex flex-col gap-4 px-6 pt-4">
      <Skeleton className="h-8 w-32 rounded" />
      <Skeleton className="h-12 w-full rounded-xl" />
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full rounded" />
      ))}
    </div>
  );
}

return (
  <div className="flex flex-col gap-4 px-6 pb-6 pt-4">
    <H2>회원 관리</H2>

    {/* 검색 */}
    <div className="relative">
      <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="이름 또는 전화번호 검색"
        className="h-12 rounded-xl border-[1.5px] pl-10 text-[15px]"
      />
    </div>

    {/* 상태 필터 */}
    <SegmentControl
      segments={[
        { value: "all", label: `전체 ${members.length}명` },
        { value: "active", label: `활성 ${members.filter((m) => m.status === "active").length}명` },
        { value: "inactive", label: `비활성 ${members.filter((m) => m.status === "inactive").length}명` },
      ]}
      value={statusFilter}
      onValueChange={(v) => {
        setStatusFilter(v as "all" | "active" | "inactive");
        setSelectedIds(new Set());
      }}
    />

    {/* 배치 액션 */}
    {selectedIds.size > 0 && (
      <div className="flex flex-wrap gap-2">
        {activeSelectedIds.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setDeactivateTarget({ ids: activeSelectedIds })}
            disabled={isPending}
          >
            <UserMinus className="size-3.5 mr-1" />
            비활성 설정 ({activeSelectedIds.length}명)
          </Button>
        )}
        {inactiveSelectedIds.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleBatchReactivate(inactiveSelectedIds)}
            disabled={isPending}
          >
            <UserCheck className="size-3.5 mr-1" />
            활성화 ({inactiveSelectedIds.length}명)
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
          선택 해제
        </Button>
      </div>
    )}

    {/* 테이블 */}
    <div className="overflow-x-auto rounded-2xl border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10 text-center">
              <div className="flex justify-center">
                <Checkbox
                  checked={isAllSelected}
                  data-state={isIndeterminate ? "indeterminate" : isAllSelected ? "checked" : "unchecked"}
                  onCheckedChange={toggleAll}
                />
              </div>
            </TableHead>
            {["이름", "성별", "생년월일", "가입일자", "연락처", "회원상태", "회비잔액"].map((h) => (
              <TableHead key={h} className="text-center text-xs whitespace-nowrap">{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {statusFiltered.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="py-10 text-center">
                <Caption className="text-muted-foreground">회원이 없습니다.</Caption>
              </TableCell>
            </TableRow>
          )}
          {statusFiltered.map((member) => {
            const isChecked = selectedIds.has(member.id);
            return (
              <TableRow
                key={member.id}
                className={`cursor-pointer ${isChecked ? "bg-muted/40" : ""} ${member.status === "inactive" ? "opacity-60" : ""}`}
                onClick={() => setSelectedMember(member)}
              >
                <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-center">
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={() => toggleMember(member.id)}
                    />
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <Caption className="text-xs font-semibold whitespace-nowrap">{member.full_name ?? "-"}</Caption>
                </TableCell>
                <TableCell className="text-center">
                  <Caption className="text-xs whitespace-nowrap">
                    {member.gender === "male" ? "남" : member.gender === "female" ? "여" : "-"}
                  </Caption>
                </TableCell>
                <TableCell className="text-center">
                  <Caption className="text-xs whitespace-nowrap">{member.birthday ?? "-"}</Caption>
                </TableCell>
                <TableCell className="text-center">
                  <Caption className="text-xs whitespace-nowrap">
                    {member.joined_at ? dayjs(member.joined_at).format("YYYY.MM.DD") : "-"}
                  </Caption>
                </TableCell>
                <TableCell className="text-center">
                  <Caption className="text-xs whitespace-nowrap">{member.phone ?? "-"}</Caption>
                </TableCell>
                <TableCell className="text-center">
                  <StatusBadge status={member.status} />
                </TableCell>
                <TableCell className="text-center">
                  {member.bal_amt === null ? (
                    <Caption className="text-xs text-muted-foreground">-</Caption>
                  ) : (
                    <Caption
                      className={`text-xs font-semibold whitespace-nowrap ${
                        member.bal_amt < 0 ? "text-destructive" : member.bal_amt > 0 ? "text-primary" : ""
                      }`}
                    >
                      {member.bal_amt > 0 && "+"}{member.bal_amt.toLocaleString()}원
                    </Caption>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>

    {/* 회원 상세 시트 */}
    {selectedMember && (
      <div className="fixed inset-0 z-50 flex flex-col">
        <div className="flex-1 bg-black/40" onClick={() => setSelectedMember(null)} />
        <div className="flex max-h-[85vh] flex-col overflow-y-auto rounded-t-3xl bg-background pb-8">
          <div className="flex justify-center py-3">
            <div className="h-1 w-10 rounded-full bg-border" />
          </div>
          <div className="flex flex-col gap-6 px-6">
            {/* 헤더 */}
            <div className="flex items-center gap-4">
              <Avatar src={selectedMember.avatar_url} size="lg" />
              <div className="flex flex-1 flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-foreground">
                    {selectedMember.full_name ?? "이름 없음"}
                  </span>
                  {selectedMember.admin && (
                    <Badge variant="default" className="text-[11px]">관리자</Badge>
                  )}
                  <StatusBadge status={selectedMember.status} />
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setSelectedMember(null)}
                className="text-muted-foreground"
              >
                <X className="size-5" />
              </Button>
            </div>

            {/* 정보 */}
            <div className="flex flex-col gap-0">
              <InfoRow label="연락처" value={selectedMember.phone} />
              <InfoRow label="이메일" value={selectedMember.email} />
              <InfoRow
                label="성별"
                value={selectedMember.gender === "male" ? "남성" : selectedMember.gender === "female" ? "여성" : null}
              />
              <InfoRow label="생년월일" value={selectedMember.birthday} />
              <InfoRow
                label="가입일"
                value={selectedMember.joined_at ? dayjs(selectedMember.joined_at).format("YYYY.MM.DD") : null}
              />
              <InfoRow
                label="회비잔액"
                value={selectedMember.bal_amt !== null
                  ? `${selectedMember.bal_amt > 0 ? "+" : ""}${selectedMember.bal_amt.toLocaleString()}원`
                  : null}
              />
              {selectedMember.status === "inactive" && (
                <InfoRow
                  label="비활성 사유"
                  value={selectedMember.inact_rsn_txt || "사유 없음"}
                />
              )}
            </div>

            {/* 칭호 관리 */}
            <TitleSection member={selectedMember} teamId={teamId} />

            {/* 액션 버튼 */}
            <div className="flex flex-col gap-2">
              {selectedMember.admin ? (
                <Button
                  variant="outline"
                  onClick={() => handleToggleAdmin(selectedMember.id, false)}
                  disabled={actioning || isPending}
                  className="h-auto justify-start gap-3 rounded-xl px-4 py-3.5 text-left"
                >
                  <ShieldOff className="size-4 text-muted-foreground" />
                  <span className="text-[15px] font-medium text-foreground">관리자 해제</span>
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => handleToggleAdmin(selectedMember.id, true)}
                  disabled={actioning || isPending}
                  className="h-auto justify-start gap-3 rounded-xl px-4 py-3.5 text-left"
                >
                  <Shield className="size-4 text-primary" />
                  <span className="text-[15px] font-medium text-foreground">관리자 지정</span>
                </Button>
              )}

              {selectedMember.status === "active" ? (
                <Button
                  variant="outline"
                  onClick={() => setDeactivateTarget({ ids: [selectedMember.id], single: true })}
                  disabled={actioning || isPending}
                  className="h-auto justify-start gap-3 rounded-xl px-4 py-3.5 text-left"
                >
                  <UserMinus className="size-4 text-warning" />
                  <span className="text-[15px] font-medium text-foreground">비활성 설정</span>
                </Button>
              ) : selectedMember.status === "inactive" ? (
                <Button
                  variant="outline"
                  onClick={() => handleSingleReactivate(selectedMember.id)}
                  disabled={actioning || isPending}
                  className="h-auto justify-start gap-3 rounded-xl px-4 py-3.5 text-left"
                >
                  <UserCheck className="size-4 text-primary" />
                  <span className="text-[15px] font-medium text-foreground">활성화</span>
                </Button>
              ) : null}

              <Button
                variant="outline"
                onClick={() => handleDeleteMember(selectedMember.id, selectedMember.full_name ?? "이름 없음")}
                disabled={actioning || isPending}
                className="h-auto justify-start gap-3 rounded-xl px-4 py-3.5 text-left"
              >
                <UserX className="size-4 text-destructive" />
                <span className="text-[15px] font-medium text-destructive">회원 삭제</span>
              </Button>
            </div>
          </div>
        </div>
      </div>
    )}

    {/* 비활성 설정 다이얼로그 */}
    <Dialog
      open={!!deactivateTarget}
      onOpenChange={(o) => { if (!o) { setDeactivateTarget(null); setDeactivateReason(""); } }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            비활성 설정 ({deactivateTarget?.ids.length ?? 0}명)
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 pt-2">
          <div className="flex flex-col gap-1.5">
            <Label>비활성화 사유</Label>
            <Input
              value={deactivateReason}
              onChange={(e) => setDeactivateReason(e.target.value)}
              placeholder="예: 장기 미참여, 자진 탈퇴 요청 등"
            />
          </div>
          <Button
            onClick={() => {
              if (deactivateTarget?.single && deactivateTarget.ids[0]) {
                handleSingleDeactivate(deactivateTarget.ids[0], deactivateReason.trim());
              } else if (deactivateTarget) {
                handleBatchDeactivate(deactivateReason.trim());
              }
            }}
            disabled={isPending || !deactivateReason.trim()}
            variant="destructive"
          >
            {isPending ? <LoadingSpinner /> : "비활성 설정"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  </div>
);
```

- [ ] **Step 9: 파일 하단의 로컬 InfoRow 컴포넌트 삭제**

파일 하단에 있는 로컬 `InfoRow` 함수를 삭제한다. (이미 `@/components/common/info-row`에서 import하므로)

- [ ] **Step 10: 타입 체크 + 린트**

```bash
pnpm tsc --noEmit && pnpm run lint
```

에러 없음 확인. `InfoRow` props가 일치하지 않으면 `@/components/common/info-row`의 실제 props 확인 후 맞춤.

- [ ] **Step 11: 커밋**

```bash
git add "app/(info)/admin/members/admin-members-client.tsx"
git commit -m "feat(admin): 회원관리 테이블 UI 전환 + 다중선택 + 상태 필터 + 비활성 설정"
```

---

## Task 7: 최종 검증 + 빌드 확인

- [ ] **Step 1: 전체 빌드 확인**

```bash
pnpm run build
```

빌드 에러 없음 확인. 에러 발생 시 메시지에 따라 수정.

- [ ] **Step 2: dev 서버에서 수동 검증**

```bash
pnpm run dev
```

체크리스트:
- [ ] 회비관리 → 회원별 잔액: 비활성 회원에 `[비활성]` 배지 표시
- [ ] 회비관리 → 활성 회원 체크 → "비활성 설정" 버튼 표시
- [ ] 비활성 설정 다이얼로그 → 사유 입력 → 확인 → 상태 변경
- [ ] 회원관리 → 테이블 형태 표시
- [ ] 회원관리 → 상태 필터 (전체/활성/비활성)
- [ ] 회원관리 → 행 클릭 → 시트에 회비잔액, 비활성 사유 표시
- [ ] 회원관리 → 비활성 회원 클릭 → "활성화" 버튼 표시
- [ ] 회원관리 → 활성 회원 클릭 → "비활성 설정" 버튼 표시
- [ ] 홈 최근 가입자 목록에서 비활성 회원 미표시

- [ ] **Step 3: 최종 커밋**

```bash
git status
git commit -m "feat: 비활성 회원 관리 시스템 구현 완료" --allow-empty
```
