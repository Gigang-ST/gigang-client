# 홈탭(전광판) 속도 개선 방안

> 작성 계기: 2026-08-07 "홈탭 화면 최적화 속도개선 방안 확인" 요청.
> 홈(`/`)은 [`app/(main)/page.tsx`](../../../app/%28main%29/page.tsx)가 `/story` 전광판을 그대로
> 그리므로, 이 문서의 분석은 **`/`와 `/story` 양쪽에 동일하게 적용**된다.
>
> 상태: 📋 **조사·제안 문서 (미적용).** 코드는 한 줄도 바꾸지 않았다. 적용 추적은 §6 체크리스트.

---

## 0. TL;DR

1. **가장 큰 병목은 JS가 아니라 이미지다.** 격자·리드·아바타가 전부 `unoptimized`라
   1080px 원본 사진이 160px 칸에 그대로 내려온다. 전광판은 사진 16장 + 아바타 수십 개가
   한 화면에 있어, 전송량이 초기 JS(gzip 415KB)를 몇 배로 웃돈다.
2. **초기 JS에서 뺄 수 있는 게 명확히 둘 있다.** zod 108KB + react-hook-form 26KB는
   *로그인 사용자가 "올리기"를 눌러야 열리는* 작성 다이얼로그 때문에 실려 있고,
   미니 캘린더 30KB는 *홈에서 렌더되지도 않는* 스케줄 페이지 때문에 실려 있다.
3. **서버 렌더가 3단 직렬이다.** `Promise.all(5종)` → `getStoryReactions` → `HeaderActions`가
   같은 Suspense 경계 안에서 차례로 돈다. 병렬화하면 본문 스트리밍 시작이 왕복 2회만큼 당겨진다.

우선순위: **① 이미지 → ② 작성 다이얼로그 지연 → ③ 서버 워터폴 → ④ 홈의 스케줄 동봉**.
효과 대비 작업량이 이 순서로 좋다.

---

## 1. 측정 방법 (재현용)

```bash
ANALYZE=true pnpm run build
```

- 라우트별 초기 JS는 **프리렌더된 HTML의 `<script src>` 목록**에서 뽑는다
  (`.next/server/app/index.html` = 홈, `.next/server/app/story.html` = `/story`).
  `next build` 요약표의 "First Load JS"는 이 프로젝트에서 라우트별로 출력되지 않아 직접 계산했다.
- 패키지별 비중은 `.next/analyze/client.html`의 `window.chartData`를 파싱해 집계한다.
  ⚠️ **경로에서 패키지명을 뽑을 땐 `node_modules/`의 *마지막* 등장 위치를 봐야 한다.**
  pnpm 경로(`.pnpm/@t3-oss+env-nextjs@0.13.11_zod@4.3.6/...`)는 디렉터리 이름 안에 의존성
  버전이 박혀 있어, 앞에서부터 매칭하면 **zod가 실제의 3배로 잡힌다**(실제로 이 조사에서
  한 번 335KB로 잘못 집계했다 — 정확한 값은 108KB).

측정 시점: `19e9161` (2026-08-07), 프로덕션 빌드(`--webpack`).

---

## 2. 실측 결과

### 초기 JS

| 항목 | 홈 `/` | `/story` |
|------|--------|----------|
| 스크립트 수 | 34개 | 33개 |
| 원본 합계 | 1,318KB | 1,279KB |
| **gzip 합계** | **415KB** | **402KB** |
| parsed 합계 | 1,185KB | 1,147KB |

> polyfills 39KB(gzip)는 `noModule` 속성이 붙어 모던 브라우저는 받지 않는다.
> 실질 전송량은 **약 376KB**로 읽는 게 맞다. `browserslist`가 이미 chrome≥90/safari≥16이라
> 이 파일을 더 줄일 여지는 없다.

### 패키지별 비중 (홈, parsed 기준)

| 크기 | 패키지 | 비고 |
|------|--------|------|
| 409KB | `next` | 프레임워크 런타임 — 줄일 수 없음 |
| 231KB | (앱 코드) | §3.2·§3.4에서 세부 |
| **108KB** | **`zod`** | **작성 다이얼로그 경유 — 제거 가능 (§3.2)** |
| 161KB | `@supabase/*` | auth-js 79 · realtime-js 30 · storage-js 27 · postgrest-js 15 · ssr 10 |
| 33KB | `sonner` | 전역 토스트 |
| 29KB | `vaul` | 바텀시트 |
| **26KB** | **`react-hook-form`** | **zod와 같은 경로로 유입 (§3.2)** |
| 25KB | `tailwind-merge` | |
| 20KB | `buffer` | supabase 폴리필 |
| 17KB | `dayjs` | 청크 5곳에 2.9KB씩 중복 |

### 앱 코드 상위 (홈, parsed 기준)

| 크기 | 모듈 | 비고 |
|------|------|------|
| **29.9KB** | `components/home/mini-calendar.tsx` | **홈에서 렌더 안 됨 (§3.4)** |
| 15.4KB | `components/story/story-lede.tsx` | 리드 슬롯 — 필수 |
| 8.1KB | `components/notifications/notification-bell-icon.tsx` | |
| 7.9KB | `components/story/floating-avatars.tsx` | |
| 6.5KB | `components/comment/comment-section.tsx` | 릴스 뷰어 경유 |
| 6.2KB | `components/story/record-flex-feed.tsx` | |
| 4.9KB | `components/story/record-reel-viewer.tsx` | 탭해야 열림 (§3.2) |

### 그 외 자산

| 항목 | 수치 |
|------|------|
| 본문 폰트 | `PretendardVariable.woff2` **단일 2.06MB** |
| 격자 사진 | 1080×1920 JPEG q90 원본 × 최대 16장(`STORY_POST_LIMIT`)을 **약 160px 칸**에 렌더 |
| 아바타 | 원본 그대로(`unoptimized`) — 한 화면에 수십 개 |

---

## 3. 병목별 분석과 개선안

### 3.1 [P1] 이미지가 최적화 없이 원본으로 내려온다

**현상.** 사진을 그리는 세 곳이 전부 `unoptimized`다.

| 위치 | 파일 | 렌더 크기 |
|------|------|-----------|
| 깅스타그램 격자 | [`record-flex-feed.tsx:499`](../../../components/story/record-flex-feed.tsx#L499) | 약 160px 정사각 × 최대 16 |
| 리드 사진 슬롯 | [`story-lede.tsx:1178`](../../../components/story/story-lede.tsx#L1178) | 158px |
| 아바타 전역 | [`avatar.tsx:121`](../../../components/common/avatar.tsx#L121) | 24~96px |
| 릴스 뷰어 | [`record-reel-viewer.tsx:410,422`](../../../components/story/record-reel-viewer.tsx#L410) | 풀스크린 (여기만 원본이 타당) |

업로드 파이프라인([`post-photo-compress.ts`](../../../lib/image/post-photo-compress.ts))은 1080×1920
JPEG q90으로 줄여 저장한다 — **릴스 뷰어 기준으로는 적정한 규격**이다. 문제는 그 원본이
**격자 160px 칸에도 그대로** 쓰인다는 점이다. 면적 기준으로 약 45배 과잉이다.

**선택지.**

| 안 | 방법 | 장점 | 단점 |
|----|------|------|------|
| ① Next 이미지 최적화 | `next.config`에 `images.remotePatterns` 추가 + `unoptimized` 제거 | 코드 변경 최소 | Vercel 이미지 변환 **과금** |
| ② Supabase 이미지 변환 | Storage render/image `?width=` 파라미터 | 서버 부담 없음 | **Pro 플랜 기능** |
| ③ 업로드 시 썸네일 파생 | 저장 때 320px 파생본을 함께 생성 | 과금 없음, 수정 지점 1곳 | 기존 사진 백필 필요 |

**추천은 ③.** [`lib/storage/post-photo.ts`](../../../lib/storage/post-photo.ts)가 이미 두 작성
경로(깅스타그램·마일리지런)의 **공유 지점**이라, 여기서 원본과 썸네일을 함께 올리면 두 경로가
자동으로 따라온다. 격자·리드·아바타는 썸네일을, 릴스 뷰어만 원본을 쓴다.

- 기존 사진은 썸네일이 없으므로 **URL이 없으면 원본으로 폴백**해야 한다 — 백필 전에도 화면이
  깨지지 않게. 폴백을 두면 백필은 급하지 않은 별도 작업이 된다.
- DiceBear 폴백 아바타는 SVG라 지금대로 둔다(최적화 대상이 아니다).
- ⚠️ **`unoptimized`를 걷어낼 때 `?? ""` 유혹을 조심할 것.** 빈 `src`는 브라우저가 현재 페이지
  URL을 이미지로 재요청하게 만든다 — 이미 [`story-lede.tsx`](../../../components/story/story-lede.tsx#L1172)
  주석이 같은 함정을 기록해 두었다.

### 3.2 [P2] 안 여는 다이얼로그 때문에 zod + RHF가 초기 번들에 있다

**경로가 확정됐다.**

```
story-client.tsx (홈 진입)
  └ record-flex-feed.tsx           ← 항상 렌더
      └ record-flex-create-dialog.tsx   ← 정적 import (line 23)
          ├ @hookform/resolvers/zod
          ├ react-hook-form                26KB
          └ @/lib/validations/post → zod  108KB
```

즉 **로그인 사용자가 "올리기"를 눌러야 열리는 폼** 때문에 134KB(parsed)가 모든 방문자
— 비로그인 포함 — 의 초기 번들에 들어간다. `record-flex-edit-dialog.tsx`도 같은 줄에서
정적으로 물려 있다.

**개선.** [`member-card-dialog-dynamic.tsx`](../../../components/members/member-card-dialog-dynamic.tsx)가
이미 이 프로젝트의 정답 패턴을 세워 뒀다 — `dynamic()`을 **호출부가 아니라 전용 래퍼 파일 한 곳**에
두어 `ssr`·`loading` 설정이 갈라지지 않게 한다. 같은 방식으로 래퍼를 만들어 교체한다.

지연 대상 후보(모두 "눌러야 열리는" 것):

- `RecordFlexCreateDialog` / `RecordFlexEditDialog` — zod·RHF 유입 지점
- `RecordReelViewer` — 4.9KB + `comment-section` 6.5KB + 댓글 시트 동반
- `ActvHistorySheet` — 활동 내역

⚠️ 다만 **`MemberCardDialog`와 성격이 다르다.** 저건 닫혀 있을 때 아무것도 안 그려 폴백이
`null`이어도 결과가 같았지만, 작성 다이얼로그는 **사용자가 버튼을 누른 직후**라 청크가 늦으면
무반응이 체감된다. 여기는 `loading` 폴백(스켈레톤 또는 스피너)을 두거나, 버튼에 hover/focus가
닿을 때 프리페치하는 편이 낫다.

**부수 효과.** `message-compose` / `pledge-create-dialog`는 `MESSAGE_TXT_MAX` 같은 **상수 하나만**
`lib/validations/*`에서 가져오는데, 그 파일이 zod를 물고 있어 상수 하나에 스키마 전체가 딸려 온다.
상수를 zod 없는 파일로 분리하면 이 경로도 끊긴다.

### 3.3 [P2] 서버 렌더가 3단 직렬이다

[`app/(main)/story/page.tsx`](../../../app/%28main%29/story/page.tsx)의 현재 흐름:

```
① Promise.all([feed, overview, ghosts, posts, currentMember])   ← 병렬 (좋음)
      ↓ 직렬
② await getStoryReactions(teamId, member?.id)                    ← ①의 member에 의존
      ↓ 직렬
③ <HeaderActions /> — 알림 개수 + 알림 20건 조회                  ← return 안에서 비로소 시작
```

②는 `member.id`가 필요해 ①을 기다리고, ③은 JSX가 만들어지는 시점이 ②보다 뒤라 또 기다린다.
**셋 다 같은 Suspense 경계(`fallback={<StorySkeleton />}`) 안**이라, 본문은 알림 조회까지
끝나야 그려진다.

게다가 [`getStoryReactions`](../../../lib/queries/story-feed.ts#L274) 내부도 직렬이다 —
`await getReactionTotals()` 다음에 내 몫을 조회한다. 서로 의존하지 않는데 순서대로 돈다.

**개선 3가지.**

1. **reactions를 `Promise.all`에 편입** — `getCurrentMember()` promise에 `.then()`을 걸어
   member가 오는 즉시 reactions가 출발하게 한다. 다른 4종과 겹쳐 돈다.
2. **totals / mine 병렬화** — `getStoryReactions` 안에서 `Promise.all`.
   비로그인은 지금처럼 totals만 조회(분기 유지).
3. **`HeaderActions`를 자체 `<Suspense>`로 감싸** 넘긴다. 제호는 알림을 기다리지 않고 뜨고,
   벨만 늦게 채워진다. 벨은 화면 우상단 작은 아이콘이라 늦게 도착해도 레이아웃이 안 흔들린다.

세 개를 합치면 스트리밍 본문 도착이 **DB 왕복 2회분** 당겨진다.

### 3.4 [P3] 홈이 안 쓰는 스케줄 페이지를 동봉한다

[`app/(main)/page.tsx`](../../../app/%28main%29/page.tsx)는 홈 교체를 상수 한 줄로 하기 위해
두 페이지를 **모두 정적 import**한다.

```ts
import SchedulePage from "./schedule/page";
import StoryPage from "./story/page";
const HOME_PAGE: "story" | "schedule" = "story";
export default HOME_PAGE === "story" ? StoryPage : SchedulePage;
```

삼항 연산자는 런타임 값이라 번들러가 가지치기를 못 한다. 결과적으로 **홈에만 있고 `/story`엔
없는 청크**(`586-*.js`, gzip 12KB)가 생기고, 그 안에 `mini-calendar.tsx` **29.9KB** —
홈 초기 번들에서 가장 큰 단일 앱 모듈 — 가 들어 있다. 렌더는 되지 않는다.

**개선.** "한 줄만 바꾸면 홈이 교체된다"는 설계 의도는 지키면서 안 쓰는 쪽을 번들에서 빼려면,
`HOME_PAGE`를 **빌드타임에 접히는 형태**로 만들어야 한다. 재-export 분기나 별도 진입 파일로
가르는 방식이 있다. **의도와 롤백 편의(§파일 주석)를 깨지 않는 선에서** 고르는 게 조건이다.

### 3.5 [P3] supabase-js 161KB가 전 페이지 초기 번들에 있다

루트 [`providers.tsx`](../../../components/providers.tsx)의 `AuthRefresher`가 모듈 최상단에서
`createClient`를 import하므로, supabase-js 전체(auth 79 + realtime 30 + storage 27 +
postgrest 15 + ssr 10)가 **모든 라우트**의 초기 번들에 들어간다.

실제 사용은 `useEffect` 안(`onAuthStateChange` 구독)뿐이라, effect 안에서
`await import("@/lib/supabase/client")`로 바꾸면 별도 청크로 밀린다. 동작은 동일하다 —
하이드레이션 직후에 받아 구독하면 되는 일이다. `FloatingAvatars`(Realtime presence)도
같은 처리가 가능하다.

⚠️ storage-js·postgrest-js까지 함께 실리는 건 supabase-js가 **단일 진입점에서 전부
re-export**하기 때문이다. 지연 로딩이 아니라 트리셰이킹으로 줄이려면 서브패키지를 직접
import해야 하는데, 그건 클라이언트 코드 전반을 건드려야 해서 **비례성이 맞지 않는다**.

### 3.6 [P3] 본문 폰트가 단일 2.06MB다

`PretendardVariable.woff2` 하나가 2.06MB다. `display: "swap"`이라 렌더를 막지는 않지만,
첫 방문에서 이미지·JS와 대역폭을 경쟁하고 폰트 교체 시 리플로우가 한 번 일어난다.

- **Pretendard 다이나믹 서브셋**(글리프 단위 분할, `unicode-range`로 필요한 조각만 로드) —
  통상 총합 200~400KB. 권장.
- 또는 KS 완성형 서브셋 단일 파일.

첫 방문 전송량이 1.5MB 이상 줄어드는 항목이라 수치상 효과는 크지만, **`swap`이라 체감
지연에는 직접 기여하지 않는다** — ①②③보다 뒤에 두는 이유다.

### 3.7 [P4] 잠정 중단한 존의 코드가 번들에 남아 있다

[`story-client.tsx`](../../../components/story/story-client.tsx)의 `SHOW_MESSAGE_PLANES` /
`SHOW_PLEDGE_SIGNS`는 `false`지만 `import`는 파일 상단에 정적으로 남아 있다. 파일 주석은
"false일 땐 존 컴포넌트가 렌더 트리에서 통째로 빠진다"고 적고 있는데, **그건 런타임 얘기이고
JS는 그대로 전송된다.**

실측 합계 **8.3KB**(message-planes 2.5 + throw-stage 1.8 + message-compose 1.4 +
pledge-create-dialog 1.2 + pledge-signs 1.1 + sky-face 0.4).

크지 않아 **단독으로는 손댈 값이 아니다.** 다만 §3.2에서 다이얼로그를 `dynamic()`으로
옮기는 김에 같이 정리하면 자연히 빠진다. 주석의 "성능" 문장은 오해 소지가 있으므로
이 기회에 바로잡는 게 좋다.

---

## 4. 이미 잘 돼 있는 것 (건드리지 말 것)

조사 중 확인한, **손대면 오히려 나빠지는** 것들이다.

| 항목 | 근거 |
|------|------|
| PPR (`cacheComponents: true`) | 정적 셸이 즉시 응답하고 본문만 스트리밍된다 |
| `getClaims()` 사용 | Auth 서버 왕복 0회 — 모든 dynamic 페이지 TTFB에서 1왕복 제거 ([`member.ts`](../../../lib/queries/member.ts#L24)) |
| 캐시 태그 분리 | `story-posts` / `story-feed` / `story-reactions`가 각자 주기를 갖는다 |
| 응원 총합 30초 캐시 + `revalidateTag` 미호출 | 연타로 캐시가 날아가지 않게 시간 만료에 맡긴다 |
| `MemberCardDialog` · 차트류 `dynamic()` | 이미 크리티컬 패스 밖 |
| `FloatingAvatars`의 rAF 관리 | `IntersectionObserver`로 화면 밖이면 정지, `visibilitychange`로 탭 복귀 시 dt 리셋, `prefers-reduced-motion` 대응 |
| `getGhostMembers` 비캐시 | 실측 2.5ms 경량 조회 + 시드 랜덤이라 캐시가 오히려 해가 된다 |
| GA `strategy="lazyOnload"` | 초기 로드에 영향 없음 |

---

## 5. 우선순위 요약

| # | 항목 | 예상 효과 | 작업량 | 리스크 |
|---|------|-----------|--------|--------|
| ① | 이미지 썸네일 (§3.1) | **최대** — 전송량 수 MB↓ | 중 (백필 별도) | 중 — 폴백 필수 |
| ② | 작성 다이얼로그 지연 (§3.2) | 초기 JS −134KB parsed | 소 | 소 — 폴백 설계 필요 |
| ③ | 서버 워터폴 (§3.3) | TTFB/스트리밍 −DB왕복 2회 | 소 | 소 |
| ④ | 홈의 스케줄 동봉 (§3.4) | 초기 JS −30KB parsed | 소 | 소 — 홈 교체 편의 유지 조건 |
| ⑤ | supabase-js 지연 (§3.5) | 초기 JS −161KB parsed (전 페이지) | 소 | 중 — 인증 갱신 타이밍 확인 |
| ⑥ | 폰트 서브셋 (§3.6) | 첫 방문 −1.5MB | 중 | 소 |
| ⑦ | 중단 존 정리 (§3.7) | −8.3KB | 소 | 없음 |

---

## 6. 적용 체크리스트

- [ ] §3.1 이미지 — 썸네일 파생 + 격자/리드/아바타 전환 (릴스는 원본 유지, 없으면 원본 폴백)
- [ ] §3.2 `RecordFlexCreate/EditDialog` `dynamic()` 래퍼 + `loading` 폴백
- [ ] §3.2 `lib/validations/*`에서 상수만 zod 없는 파일로 분리
- [ ] §3.3 reactions를 `Promise.all` 편입 / totals·mine 병렬 / `HeaderActions` Suspense 분리
- [ ] §3.4 `page.tsx` 분기를 빌드타임에 접히는 형태로
- [ ] §3.5 `AuthRefresher`의 supabase 클라이언트 동적 import
- [ ] §3.6 Pretendard 다이나믹 서브셋
- [ ] §3.7 중단 존 정리 + `story-client.tsx` 주석의 "성능" 문장 수정
- [ ] 적용 후 재측정 → Lighthouse v4로 기록 ([`lighthouse/`](lighthouse/README.md))

---

## 7. 이 조사에서 얻은 함정

1. **번들 분석 시 pnpm 경로에서 패키지명을 앞에서부터 뽑으면 안 된다.**
   `.pnpm/<pkg>@<ver>_<dep>@<ver>/node_modules/<real-pkg>/...` 구조라 디렉터리 이름에 의존성
   버전이 섞여 있다. **`node_modules/`의 마지막 등장 뒤**를 봐야 실제 패키지다.
   이 조사에서 zod를 335KB로 잘못 집계했다(실제 108KB).
2. **"렌더 안 되면 비용 0"은 런타임에만 참이다.** 플래그로 렌더를 끄는 것과 번들에서 빼는 것은
   다르다(§3.7). 삼항 연산자로 페이지를 고르는 것도 마찬가지다(§3.4) — 번들러는 런타임 값을
   가지치기하지 못한다.
3. **`grep`으로 import를 추적할 때 주석 매치를 걸러야 한다.** 이 조사 초기에
   `service-worker-register.tsx`가 `lib/push/client.ts`를 import하는 것으로 잘못 판단했는데,
   실제로는 **주석 안에 파일 경로가 적혀 있었을 뿐**이었다. import 문 형태(`from "..."`)로
   패턴을 좁혀야 한다.
