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

### getUser → getClaims 전환 시 user_metadata/app_metadata를 user에 포함해야 한다
`getCurrentMember()`를 `getUser()` → `getClaims()`로 바꾸면 반환 user가 claims 기반으로 축소된다. 하지만 `app/(protected)/onboarding/page.tsx`가 `user.user_metadata?.picture`(OAuth 프로필 사진)·`user.app_metadata?.provider`를 쓴다. Supabase access token JWT는 user_metadata·app_metadata를 포함하므로 user를 `{ id: claims.sub, email: claims.email ?? null, user_metadata: claims.user_metadata ?? {}, app_metadata: claims.app_metadata ?? {} }`로 구성하면 호환된다(claims는 인덱스 시그니처라 `as Record<string, unknown>` 캐스팅 필요). 민감 경로(`verifyAdmin`)는 세션 즉시 무효화를 위해 `getUser()` 유지. 권한(admin/status)은 `team_mem_rel` DB 실시간 조회 기반이라 박탈 즉시 반영된다.
**주의:** 호환성 사용처 grep은 반드시 **origin/main(배포 기준)** 작업트리에서 한다 — 로컬 작업 브랜치(예: 다른 feature 브랜치)는 stale이라 사용처를 놓친다. 실제로 이 회귀(onboarding)는 stale 브랜치 grep을 통과했고 `pnpm build`의 TypeScript 단계가 잡았다. (PR #332, 진단 #331)

## 재사용 패턴

### 서버 액션이 nullable을 수용하면 폼 필드를 선택/접이식으로 분리
`onboardingCreateMember`는 은행·계좌·이메일을 nullable로 받는다. 가입 마찰을 줄이려면 서버가 선택으로 받는 필드를 "추가 정보(선택)" 접이식으로 내려 필수 입력을 최소화하고, 나머지는 가입 후 별도 페이지(`/profile/bank`)에서 입력하게 한다. 서버 페이로드 구조는 그대로 유지된다.
