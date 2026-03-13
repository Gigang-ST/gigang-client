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
- `/profile` - 프로필 (개인최고기록, UTMB 인덱스, 페이스 차트, 대회 기록 입력/이력, OAuth 프로필 사진)
- `/settings` - 설정 (프로필 편집, 계좌 정보, 로그아웃)
- `/newbie` - 신규 가입 환영 페이지 (팀 소개, 토글 4개, 채널 안내, 가입 CTA)
- `/join` - 기존 가입안내 페이지
- `/auth/sign-up-success` - 가입 완료 (카카오 오픈채팅 링크/비밀번호 안내)

## 인증 흐름

```
1. 로그인 페이지 → 카카오/구글 OAuth 선택
2. Supabase OAuth → 외부 인증 (redirectTo에 next 파라미터 포함)
3. /auth/callback → code를 session으로 교환
   - next 파라미터가 있으면 해당 경로로 리다이렉트
   - 없으면: 신규 → /onboarding, 기존 → /
4. 온보딩 완료 후 → next 파라미터 경로 또는 / (홈)
5. 비활성(inactive) 회원 로그인 시 → 온보딩에서 재가입 신청 플로우 표시
6. 대기(pending) 회원 로그인 시 → 온보딩에서 승인 대기 메시지 표시
```

### 미들웨어 (proxy.ts)
- `updateSession()`으로 매 요청마다 세션 갱신
- Protected 경로: `/onboarding`, `/profile`, `/profile/*`, `/settings`, `/profile/bank`, `/profile/edit`
- Public 경로: `/`, `/rules`, `/join`, `/newbie`, `/races`, `/records`, `/terms`, `/privacy`, `/policy`, `/settings`, `/auth/*`

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
- `app/actions/revalidate-competitions.ts` - 대회 캐시 무효화 (인증 필수)

## 회원 상태 흐름
```
active → inactive (관리자가 비활성화)
inactive → pending (사용자가 재가입 신청)
pending → active (관리자가 승인)
```

## 프로필 페이지 구성
- `PersonalBestGrid`: 읽기 전용 FULL/HALF/10K 카드 + 클릭 가능한 UTMB 카드 (다이얼로그)
- `PaceChart`: recharts LineChart로 종목별 페이스 추이 표시
- `RaceRecordSection`: 기록 입력/이력 버튼 (RaceRecordDialog, RaceHistoryDialog 호출)
- 개인최고기록과 랭킹은 `race_result` 테이블에서 조회 (`personal_best` 미사용)

## 인앱 브라우저 처리
- `components/in-app-browser-gate.tsx` — 카카오톡/인스타/라인/페이스북 인앱 브라우저 감지
- `/newbie` 페이지에 적용: 인앱 브라우저에서 접속 시 외부 브라우저 유도 화면 표시
- Android: `intent://` URI로 Chrome 자동 오픈
- iOS: Safari 열기 안내 + 링크 복사 폴백
- OAuth 로그인이 인앱 브라우저에서 동작하지 않는 문제 해결용

## 환경 변수 (서버 전용)
- `KAKAO_CHAT_PASSWORD` — 카카오 오픈채팅 비밀번호 (`/auth/sign-up-success`에서 서버 컴포넌트로 읽음, 클라이언트 번들에 노출 안 됨)

## 공유 유틸리티
- `lib/utils.ts` — `cn()`, `secondsToTime()`, `validateUUID()`, `hasEnvVars`
- `lib/constants.ts` — `BANK_OPTIONS` (은행 목록 상수)
- 종목 설정: `components/races/sport-config.ts`의 `resolveSportConfig()` 사용
