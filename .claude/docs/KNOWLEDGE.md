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

## 재사용 패턴

### 서버 액션이 nullable을 수용하면 폼 필드를 선택/접이식으로 분리
`onboardingCreateMember`는 은행·계좌·이메일을 nullable로 받는다. 가입 마찰을 줄이려면 서버가 선택으로 받는 필드를 "추가 정보(선택)" 접이식으로 내려 필수 입력을 최소화하고, 나머지는 가입 후 별도 페이지(`/profile/bank`)에서 입력하게 한다. 서버 페이로드 구조는 그대로 유지된다.

## 기록 카드 (Record Card)

- **이미지 저장은 `html-to-image`(`toJpeg`)**. SVG foreignObject 기반이라 oklch·CSS 변수·`.card-frame-*` 효과를 그대로 캡처(html2canvas는 oklch에서 깨짐). CSS 애니메이션은 캡처 시점 1프레임으로 고정 — 저장 용도엔 정상.
- **외부 아바타 CORS taint 주의**: 멤버 아바타는 대부분 kakaocdn/googleusercontent(일부 http://)라 canvas를 오염시켜 `toJpeg`가 throw한다. 해결 = 같은 출처 프록시 `app/api/avatar-proxy`(허용 호스트: supabase 프로젝트 호스트 + `.kakaocdn.net`/`.googleusercontent.com`, redirect 수동 거부, 5초 타임아웃, 이미지 전용)로 받아 dataURL로 변환 후 `RecordCard`의 `avatarSrc`로 주입해 캡처한다.
- **JPG 배경색**은 `getComputedStyle(cardRef.current).backgroundColor`(카드 자신의 bg-card)에서 읽는다. `document.body`는 투명일 수 있어 JPEG가 검게 깔린다.
- **멤버 1명 공개 카드 데이터**는 `get_public_member_card(p_mem_id, p_team_id)` jsonb RPC 사용. 이름·아바타·대표칭호·장착 프레임/이펙트·종목별 최고기록만 반환(전화/이메일/회비 등 민감정보 미포함).
- **카드 노출 기록 선택**은 `team_mem_rel.card_featured` jsonb(`selected_frame_cd` 패턴). `null`이면 보유 기록 전부 표시. 저장은 `saveCardFeatured` 서버 액션(admin client + `team_mem_id` 자기 스코프, `update-collection.ts`와 동일 패턴).
