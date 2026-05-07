---
paths:
  - "components/**/*.tsx"
  - "components/**/*.ts"
  - "app/**/*.tsx"
  - "app/**/*.ts"
---

# 프론트엔드 규칙

## 파일 네이밍
| 대상 | 규칙 | 예시 |
|------|------|------|
| 컴포넌트 파일 | kebab-case | `race-list-view.tsx` |
| 컴포넌트명 | PascalCase | `RaceListView` |
| 페이지 | `page.tsx` | `app/(main)/races/page.tsx` |
| 레이아웃 | `layout.tsx` | `app/(main)/layout.tsx` |
| API 라우트 | `route.ts` | `app/api/revalidate/route.ts` |
| 서버 액션 | 기능명.ts | `app/actions/upload-avatar.ts` |

## 컴포넌트 디렉토리
```
components/
  ui/       # shadcn/ui primitive만 (pnpm dlx shadcn@latest add [name])
  common/   # 프로젝트 공통
  auth/     # 인증
  races/    # 대회 도메인
  profile/  # 프로필 도메인
  projects/ # 프로젝트 도메인
  home/     # 홈 도메인
```

shadcn/ui 설치 목록: `badge`, `button`, `card`, `dialog`, `form`, `input`, `label`, `loading-spinner`, `select`, `separator`, `skeleton`

## 컴포넌트 규칙
- 서버 컴포넌트 기본, `"use client"`는 인터랙션 필요 시에만
- `cn()` 으로 className 조합 (인라인 삼항 금지)
- `@/` 경로 별칭 사용 (상대 경로 금지)

## 디자인 시스템
- 타이포그래피: `<H1>`, `<H2>`, `<Body>`, `<Caption>`, `<Micro>`, `<SectionLabel>` 컴포넌트 사용 (`text-[28px]` 등 매직넘버 금지)
- 페이지 헤더: `PageHeader` / 섹션: `SectionHeader` / 빈 상태: `EmptyState` / 통계: `StatCard`
- 색상: CSS 변수 토큰만 (`--primary`, `--muted` 등), hex/rgb 하드코딩 금지
- 이미지: `next/image` (sizes, priority 설정)

## 레이아웃 패턴
- `(main)` 그룹: 하단 `BottomTabBar` 고정, 콘텐츠 `pb-20`
- `(info)` 그룹: 상단 `BackHeader`
- 로딩: `<Suspense fallback={<Skeleton className="h-40 w-full rounded-2xl" />}>`

## 폼 패턴 (RHF + Zod + shadcn)
```typescript
"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { mySchema } from "@/lib/validations/[domain]";

const form = useForm({ resolver: zodResolver(mySchema), defaultValues: { ... } });
```
- Zod 스키마 위치: `lib/validations/[domain].ts`

## 데이터 & 환경변수
- 환경변수: `lib/env.ts`에서 import (`process.env` 직접 접근 금지)
- 날짜: `lib/dayjs.ts` 사용 (`new Date()` 직접 사용 금지)
- 멤버 조회: `getCurrentMember()` (`lib/queries/member.ts`)

## JSDoc
- **필수**: export 함수, 사이드 이펙트 있는 함수, 복잡한 반환 구조
- **생략 가능**: 이름만으로 명확한 trivial 함수
- "what/when" 기술, "how" 금지. 타입 중복 기재 금지 (TypeScript가 처리)
