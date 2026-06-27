# KNOWLEDGE — 작업 중 발견한 함정·패턴

> 해결된 함정도 삭제하지 않고 "해결됨" 표시로 남긴다.

## 함정

### (info) route group은 BackHeader를 강제한다
`app/(info)/layout.tsx`는 모든 하위 페이지에 `BackHeader`(`sticky top-0 z-40`)를 렌더한다. 상단 고정(`fixed top-0`) 컴포넌트(예: 가입 진행바 `SignupProgress`)를 쓰는 페이지를 `(info)`에 두면 BackHeader와 위치·z-index가 겹친다. 또 카톡 공유 등 **외부에서 직접 진입하는 랜딩**은 뒤로 갈 history가 없어 BackHeader가 무의미하다.
**해결:** 그런 페이지는 route group 밖(`app/<route>/`)에 두어 RootLayout만 적용받게 한다. route group은 URL에 영향 없으므로 URL은 유지된다. (가입 위저드 `/newbie`를 `app/(info)/newbie` → `app/newbie`로 이동한 사례)

### pre-commit lint-staged가 import 순서를 부분 정렬한다
husky pre-commit의 `lint-staged`가 `eslint --fix`로 `import/order`를 정렬하지만, 커밋 후 working tree에 정렬 잔여 변경이 남는 경우가 있다(프로젝트 전반 188+ 파일이 import/order baseline 위반 상태라 전체 lint 결과는 신뢰도 낮음).
**확인법:** 변경 파일만 `npx eslint <files>`로 검사하고, 커밋 후 `git status`로 잔여 변경을 확인해 별도 `style:` 커밋으로 정리한다.

### pnpm run build는 로컬 env 미설정 시 컴파일 후 실패한다
`.env` 미설정 시 `pnpm run build`가 `✓ Compiled successfully` 직후 t3-env(`lib/env.ts`) 런타임 검증에서 실패한다. 코드/타입 오류가 아니다.
**확인법:** 코드 검증은 `npx tsc --noEmit` 또는 build의 "Compiled successfully" 단계 통과를 기준으로 한다. 라우트 이동 후 tsc가 `.next/types/validator.ts`의 옛 경로를 참조해 에러를 내면 stale 캐시이므로 `rm -rf .next/types .next/dev/types` 후 재확인.

### 제어 input은 모바일 자동완성 값을 놓쳐 RHF가 빈 값으로 본다
`value={field.value}` 제어 컴포넌트는 모바일 브라우저 **자동완성(autofill)이 DOM `.value`만 채우고 React `onChange`를 발화하지 않을 때** RHF 상태가 빈 채로 남는다. 화면엔 값이 보이지만 `required` 검증이 실패한다(증상: 회색으로 번호가 보이는데 그 밑에 "연락처를 입력해 주세요"). 신규 가입자에게만 집중 발생(기존 회원은 해당 화면 미경유). 추가로 iOS 연락처는 국가번호 `+82` 형식으로 채워 `010` 검증을 통과하지 못한다.
**해결 1차(불충분):** 제출 직전 입력 `ref`의 실제 DOM 값을 `form.setValue`로 동기화(버튼 클릭·Enter 양쪽), `autoComplete="tel"`/`name` 부여. 전화번호는 `lib/phone-utils.ts`의 `normalizeKoreanMobileDigits`로 `+82`→`010` 정규화. (PR #336)
**왜 1차가 부족했나:** `value=`로 제어된 입력은 React가 **리렌더 시점에 DOM `.value`를 다시 `field.value`(빈 값)로 되돌린다.** 자동완성 후 리렌더가 한 번이라도 끼면 제출 직전 `ref.value`마저 비어 동기화가 헛돈다.
**해결 2차(근본):** 입력을 `value=` 제어 대신 **`defaultValue=` 비제어**로 둔다. 제어 value가 없으면 React가 자동완성 값을 되돌리지 않아 DOM에 값이 보존된다. 라이브 포맷은 `onChange`에서 `event.target.value`에 직접 쓰고 RHF에 미러링. 1차의 제출 직전 `ref` 동기화는 이중 안전장치로 유지. (PR #336 + 후속, `components/auth/member-onboarding-form.tsx`)

### `pnpm db:types` 전체 재생성은 dev↔prd 스키마 drift로 빌드를 깨뜨린다
`lib/supabase/database.types.ts`를 dev 또는 prd 한쪽 기준으로 전부 재생성하면 타입이 깨진다. **dev에는 `gthr_mst`/`gthr_attd_rel`(모임) 테이블이 있지만 prd엔 없고, 반대로 prd 일부 RPC 함수는 `short_id`를 반환하는데 dev 함수엔 없다.** 현재 커밋된 `database.types.ts`는 양쪽을 수동 병합한 상태라, 통째로 덮으면 어느 쪽으로 생성하든 기존 코드가 컴파일 실패한다.
**해결:** 신규 테이블 추가 시 전체 재생성하지 말고, **해당 테이블 타입 블록만 수동으로 끼워넣는다**(알파벳 순 위치, `Row`/`Insert`/`Update`/`Relationships` 구조는 기존 테이블 복사). `push_sub_rel` 추가가 이 방식. 근본 해결은 dev/prd 스키마 동기화이며 별도 과제(TODO).

### iOS는 `subscription.unsubscribe()` 후 사용자 제스처 없이 재구독을 막는다
로그아웃·재인증 흐름에서 푸시 구독을 `unsubscribe()`하면, iOS Safari/PWA는 그 다음 구독 시 명시적 사용자 제스처를 다시 요구해 재구독이 조용히 실패한다. 또 `Notification.requestPermission()`을 `setTimeout`/`DOMContentLoaded`/자동 실행에서 호출하면 iOS는 **조용히 차단**한다.
**해결:** `unsubscribe()`는 **알림 설정의 명시적 토글 OFF에서만** 호출하고 로그아웃에선 호출하지 않는다(`lib/push/client.ts` 주석으로 명시). 권한 요청은 반드시 클릭 핸들러 안에서. soft prompt(`push-permission-prompt.tsx`)는 "알림 받기" 버튼 클릭 시에만 `requestPermission`을 호출한다.

### web-push는 Node 런타임 전용 + VAPID subject는 mailto:/https: 형식 강제
`web-push`는 Node API에 의존하므로 `sendPush()`를 호출하는 서버 액션/route는 Edge 런타임이면 실패한다. 또 `VAPID_SUBJECT`가 `mailto:` 또는 `https://`로 시작하지 않으면 애플 푸시 서버가 403을 반환한다.
**해결:** `lib/push/send-push.ts`에 `import "server-only"` + `webpush.setVapidDetails`는 모듈 로드 시 1회. `lib/env.ts`에서 `VAPID_SUBJECT`를 `regex(/^(mailto:|https:\/\/)/)`로 검증. VAPID 키는 dev/prd 분리(키 교체 시 기존 구독 전부 무효화되므로 신중).

### SW `getRegistration` 인자는 스코프(디렉토리)지 스크립트 경로가 아니다
`navigator.serviceWorker.getRegistration("/sw.js")`처럼 스크립트 경로를 넘기면 브라우저마다 다르게 동작(Safari는 undefined 반환 가능). 등록 스코프 기준으로 조회해야 한다.
**해결:** 등록은 `register("/sw.js", { scope: "/" })`, 조회는 `getRegistration("/")`로 통일. (`lib/push/client.ts`, `components/service-worker-register.tsx`)

## 재사용 패턴

### 서버 액션이 nullable을 수용하면 폼 필드를 선택/접이식으로 분리
`onboardingCreateMember`는 은행·계좌·이메일을 nullable로 받는다. 가입 마찰을 줄이려면 서버가 선택으로 받는 필드를 "추가 정보(선택)" 접이식으로 내려 필수 입력을 최소화하고, 나머지는 가입 후 별도 페이지(`/profile/bank`)에서 입력하게 한다. 서버 페이로드 구조는 그대로 유지된다.
