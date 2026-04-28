# UTMB 인덱스 일괄 갱신 (관리자) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자가 `/admin/utmb-refresh` 페이지에서 버튼 한 번으로 등록된 모든 회원의 UTMB 인덱스를 utmb.world에서 재조회·저장할 수 있는 도구를 추가한다.

**Architecture:** 신규 서버 액션 `refreshUtmbIndexes()`가 `verifyAdmin()` 검증 후 service role 클라이언트로 `mem_utmb_prf`(현재 팀 한정) 전체를 순회하며 기존 파서 `fetchUtmbIndex`를 재사용해 페이지를 가져오고, 행별로 update/skip/fail을 결정한 뒤 결과 배열을 반환한다. 클라이언트는 결과를 표로 렌더링한다.

**Tech Stack:** Next.js App Router (서버 액션, 서버 컴포넌트), Supabase service role 클라이언트, Tailwind v4, shadcn/ui 카드/배지/버튼, lucide-react 아이콘.

**Note on tests:** 프로젝트에 단위 테스트 인프라가 없음. 검증은 `pnpm lint` + `pnpm build` + 마지막 태스크의 수동 QA로 한다.

**Reference design doc:** `docs/superpowers/specs/2026-04-28-utmb-index-bulk-refresh-design.md`

---

## File Structure

신규:
- `app/actions/admin/refresh-utmb-indexes.ts` — 일괄 갱신 서버 액션 (핵심 로직)
- `app/actions/admin/get-utmb-last-refreshed-at.ts` — 카드 보조 정보(마지막 갱신 시각, 등록 회원 수) 조회
- `app/(info)/admin/utmb-refresh/page.tsx` — 신규 페이지 (서버 컴포넌트)
- `components/admin/utmb-refresh-client.tsx` — 클라이언트 (버튼 + 결과 표)

수정:
- `app/(info)/admin/page.tsx` — "도구" 섹션과 카드 추가

DB 마이그레이션 없음. 기존 `app/actions/utmb.ts#fetchUtmbIndex` 그대로 재사용 (수정 없음).

---

### Task 1: refreshUtmbIndexes 서버 액션 작성

**Files:**
- Create: `app/actions/admin/refresh-utmb-indexes.ts`

- [ ] **Step 1: 액션 파일 생성**

`app/actions/admin/refresh-utmb-indexes.ts`:

```ts
"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAdmin } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { fetchUtmbIndex } from "@/app/actions/utmb";

export type RefreshRow = {
  memId: string;
  name: string;
  before: number;
  after: number | null;
  status: "updated" | "unchanged" | "failed";
  error?: string;
};

export type RefreshResult = {
  rows: RefreshRow[];
  summary: { updated: number; unchanged: number; failed: number };
};

const REQUEST_DELAY_MS = 500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function refreshUtmbIndexes(): Promise<RefreshResult> {
  const me = await verifyAdmin();
  if (!me) throw new Error("권한이 없습니다");

  const { teamId } = await getRequestTeamContext();
  const admin = createAdminClient();

  // 1) 현재 팀 소속 회원 ID 조회
  const { data: teamMembers, error: teamErr } = await admin
    .from("team_mem_rel")
    .select("mem_id")
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false);

  if (teamErr) {
    console.error("[refreshUtmbIndexes] team query error:", teamErr);
    throw new Error("팀 회원 조회에 실패했습니다");
  }

  const memIds = (teamMembers ?? []).map((r) => r.mem_id);
  if (memIds.length === 0) {
    return { rows: [], summary: { updated: 0, unchanged: 0, failed: 0 } };
  }

  // 2) UTMB 프로필 + 이름 조회
  const { data: targets, error: fetchError } = await admin
    .from("mem_utmb_prf")
    .select("mem_id, utmb_prf_url, utmb_idx, mem_mst!inner(mem_nm)")
    .in("mem_id", memIds)
    .eq("vers", 0)
    .eq("del_yn", false)
    .eq("mem_mst.vers", 0)
    .eq("mem_mst.del_yn", false);

  if (fetchError) {
    console.error("[refreshUtmbIndexes] fetch error:", fetchError);
    throw new Error("회원 목록 조회에 실패했습니다");
  }

  const rows: RefreshRow[] = [];

  for (const t of targets ?? []) {
    const memId = t.mem_id;
    const name = (t.mem_mst as unknown as { mem_nm: string }).mem_nm ?? "";
    const before = t.utmb_idx;

    const result = await fetchUtmbIndex(t.utmb_prf_url);

    if (!result.ok) {
      rows.push({
        memId,
        name,
        before,
        after: null,
        status: "failed",
        error: result.error,
      });
      await sleep(REQUEST_DELAY_MS);
      continue;
    }

    const after = result.index;
    const isChanged =
      after !== before ||
      (result.recentRaceName ?? null) !== null ||
      (result.recentRaceRecord ?? null) !== null;

    if (after === before) {
      // 값 동일 — upd_at만 갱신 (마지막 시도 시각 추적)
      const { error: updErr } = await admin
        .from("mem_utmb_prf")
        .update({ upd_at: new Date().toISOString() })
        .eq("mem_id", memId)
        .eq("vers", 0);
      rows.push({
        memId,
        name,
        before,
        after,
        status: updErr ? "failed" : "unchanged",
        error: updErr?.message,
      });
    } else {
      const { error: updErr } = await admin
        .from("mem_utmb_prf")
        .update({
          utmb_idx: after,
          rct_race_nm: result.recentRaceName,
          rct_race_rec: result.recentRaceRecord,
          upd_at: new Date().toISOString(),
        })
        .eq("mem_id", memId)
        .eq("vers", 0);
      rows.push({
        memId,
        name,
        before,
        after,
        status: updErr ? "failed" : "updated",
        error: updErr?.message,
      });
    }

    await sleep(REQUEST_DELAY_MS);
  }

  // 정렬: updated → failed → unchanged
  const order = { updated: 0, failed: 1, unchanged: 2 } as const;
  rows.sort((a, b) => order[a.status] - order[b.status]);

  const summary = rows.reduce(
    (acc, r) => {
      acc[r.status] += 1;
      return acc;
    },
    { updated: 0, unchanged: 0, failed: 0 },
  );

  return { rows, summary };
}
```

- [ ] **Step 2: 타입 체크**

Run: `pnpm exec tsc --noEmit`
Expected: 에러 없음.

DB 타입의 `mem_utmb_prf` 조인 셀렉트가 복잡하므로 `as unknown as { mem_nm: string }` 캐스팅으로 우회한 부분이 핵심. 만약 타입 에러가 발생하면 select 컬럼 문자열에서 inner join 표기를 점검.

- [ ] **Step 3: 커밋**

```bash
git add app/actions/admin/refresh-utmb-indexes.ts
git commit -m "feat(admin): refreshUtmbIndexes 서버 액션 추가"
```

---

### Task 2: getUtmbLastRefreshedAt 액션 작성

**Files:**
- Create: `app/actions/admin/get-utmb-last-refreshed-at.ts`

- [ ] **Step 1: 액션 파일 생성**

`app/actions/admin/get-utmb-last-refreshed-at.ts`:

```ts
"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAdmin } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";

export type UtmbRefreshMeta = {
  lastRefreshedAt: string | null;
  memberCount: number;
};

export async function getUtmbLastRefreshedAt(): Promise<UtmbRefreshMeta> {
  const me = await verifyAdmin();
  if (!me) throw new Error("권한이 없습니다");

  const { teamId } = await getRequestTeamContext();
  const admin = createAdminClient();

  const { data: teamMembers, error: teamErr } = await admin
    .from("team_mem_rel")
    .select("mem_id")
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false);

  if (teamErr) {
    console.error("[getUtmbLastRefreshedAt] team error:", teamErr);
    return { lastRefreshedAt: null, memberCount: 0 };
  }

  const memIds = (teamMembers ?? []).map((r) => r.mem_id);
  if (memIds.length === 0) {
    return { lastRefreshedAt: null, memberCount: 0 };
  }

  const { data, error, count } = await admin
    .from("mem_utmb_prf")
    .select("upd_at", { count: "exact" })
    .in("mem_id", memIds)
    .eq("vers", 0)
    .eq("del_yn", false)
    .order("upd_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error("[getUtmbLastRefreshedAt] error:", error);
    return { lastRefreshedAt: null, memberCount: 0 };
  }

  return {
    lastRefreshedAt: data?.[0]?.upd_at ?? null,
    memberCount: count ?? 0,
  };
}
```

- [ ] **Step 2: 타입 체크**

Run: `pnpm exec tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add app/actions/admin/get-utmb-last-refreshed-at.ts
git commit -m "feat(admin): getUtmbLastRefreshedAt 조회 액션 추가"
```

---

### Task 3: 클라이언트 컴포넌트 작성

**Files:**
- Create: `components/admin/utmb-refresh-client.tsx`

- [ ] **Step 1: 클라이언트 컴포넌트 생성**

`components/admin/utmb-refresh-client.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, MinusCircle, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardItem } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { H2, Body, Caption } from "@/components/common/typography";
import {
  refreshUtmbIndexes,
  type RefreshResult,
  type RefreshRow,
} from "@/app/actions/admin/refresh-utmb-indexes";
import type { UtmbRefreshMeta } from "@/app/actions/admin/get-utmb-last-refreshed-at";

type Props = { meta: UtmbRefreshMeta };

const STATUS_LABEL: Record<RefreshRow["status"], string> = {
  updated: "갱신됨",
  unchanged: "변동 없음",
  failed: "실패",
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "기록 없음";
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function UtmbRefreshClient({ meta }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<RefreshResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRun = () => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await refreshUtmbIndexes();
        setResult(res);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "알 수 없는 오류");
      }
    });
  };

  return (
    <div className="flex flex-col gap-7 px-6 pb-6 pt-4">
      <H2>UTMB 인덱스 갱신</H2>

      <CardItem className="flex flex-col gap-2">
        <Caption>대상</Caption>
        <Body className="font-semibold">등록된 {meta.memberCount}명</Body>
        <Caption className="mt-1">마지막 갱신</Caption>
        <Body>{formatDateTime(meta.lastRefreshedAt)}</Body>
      </CardItem>

      <div className="flex flex-col gap-2">
        <Button onClick={handleRun} disabled={pending} size="lg">
          {pending ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              처리 중...
            </>
          ) : (
            "전체 갱신 시작"
          )}
        </Button>
        {pending && (
          <Caption className="text-center">
            자리를 비우지 마시고 잠시만 기다려 주세요. (~1분 소요)
          </Caption>
        )}
        {error && (
          <Caption className="text-center text-destructive">{error}</Caption>
        )}
      </div>

      {result && (
        <>
          <div className="flex items-center justify-around gap-2">
            <SummaryBadge
              icon={CheckCircle2}
              label="갱신"
              count={result.summary.updated}
              tone="success"
            />
            <SummaryBadge
              icon={MinusCircle}
              label="변동 없음"
              count={result.summary.unchanged}
              tone="muted"
            />
            <SummaryBadge
              icon={XCircle}
              label="실패"
              count={result.summary.failed}
              tone="destructive"
            />
          </div>

          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-[1.4fr_0.7fr_0.7fr_0.9fr] gap-2 border-b border-border pb-2">
              <Caption>멤버</Caption>
              <Caption className="text-right">변경 전</Caption>
              <Caption className="text-right">변경 후</Caption>
              <Caption className="text-right">상태</Caption>
            </div>
            {result.rows.map((row) => (
              <ResultRow key={row.memId} row={row} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SummaryBadge({
  icon: Icon,
  label,
  count,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
  tone: "success" | "muted" | "destructive";
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "destructive"
        ? "text-destructive"
        : "text-muted-foreground";
  return (
    <div className="flex flex-col items-center gap-1">
      <Icon className={`size-5 ${toneClass}`} />
      <Body className={`font-bold ${toneClass}`}>{count}</Body>
      <Caption>{label}</Caption>
    </div>
  );
}

function ResultRow({ row }: { row: RefreshRow }) {
  const variant: "default" | "secondary" | "destructive" =
    row.status === "updated"
      ? "default"
      : row.status === "failed"
        ? "destructive"
        : "secondary";

  const afterClass =
    row.status === "updated"
      ? "font-bold text-foreground"
      : row.status === "failed"
        ? "text-muted-foreground"
        : "text-muted-foreground";

  const updatedBg =
    row.status === "updated"
      ? "bg-success/5"
      : row.status === "failed"
        ? "bg-destructive/5"
        : "";

  return (
    <div
      className={`grid grid-cols-[1.4fr_0.7fr_0.7fr_0.9fr] items-center gap-2 rounded-md py-2 ${updatedBg}`}
    >
      <div className="flex flex-col">
        <Body className="truncate">{row.name}</Body>
        {row.error && (
          <Caption className="truncate text-destructive">{row.error}</Caption>
        )}
      </div>
      <Body className="text-right text-muted-foreground">{row.before}</Body>
      <Body className={`text-right ${afterClass}`}>
        {row.after ?? "—"}
      </Body>
      <div className="flex justify-end">
        <Badge variant={variant}>{STATUS_LABEL[row.status]}</Badge>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 타입 체크**

Run: `pnpm exec tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: lint 통과 확인**

Run: `pnpm lint`
Expected: 새 파일 관련 경고/에러 없음.

- [ ] **Step 4: 커밋**

```bash
git add components/admin/utmb-refresh-client.tsx
git commit -m "feat(admin): UTMB 일괄 갱신 클라이언트 컴포넌트 추가"
```

---

### Task 4: 신규 페이지 작성

**Files:**
- Create: `app/(info)/admin/utmb-refresh/page.tsx`

- [ ] **Step 1: 페이지 파일 생성**

(상위 `app/(info)/admin/layout.tsx`가 이미 비관리자를 redirect 하므로 페이지에서 또 검사할 필요 없음.)

`app/(info)/admin/utmb-refresh/page.tsx`:

```tsx
import { getUtmbLastRefreshedAt } from "@/app/actions/admin/get-utmb-last-refreshed-at";
import { UtmbRefreshClient } from "@/components/admin/utmb-refresh-client";

export const dynamic = "force-dynamic";

export default async function UtmbRefreshPage() {
  const meta = await getUtmbLastRefreshedAt();
  return <UtmbRefreshClient meta={meta} />;
}
```

- [ ] **Step 2: 타입 체크**

Run: `pnpm exec tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: 라우트가 빌드되는지 확인**

Run: `pnpm build`
Expected: `/admin/utmb-refresh` 라우트가 빌드 결과에 포함, 빌드 성공.

- [ ] **Step 4: 커밋**

```bash
git add app/\(info\)/admin/utmb-refresh/page.tsx
git commit -m "feat(admin): /admin/utmb-refresh 페이지 추가"
```

---

### Task 5: 대시보드에 "도구" 섹션 + 카드 추가

**Files:**
- Modify: `app/(info)/admin/page.tsx`

- [ ] **Step 1: 현재 파일 확인**

Run: `cat "app/(info)/admin/page.tsx"`

`generalCards`, `projectCards` 배열과 `CardGrid`, `AdminDashboardPage` 함수 구조를 다시 본다.

- [ ] **Step 2: import에 RefreshCw 아이콘 추가**

`app/(info)/admin/page.tsx`의 lucide-react import에 `RefreshCw` 추가:

```tsx
import {
  Users,
  Trophy,
  Timer,
  Sparkles,
  FolderKanban,
  HandCoins,
  RefreshCw,
} from "lucide-react";
```

- [ ] **Step 3: "도구" 섹션 카드 컴포넌트 추가**

기존 `CardGrid` 함수 바로 아래(또는 `AdminDashboardPage` 함수 위)에 단일 카드를 위한 별도 컴포넌트를 추가:

```tsx
function ToolCard({
  href,
  icon: Icon,
  label,
  hint,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint?: string;
}) {
  return (
    <CardItem asChild className="flex flex-col gap-2">
      <Link href={href} className="transition-colors active:bg-secondary">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground" />
          <span className="text-[13px] font-medium text-muted-foreground">
            {label}
          </span>
        </div>
        {hint && (
          <span className="text-sm text-foreground">{hint}</span>
        )}
      </Link>
    </CardItem>
  );
}
```

- [ ] **Step 4: AdminDashboardPage JSX에 "도구" 섹션 추가**

`AdminDashboardPage`의 `return` 안 마지막 `<section>` 다음에 새 섹션을 추가:

```tsx
<section className="flex flex-col gap-3">
  <SectionLabel>도구</SectionLabel>
  <ToolCard
    href="/admin/utmb-refresh"
    icon={RefreshCw}
    label="UTMB 인덱스 갱신"
    hint="등록된 회원 전체 재조회"
  />
</section>
```

전체 `AdminDashboardPage` return 결과는 다음과 같아야 함:

```tsx
return (
  <div className="flex flex-col gap-8 px-6 pb-6 pt-4">
    <H2>관리</H2>

    <section className="flex flex-col gap-3">
      <SectionLabel>일반</SectionLabel>
      <CardGrid cards={generalCards} stats={stats} status={status} />
    </section>

    <section className="flex flex-col gap-3">
      <SectionLabel>프로젝트</SectionLabel>
      <CardGrid cards={projectCards} stats={stats} status={status} />
    </section>

    <section className="flex flex-col gap-3">
      <SectionLabel>도구</SectionLabel>
      <ToolCard
        href="/admin/utmb-refresh"
        icon={RefreshCw}
        label="UTMB 인덱스 갱신"
        hint="등록된 회원 전체 재조회"
      />
    </section>
  </div>
);
```

- [ ] **Step 5: 타입 + lint 체크**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: 에러 없음.

- [ ] **Step 6: 커밋**

```bash
git add app/\(info\)/admin/page.tsx
git commit -m "feat(admin): 대시보드에 UTMB 갱신 도구 카드 추가"
```

---

### Task 6: 빌드 + 수동 QA

**Files:** (코드 수정 없음)

- [ ] **Step 1: 전체 빌드 확인**

Run: `pnpm build`
Expected:
- 빌드 성공
- `/admin/utmb-refresh` 라우트가 결과 목록에 등장
- 신규 파일이 모두 컴파일됨

- [ ] **Step 2: dev 서버 실행**

Run: `pnpm dev`
백그라운드에서 띄워두고 다음 단계로.

- [ ] **Step 3: 비관리자 접근 차단 확인**

비관리자 계정으로 로그인된 상태에서 `http://localhost:3000/admin/utmb-refresh` 직접 접근.
Expected: 메인(`/`)으로 redirect (admin layout이 처리).

- [ ] **Step 4: 관리자 진입 + 카드 확인**

관리자 계정으로 로그인 후 `/admin` 접근.
Expected: "도구" 섹션과 "UTMB 인덱스 갱신" 카드 표시.
카드 클릭 → `/admin/utmb-refresh` 이동.

- [ ] **Step 5: 일괄 갱신 실행**

페이지에서 "전체 갱신 시작" 클릭.
Expected:
- 버튼 disabled, 스피너 노출
- 안내 문구 노출 ("자리를 비우지 마시고...")
- 약 N초 후 결과 표 노출
- 결과 요약 배지 (갱신/변동 없음/실패) 표시
- 행 정렬: 갱신됨이 위, 실패가 중간, 변동 없음이 아래

- [ ] **Step 6: 실패 케이스 시뮬레이션**

dev DB(supabase-gigang-dev MCP 또는 SQL 클라이언트)에서 한 회원의 `utmb_prf_url`을 잘못된 값으로 변경:

```sql
UPDATE public.mem_utmb_prf
SET utmb_prf_url = 'https://utmb.world/runner/0000000.invalid.user'
WHERE mem_id = '<적당한_mem_id>'
  AND vers = 0;
```

다시 "전체 갱신 시작" 실행.
Expected: 해당 회원이 `실패: 프로필 없음` 등 사유와 함께 표시되고, 다른 회원은 정상 처리됨.

QA 후 원래 URL로 복구:

```sql
UPDATE public.mem_utmb_prf
SET utmb_prf_url = '<원래_URL>'
WHERE mem_id = '<적당한_mem_id>'
  AND vers = 0;
```

- [ ] **Step 7: DB 직접 확인**

```sql
SELECT mem_id, utmb_idx, upd_at
FROM public.mem_utmb_prf
WHERE vers = 0 AND del_yn = false
ORDER BY upd_at DESC
LIMIT 5;
```

Expected:
- `upd_at`이 방금 실행 시각으로 갱신된 행이 있음 (변동 없는 행도 포함)
- 점수 변경된 회원의 `utmb_idx`가 새 값으로 바뀜

- [ ] **Step 8: 모바일 viewport 확인**

브라우저 dev tools에서 viewport를 375px(iPhone SE)로 설정.
Expected: 결과 표가 가로 스크롤 없이 가독 가능, 멤버 이름 truncate, 배지 보임.

- [ ] **Step 9: 페이지 새로고침 후 카드 hint 갱신 확인**

`/admin`으로 돌아가 새로고침.
Expected: "UTMB 인덱스 갱신" 카드의 보조 정보(향후 hint 확장 시)가 최신으로 표시. 현재 plan에서는 카드 hint가 정적이므로 이 단계는 spot-check 수준.

- [ ] **Step 10: 최종 확인 후 PR 생성 준비**

Run: `git log --oneline feature/admin-utmb-bulk-refresh`
Expected: 디자인 doc 커밋 + plan 문서 커밋 + 5개 구현 커밋이 정상 순서.

```bash
git push -u origin feature/admin-utmb-bulk-refresh
```

(PR 생성은 `/pr` 스킬로 별도 진행)

---

## 완료 기준

- 관리자가 `/admin` 대시보드의 "도구" 섹션에서 "UTMB 인덱스 갱신" 카드 진입 가능
- `/admin/utmb-refresh`에서 버튼 클릭으로 등록된 회원 전체의 UTMB 인덱스가 새로 조회되어 DB에 저장됨
- 회원별 변경 전/후/상태가 표로 표시됨
- 실패 회원은 사유와 함께 표시되고 다른 회원 처리에 영향 없음
- `pnpm build` / `pnpm lint` 모두 통과
- 비관리자 계정의 직접 접근이 차단됨
