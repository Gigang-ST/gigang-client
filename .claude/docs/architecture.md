# 아키텍처 가이드

## 라우팅 구조

### Route Groups
Next.js App Router의 Route Group을 사용하여 레이아웃 분리:

| 그룹 | 용도 | 레이아웃 특징 |
|------|------|--------------|
| `(main)` | 메인 탭 페이지 | BottomTabBar (홈/대회/기록/프로필) |
| `(info)` | 정보/설정 페이지 | BackHeader (뒤로가기) |
| `(protected)` | 인증 필수 페이지 | 온보딩 등 |
| `auth/` | 인증 플로우 | 별도 레이아웃 |

### 주요 페이지
- `/` - 홈 (팀 통계, 예정 대회, 최근 기록)
- `/races` - 대회 목록 (예정/완료 탭, 연도 필터, 참가 등록)
- `/records` - 기록/랭킹 (마라톤/철인3종/트레일러닝 카테고리)
- `/profile` - 프로필 (개인최고기록, UTMB 인덱스)
- `/settings` - 설정 (프로필 편집, 계좌 정보, 로그아웃)

## 인증 흐름

```
1. 로그인 페이지 → 카카오/구글 OAuth 선택
2. Supabase OAuth → 외부 인증
3. /auth/callback → code를 session으로 교환
4. 신규 사용자 → /onboarding (전화번호 → 회원정보 입력)
5. 기존 사용자 → / (홈)
```

### 미들웨어 (proxy.ts)
- `updateSession()`으로 매 요청마다 세션 갱신
- Protected 경로: `/onboarding`, `/profile`, `/profile/*`, `/settings`, `/profile/bank`, `/profile/edit`
- Public 경로: `/`, `/rules`, `/join`, `/races`, `/records`, `/terms`, `/privacy`, `/policy`, `/auth/*`

## 데이터 패칭 패턴

### 서버 컴포넌트
```typescript
// 서버에서 Supabase 직접 호출
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  const supabase = await createClient();
  const { data } = await supabase.from("table").select("*");
  return <Component data={data} />;
}
```

### 캐싱
- `unstable_cache`로 데이터 캐싱 (예: 대회 목록 86400초)
- `/api/revalidate` 웹훅으로 ISR 무효화 (`x-webhook-secret` 필요)

### 클라이언트 컴포넌트
```typescript
"use client";
import { createClient } from "@/lib/supabase/client";

// 브라우저에서 실시간 데이터 처리
const supabase = createClient();
```

## PWA 설정
- `app/manifest.ts`에서 Web App Manifest 생성
- standalone 모드, 아이콘 5종 (72~512px)
- 모바일 최적화 viewport (safe-area-inset, no-zoom)

## API 라우트
- `POST /api/revalidate` - Supabase webhook에서 호출, 페이지 캐시 무효화
  - `x-webhook-secret` 헤더 검증 필수

## 서버 액션
- `app/actions/utmb.ts` - UTMB 프로필 관련 서버사이드 로직
