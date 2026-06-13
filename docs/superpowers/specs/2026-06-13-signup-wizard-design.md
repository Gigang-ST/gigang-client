# 가입 위저드 개편 설계

**날짜:** 2026-06-13
**대상:** 신입회원 가입 흐름 (`/newbie` → `/auth/login` → `/onboarding`)
**목표:** "누구나 따라오면 가입되는" 쉬운 흐름. 인앱 브라우저 가입 좌절 원천 차단, 가입 직후 홈 화면 설치까지 한 흐름으로 연결.

---

## 1. 배경 / 문제

현재 `/newbie`는 카카오톡 등으로 공유되는 가입 랜딩이지만:

1. **정보 과잉** — 회칙·안전수칙·등급표·러닝팁·심박수 등 가입과 무관한 정보가 화면을 가득 채워 압도적.
2. **"따라하면 가입" 흐름 부재** — 몇 단계인지, 무엇을 준비할지 안내 없이 맨 아래 버튼 하나.
3. **디자인 시스템 전면 위반** — `text-[13px]` 매직넘버, 하드코딩 색(`bg-blue-50` 등), 직접 `border` div. DESIGN.md의 타이포 컴포넌트·색상 토큰·`CardItem` 미사용.
4. **다음 단계와 톤 단절** — `/auth/login`·`/onboarding`과 진행감·디자인이 따로 놂.
5. **인앱 브라우저 좌절** — 카카오톡·소모임 인앱 브라우저에서 OAuth가 막혀 가입을 시도하다 실패. (`InAppBrowserGate`가 `/newbie`에만 적용되어 login/onboarding은 무방비)
6. **온보딩 폼 부담** — 신규 가입 시 이름·성별·생일·연락처·은행·계좌 8개 필드를 한 화면에. 단, **서버 액션 `onboardingCreateMember`는 은행·계좌·이메일을 이미 `nullable`로 받음** → 계좌는 가입 필수가 아님에도 필수처럼 보임.

---

## 2. 핵심 컨셉

세 페이지를 **하나의 3단계 위저드**처럼 보이게 한다. 같은 진행바를 공유해 "지금 어디쯤, 얼마 남았는지"가 항상 보이도록 → 이탈 방지.

```
STEP 1 시작        STEP 2 로그인       STEP 3 정보입력      ✓ 완료
/newbie       →    /auth/login    →   /onboarding     →   🎉 + 설치
●━━━○━━━○          ●━━━●━━━○          ●━━━●━━━●
```

### 전역 환경 분기 (최우선 로직)

```
┌─ 이미 설치됨 (display-mode: standalone) ─→ 정상 사용, 팝업 없음
│
├─ 인앱 브라우저 (카톡/소모임/인스타…) ───→ 가입 UI 차단, "크롬·사파리로 열기"만
│
└─ 일반 모바일 브라우저 ─────────────────→ 가입 진행 + "홈 화면에 추가" 유도
```

우선순위: **설치됨 > 인앱 차단 > 설치 유도**. 인앱이면 설치 유도 대신 외부 브라우저 안내가 항상 우선.

---

## 3. 구성 요소

### 3.1 공유 진행바 — `components/auth/signup-progress.tsx` (신규)

- Props: `step: 1 | 2 | 3`, `done?: boolean`
- 3칸 바 + `<Caption>` "N단계 중 M" 텍스트. 색상 토큰만 사용(`bg-primary`, `bg-muted`).
- 단일 책임. 세 페이지가 동일하게 import.
- **의존성:** 없음 (순수 프레젠테이션). 독립 테스트 가능.

### 3.2 `/newbie` — 위저드 인트로 전면 재작성

`app/(info)/newbie/page.tsx` 재작성. 가입에만 집중하는 첫 화면:

- 진행바 (step=1)
- 히어로: `<H1>` "기강에 잘 오셨어요 👟" + `<Body>` "3단계, 1분이면 가입 끝나요"
- **할 일 미리보기**: ① 카카오로 로그인 ② 연락처 확인 ③ 기본 정보 입력 (`CardItem`, 각 한 줄 + 체크/번호 아이콘, `<Body>`/`<Caption>`)
- **준비물 안내**: 📱 연락처 (계좌는 가입 후 입력이므로 "준비물"에서 강조하지 않음) — "연락처만 있으면 돼요" 톤
- **"더 알아보기" 접이식** (맨 아래, 작게): 기존 회칙·안전수칙·등급표·러닝팁·심박수·러닝화를 **버리지 않고** 여기 한곳으로 이동. `<details>` 또는 shadcn accordion. 디자인 토큰 적용. 궁금한 사람만 펼침.
- 하단 고정 CTA: `<Button>` "시작하기 →" → `/auth/login?next=/onboarding`
- `InAppBrowserGate` 유지
- **디자인 시스템 전면 적용**: 매직넘버·하드코딩 색 제거.

### 3.3 `/auth/login` — 진행바(step=2)만 추가

- `app/auth/login/page.tsx` 또는 `LoginForm` 상단에 `SignupProgress step={2}` 얹기.
- **OAuth 로직·버튼·`next` 처리 불변.**
- `InAppBrowserGate`로 래핑 (아래 4.1).

### 3.4 `/onboarding` — 진행바(step=3) 추가 + 폼 간소화

`components/auth/member-onboarding-form.tsx`:

- 상단에 `SignupProgress step={3}` (success 단계에선 `done`).
- **가입 필수 = 이름·성별·생일** (연락처는 phone 단계에서 이미 입력).
- **은행·계좌 = 선택, "건너뛰기" 가능.** "나중에 프로필에서 입력할게요" 버튼 → 빈 값으로 `onboardingCreateMember` 호출(서버는 이미 nullable 수용). 가입 완료.
- **OAuth 이름 자동 채움**: `user.user_metadata`의 name/full_name을 `initialFullName`으로 폼에 prefill (수정 가능). 한글 검증 통과 시에만 채우고, 영문 등 검증 실패값은 비움.
- 완료 화면: 기존 컨페티 + 오픈채팅 비번 유지 + **"홈 화면에 추가" CTA**(아래 4.2) + "계좌는 나중에 등록" 링크 → `/profile/bank`.
- **서버 액션·검증 스키마·OAuth 로직 불변.** 폼 UI/단계 흐름만 변경.

### 3.5 온보딩 page에서 이름 prefill 전달

`app/(protected)/onboarding/page.tsx`: 이미 추출하는 `initialAvatarUrl`처럼 `user.user_metadata`에서 이름 후보를 추출해 `initialFullName` prop으로 전달.

---

## 4. 인앱 차단 + PWA 설치

### 4.1 인앱 브라우저 = 가입 원천 차단

- `InAppBrowserGate`를 가입 흐름 **전체**(`/newbie`·`/auth/login`·`/onboarding`)에 적용.
  - `/newbie`: 이미 적용됨(유지).
  - `/auth/login`·`/onboarding`: 페이지 또는 공통 래핑 지점에 추가.
- 인앱이면 가입 버튼·폼을 **렌더조차 안 함**. "외부 브라우저로 열기"만 노출(현재 동작).
- `detectInAppBrowser` UA 패턴 보강: 소모임 등 알려진 패턴 추가(잡히면 명시, 못 잡아도 기존 `wv` 폴백으로 커버).
- 카피 개선: "카카오톡에선 가입할 수 없어요. 크롬으로 열면 1분이면 끝나요" 톤.

### 4.2 일반 브라우저 = 홈 화면 설치 유도 (PWA)

신규 컴포넌트 `components/pwa-install-prompt.tsx` (client):

- **표시 조건:** `display-mode: standalone` 아님 + 인앱 브라우저 아님.
- **Android/Chrome:** `beforeinstallprompt` 이벤트 캡처 → "홈 화면에 추가" 버튼 클릭 시 `prompt()` 호출.
- **iOS/Safari:** 이벤트 미지원 → "공유 버튼 → '홈 화면에 추가'" 그림/단계 안내 모달.
- **노출 위치 두 곳:**
  1. **가입 완료 화면** — "마지막! 홈 화면에 추가하면 앱처럼 써요" 강조 CTA (가입→설치 한 흐름 완성).
  2. **전역 하단 배너** — 일반 브라우저로 **어느 페이지든**(홈·대회·프로젝트·랭킹·프로필) 접속 시 상시. 닫으면 7일간 미표시(`localStorage` 키).
- **배치:** 전역 배너는 앱 공통 레이아웃(루트 또는 `(main)` 레이아웃)에 마운트.
- **iOS 메타 보강:** 필요 시 `apple-touch-icon`, `apple-mobile-web-app-capable` 등 `app/layout.tsx` metadata 보강. manifest 자체는 변경 불필요.

---

## 5. 안 건드리는 것 (스코프 보호)

- `onboardingCheckPhone` / `onboardingLinkExistingMember` / `onboardingCreateMember` 서버 액션 로직.
- `lib/validations/member.ts` 검증 스키마 (이름 한글 2~5자 등).
- OAuth 흐름(`signInWithOAuth`, `next`/`oauth_next` 쿠키 처리).
- `app/manifest.ts`.
- `/profile/bank`, `bank-info-form` (이미 존재 — 계좌 '나중에' 입력 경로로 재사용만).
- 온보딩 폼의 **검증 규칙과 제출 페이로드 구조** (필드 표시/단계 흐름만 변경, 서버로 보내는 값 모양은 동일).

---

## 6. 데이터 흐름

```
[카톡 링크] → /newbie
   │
   ├─ 인앱 브라우저? ──예──→ InAppBrowserGate: "크롬으로 열기" (가입 차단)
   │                          (사용자가 크롬으로 다시 열면 ↓)
   └─ 일반 브라우저 → 진행바 1/3, 시작하기
        → /auth/login (2/3) → 카카오/구글 OAuth
        → /auth/callback → /onboarding (3/3)
             → phone 확인 (onboardingCheckPhone)
                ├─ 기존 active → link → 홈
                ├─ pending → 안내
                └─ new → 이름·성별·생일 입력
                     → [저장] 또는 [계좌 건너뛰기]
                     → onboardingCreateMember (계좌 빈 값 허용)
                     → 완료 🎉 + "홈 화면에 추가" CTA + "계좌 나중에" 링크
   ※ standalone 아닌 일반 브라우저는 모든 페이지 하단에 설치 배너 상시(7일 dismiss)
```

---

## 7. 테스트 관점

- **진행바:** step prop별 렌더(1/3, 2/3, 3/3, done) 시각 확인.
- **인앱 차단:** UA 모킹(kakao/somoim/wv)으로 가입 UI 미렌더 확인. 일반 UA는 정상 렌더.
- **PWA 배너:** standalone 모드에선 미표시, 일반 브라우저에선 표시, 닫으면 7일 미표시(localStorage).
- **폼 간소화:** "건너뛰기"로 계좌 없이 가입 완료되는지(서버 nullable 경로). OAuth 이름 prefill이 한글일 때만 채워지는지.
- **회귀:** 기존 회원 매칭(active/pending), OAuth `next` 리다이렉트, 컨페티·오픈채팅 비번 노출 불변.

---

## 8. 디자인 시스템 준수 체크리스트 (DESIGN.md)

- [ ] 텍스트: `H1`/`H2`/`Body`/`Caption`/`Micro`/`SectionLabel` 사용, 매직넘버 0
- [ ] 색상: CSS 변수 토큰만 (`bg-primary`, `text-muted-foreground` 등). 하드코딩 hex/rgb 0 (단 카카오 `#FEE500` 등 브랜드색은 예외)
- [ ] 카드: `CardItem` 사용, 커스텀 border 0
- [ ] 빈/접이식: 기존 패턴 재사용
- [ ] 컴포넌트 위치: 공통 → `common/`, 인증 도메인 → `auth/`
