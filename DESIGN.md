# 기강 디자인 시스템

## 색상 토큰

### 기본 (Base)

| 토큰 | Tailwind 클래스 | 용도 |
|------|----------------|------|
| `--background` | `bg-background` | 페이지 배경 (흰색) |
| `--foreground` | `text-foreground` | 기본 텍스트 (거의 검정) |
| `--primary` | `bg-primary`, `text-primary` | 주요 액션, 링크 (파란색) |
| `--secondary` | `bg-secondary` | 보조 배경, 아바타 폴백 배경 |
| `--muted` | `bg-muted` | 비활성 배경 |
| `--muted-foreground` | `text-muted-foreground` | 보조 텍스트, 라벨 |
| `--destructive` | `bg-destructive` | 삭제, 오류 (빨간색) |
| `--border` | `border-border` | 테두리, 구분선 |

### 상태 (Status)

| 토큰 | 용도 |
|------|------|
| `--success` | 완주, 성공 (초록) |
| `--warning` | 진행중, 주의 (주황) |
| `--info` | 예정, 안내 (파란) |
| `--destructive` | DNF, 오류 (빨강) |

### 종목 (Sport)

| 토큰 | Tailwind 클래스 | 종목 |
|------|----------------|------|
| `--sport-road-run` | `bg-sport-road-run` | 로드 러닝 |
| `--sport-ultra` | `bg-sport-ultra` | 울트라마라톤 |
| `--sport-trail-run` | `bg-sport-trail-run` | 트레일 러닝 |
| `--sport-triathlon` | `bg-sport-triathlon` | 철인3종 |
| `--sport-cycling` | `bg-sport-cycling` | 사이클 |

`chart-1~5`는 `sport-*` 참조 (하위호환).

---

## 타이포그래피

`components/common/typography.tsx`에 시맨틱 컴포넌트로 정의. **`text-[28px]` 등 매직넘버 대신 반드시 타이포그래피 컴포넌트 사용.**

```tsx
import { H1, H2, Body, Caption, Micro, SectionLabel } from "@/components/common/typography";
```

| 컴포넌트 | HTML 태그 | 사이즈 | 기본 스타일 | 용도 |
|----------|-----------|--------|------------|------|
| `<H1>` | `h1` | 28px bold | text-foreground | 메인 탭 페이지 제목 |
| `<H2>` | `h2` | 22px bold | text-foreground | 서브 페이지 제목 |
| `<Body>` | `span` | 15px | text-foreground | 리스트 이름, 본문 |
| `<Caption>` | `span` | 13px | text-muted-foreground | 서브 정보, 필터 |
| `<Micro>` | `span` | 11px | text-muted-foreground | 배지, 날짜 세부 |
| `<SectionLabel>` | `span` | 12px semibold tracking-widest | text-muted-foreground | 영문 섹션 라벨 |

모든 타이포그래피 컴포넌트는 `className` prop으로 스타일 오버라이드 가능:

```tsx
<Body className="font-semibold">홍길동</Body>
<Caption className="text-foreground">강조된 캡션</Caption>
```

---

## 간격 & 레이아웃

| 항목 | 값 | 비고 |
|------|-----|------|
| 페이지 좌우 패딩 | `px-6` | 모든 페이지 공통 |
| 섹션 간 간격 | `gap-7` | 메인 페이지 콘텐츠 |
| 섹션 내부 간격 | `gap-4` | 섹션 헤더 ~ 콘텐츠 |
| 카드 내부 패딩 | `p-4` | CardItem 기본 |
| 카드 반지름 | `rounded-2xl` (24px) | CardItem, Skeleton |
| 버튼/입력 반지름 | `rounded-md` (6px) | Button, Input |
| 그리드 간격 | `gap-3` | 카드 그리드 |

---

## 컴포넌트 카탈로그

### shadcn/ui 기본 (`components/ui/`)

`pnpm dlx shadcn@latest add [name]`으로 추가. 이 폴더에는 shadcn 공식 컴포넌트만 배치.

| 컴포넌트 | 파일 | 용도 |
|----------|------|------|
| Button | `button.tsx` | 액션 버튼 (6 variant × 8 size) |
| Card / CardItem | `card.tsx` | 카드 레이아웃. **CardItem** = 프로젝트 공통 (outlined/dashed) |
| Badge | `badge.tsx` | 상태 배지 |
| Input | `input.tsx` | 텍스트 입력 |
| Label | `label.tsx` | 폼 라벨 |
| Dialog | `dialog.tsx` | 모달 다이얼로그 |
| Form | `form.tsx` | React Hook Form 통합 |
| Select | `select.tsx` | 드롭다운 선택 |
| Separator | `separator.tsx` | 구분선 |
| Skeleton | `skeleton.tsx` | 로딩 스켈레톤 |
| LoadingSpinner | `loading-spinner.tsx` | 스피너 |

### 프로젝트 공통 (`components/common/`)

| 컴포넌트 | 파일 | Props | 용도 |
|----------|------|-------|------|
| H1, H2, Body, Caption, Micro, SectionLabel | `typography.tsx` | `children`, `className?` | 타이포그래피 |
| PageHeader | `page-header.tsx` | `title`, `action?` | 메인 페이지 상단 h-14 헤더 |
| SectionHeader | `section-header.tsx` | `label`, `action?` | 섹션 라벨 + "모두 보기" 링크 |
| EmptyState | `empty-state.tsx` | `message`, `icon?`, `variant?` | 빈 목록 ("card" / "inline") |
| SegmentControl | `segment-control.tsx` | `segments`, `value`, `onValueChange` | 탭 전환 UI |
| InfoRow | `info-row.tsx` | `label`, `value?` | label-value 쌍 행 |
| Avatar | `avatar.tsx` | `src?`, `size?`, `fallbackIcon?` | 프로필 사진 + 폴백 아이콘 |
| StatCard | `stat-card.tsx` | `value`, `label`, `valueClassName?` | 통계 수치 카드 |

---

## 사용 규칙

### 페이지 작성 시

```tsx
import { PageHeader } from "@/components/common/page-header";

<div className="flex flex-col gap-0">
  <PageHeader title="페이지 제목" />
  <div className="flex flex-col gap-7 px-6 pb-6">
    {/* 섹션들 */}
  </div>
</div>
```

### 섹션 작성 시

```tsx
import { SectionHeader } from "@/components/common/section-header";

<div className="flex flex-col gap-4">
  <SectionHeader label="SECTION NAME" action={{ label: "모두 보기", href: "/path" }} />
  {/* 콘텐츠 */}
</div>
```

### 텍스트

```tsx
import { H1, Body, Caption, SectionLabel } from "@/components/common/typography";

<H1>기강</H1>
<Body className="font-semibold">홍길동</Body>
<Caption>서울 · 4/12</Caption>
<SectionLabel>TEAM OVERVIEW</SectionLabel>
```

### 빈 상태

```tsx
import { EmptyState } from "@/components/common/empty-state";

<EmptyState variant="card" message="등록된 기록이 없습니다." />
<EmptyState icon={Trophy} message="아직 대회 기록이 없습니다." />
```

### 통계 그리드

```tsx
import { StatCard } from "@/components/common/stat-card";

<div className="grid grid-cols-2 gap-3">
  <StatCard value={42} label="활동 멤버" />
  <StatCard value={5} label="예정 대회" />
</div>
```

### 탭 전환

```tsx
import { SegmentControl } from "@/components/common/segment-control";

<SegmentControl
  segments={[
    { value: "gigang", label: "기강 대회" },
    { value: "all", label: "전체 대회" },
  ]}
  value={tab}
  onValueChange={setTab}
/>
```

### 아바타

```tsx
import { Avatar } from "@/components/common/avatar";

<Avatar src={member.avatar_url} size="md" />  // sm=32px, md=40px, lg=56px, xl=64px
```

### 정보 행 목록

```tsx
import { InfoRow } from "@/components/common/info-row";

<div>
  <InfoRow label="이름" value="홍길동" />
  <InfoRow label="이메일" value="runner@gigang.kr" />
  <InfoRow label="계좌번호" />  {/* 값 없으면 "-" 표시 */}
</div>
```

---

## AI를 위한 규칙

1. **텍스트**: `text-[28px]` 등 매직넘버 금지 → `<H1>`, `<Body>`, `<Caption>` 등 타이포그래피 컴포넌트 사용
2. **페이지 헤더**: `PageHeader` 컴포넌트 사용 (직접 h-14 div 작성 금지)
3. **섹션 라벨**: `SectionHeader` 컴포넌트 사용 (tracking-widest 직접 작성 금지)
4. **빈 상태**: `EmptyState` 컴포넌트 사용 (CardItem variant="dashed" 직접 조합 금지)
5. **탭 UI**: `SegmentControl` 컴포넌트 사용
6. **통계 카드**: `StatCard` 컴포넌트 사용 (CardItem + text-2xl 직접 조합 금지)
7. **프로필 사진**: `Avatar` 컴포넌트 사용 (rounded-full + img + fallback 직접 작성 금지)
8. **정보 표시**: label-value 쌍은 `InfoRow` 사용
9. **카드 래퍼**: 모든 카드는 `CardItem` (outlined/dashed) 사용, 커스텀 border 작성 금지
10. **색상**: CSS 변수 토큰만 사용, 하드코딩 RGB/hex 금지
11. **컴포넌트 위치**: shadcn 설치 컴포넌트 → `ui/`, 프로젝트 공통 → `common/`, 도메인별 → `auth/`, `races/` 등
