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

## 재사용 패턴

### 서버 액션이 nullable을 수용하면 폼 필드를 선택/접이식으로 분리
`onboardingCreateMember`는 은행·계좌·이메일을 nullable로 받는다. 가입 마찰을 줄이려면 서버가 선택으로 받는 필드를 "추가 정보(선택)" 접이식으로 내려 필수 입력을 최소화하고, 나머지는 가입 후 별도 페이지(`/profile/bank`)에서 입력하게 한다. 서버 페이로드 구조는 그대로 유지된다.
