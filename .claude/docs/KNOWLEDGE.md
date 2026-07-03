# KNOWLEDGE — 작업 중 발견한 함정·패턴

> 해결된 함정도 삭제하지 않고 "해결됨" 표시로 남긴다.

## 알림 발송 규칙 (중요)

**모든 알림은 `lib/notifications/insert-noti.ts`의 관문 함수로만 발송한다. `noti_mst`에 직접 INSERT 금지.**
관문이 인앱(noti_mst) + 푸시(push_sub_rel)를 항상 한 몸으로 처리하고, 수신거부(noti_pref_cfg) 필터도 일괄 담당한다.

- `insertNoti(input)` — 멤버 1명
- `insertNotiMany({ memIds, ... })` — 여러 멤버 (구독 IN 조회 1회 + 배치 푸시). `prefTypeEnm`으로 수신거부 판단 타입을 분리 지정 가능(예: gthr_del을 gthr_upd 설정으로 묶을 때)
- `insertNotiForTeam({ ... })` — 팀 전체 (RPC `create_noti_for_team` + batch_id로 조회해 배치 푸시)

**새 알림 종류 추가 시 체크리스트:**
1. 발송: 위 관문 함수 중 하나 호출 (인앱+푸시 자동)
2. 딥링크: `lib/notifications/deep-link.ts`의 `NOTI_ROUTE`에 `타입: (refId, refType) => "/경로"` 한 줄 추가 — **이 한 곳이 인앱·푸시 클릭 양쪽에 동시 적용**. 누락 시 클릭하면 홈(`/`)으로만 감
3. 설정 토글에 노출할 거면 `notification-bell-icon.tsx`의 `NOTI_TYPE_LABELS`에 추가 (필수 알림이면 넣지 않음 → row 없으면 항상 발송)

> 과거엔 발송처마다 noti_mst에 직접 INSERT + pref 필터를 중복 구현해서, 푸시가 일부(칭호·건의답변)에만 붙어 있었다. 2026-06-27 전 발송처를 관문으로 통일. 댓글 알림의 "30분 내 묶음(update로 N개 카운트)"은 이때 제거하고 개별 누적으로 전환(제목=맥락, 내용=`작성자: 댓글`).

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

### PostgREST `.upsert({ onConflict })` 는 부분(partial) 유니크 인덱스를 타겟 못 한다
Supabase JS `.upsert({ onConflict: "a,b,c" })` 는 `ON CONFLICT (a,b,c)` 만 보내고 인덱스의 `WHERE` predicate 는 못 보낸다. 그래서 `CREATE UNIQUE INDEX ... WHERE 조건` 같은 **부분 유니크 인덱스**를 멱등 키로 쓰면 "no unique or exclusion constraint matching ON CONFLICT" 로 실패한다. (출석 회비 감면 배치 `batch-dues-exemption.ts`의 `uk_fee_exm_hist_quest`=`WHERE grant_src_enm='rule_attd_quest' AND del_yn=false` 가 이 케이스.)
**해결:** upsert 대신 **존재 확인 SELECT → 없으면 INSERT** 패턴(재계산 규칙 면제 INSERT 루프와 동일). 부분 유니크 인덱스는 동시성 경합 시 최종 방어선으로 그대로 둔다. 원시 SQL `ON CONFLICT (cols) WHERE predicate` 는 predicate 를 줄 수 있어 동작하지만, PostgREST 경로에선 안 된다.

### 회비 재계산 면제 합산 기준은 `aply_ym`(귀속월)이 아니라 `rflt_yn`(반영여부)
재계산이 면제를 `aply_ym >= 마지막계산월` 로 합산하면 "기준월보다 과거에 뒤늦게 꽂힌 면제"(배치를 늦게 돌린 경우)를 영영 누락한다. **합산 기준을 `rflt_yn=false`("아직 잔액에 안 들어간 것")로 바꾸면** 귀속월 무관하게 미반영 면제를 한 번 합산 후 `true` 마킹 → 배치를 2달 늦게 돌려도 다음 재계산이 잡고, 같은 달 두 번 재계산해도 이중 합산이 없다.
**불변식:** `baseBal`에 녹은 면제 = `rflt_yn=true`. 재계산은 `rflt_yn=false`만 더한다. 컬럼 추가 시 기존 면제는 `true` 백필하되, **백필 전 전체 재계산을 한 번 돌려** "생성됐지만 미반영" 면제가 잘못 `true`로 칠해지지 않게 한다(§6.1.1). _(2026-07 리플레이 전환 후 baseBal = 앵커잔액 + rflt_yn=true 면제합 — 아래 앵커+리플레이 절 참고. RPC 계약은 동일.)_
**원자성:** Supabase JS는 여러 쿼리를 한 트랜잭션으로 못 묶으므로, 면제 합산→잔액계산→vers 밀기→스냅샷 INSERT→면제 마킹을 **DB 함수 `recalc_member_balance`로 원자화**(설계 `docs/design/2026-06-28-출석-회비-감면-퀘스트.md` §6).

### 회비 잔액 재계산은 증분(커서)이 아니라 "앵커+전체 리플레이"다 (2026-07 전환)
직전 스냅샷 기점의 증분 방식은 `last_calc_at` 커서 이전 시점의 **늦은 확정·확정취소를 영영 반영 못 하는 구멍**이 있었다(취소 후 재확정된 과거 거래가 커서에 걸려 누락 등 — QS-4 계열). 전환 후(`app/actions/dues/recalculate-balance.ts` + `lib/dues/ledger-replay.ts`):
- **bal = 앵커잔액 + Σ납부(paid, 앵커 커서 이후) + Σ면제 − Σ부과(앵커 다음달~당월)** — 몇 번을 돌려도 원천 데이터와 일치(멱등). 확정취소는 pay `cancelled` 마킹 + 재계산 한 번이면 끝.
- **앵커 = `LEDGER_EPOCH` 이전 crt_at 의 가장 오래된 스냅샷.** 컷오버 시딩(2026-06-04)으로 **pay_hist 없이 잔액만 있는 회원이 다수**라(dev에서 88,000원/납부 0건 확인) 순수 from-scratch 는 개시잔액을 날린다 → 앵커 필수. EPOCH 이후 스냅샷은 파생 캐시일 뿐 절대 앵커가 되면 안 된다(앵커로 삼는 순간 커서 구멍이 재발).
- **`fee_mem_bal_snap.vers` 는 시간순**: 1=최고령(시드), 커질수록 최신, 0=현재.
- **부과 시작 = 앵커 `last_calc_dt` 다음 달**(시드 06-04 → 7월부터; 6월분은 시드에 녹은 것으로 간주 — 기존 증분 동작과 동일). 앵커 없으면 가입월부터.
- **커서(p_last_calc_at)를 납부 0건이라고 now 로 두면 안 된다** — 업로드 컷오프(매칭 거래가 커서 이전이면 skip)에 걸려 그 회원의 과거 입금이 조용히 소실된다(QS-9). 납부 없으면 앵커 커서, 그마저 없으면 가입월 초.
- **리플레이는 과거 증분 시대에 눌어붙은 오차를 자가 치유한다**: dev 전수 대조(161명)에서 137명 정확 일치, 23명은 기대 차이(비활성 회원 당월 미부과), 1명은 06-06 옛 JS 재계산이 근거 이력 없이 +2,000 가산한 것이 교정 대상으로 확인. **배포 직후 전체 재계산 후 원장 diff 를 한 번 훑을 것.**

### 딥링크로 다이얼로그를 열 때 URL 정리는 setOpen 전에 네이티브 replaceState로
알림 딥링크(`/?post=`·`/?comp=`·`/?gthr=`)로 상세 다이얼로그를 열고 `router.replace("/")`로 쿼리를 지우는 순서(setOpen → router.replace)는 **무한 재오픈 루프**를 만든다. `router.replace`는 transition이라 실제 히스토리 교체가 다이얼로그의 `useDialogHistoryBack` pushState보다 **늦게** 일어나, 히스토리가 `[이전, "/?gthr=id", "/"]`로 남는다. 뒤로가기(popstate)든 스와이프 닫기(cleanup의 `history.back()`)든 `/?gthr=id` 항목으로 복귀 → `useSearchParams` 동기화 → 딥링크 이펙트 재발동 → 상세 재오픈 반복.
**해결:** 다이얼로그를 열기 **전에** 동기 API `window.history.replaceState(null, "", "/")`를 호출한다(`mini-calendar.tsx`의 `clearDeepLinkParams`). Next 14.1+는 네이티브 push/replaceState를 패치해 `useSearchParams`도 함께 동기화하므로 `router.replace` 후속 호출은 필요 없다.

### SW `getRegistration` 인자는 스코프(디렉토리)지 스크립트 경로가 아니다
`navigator.serviceWorker.getRegistration("/sw.js")`처럼 스크립트 경로를 넘기면 브라우저마다 다르게 동작(Safari는 undefined 반환 가능). 등록 스코프 기준으로 조회해야 한다.
**해결:** 등록은 `register("/sw.js", { scope: "/" })`, 조회는 `getRegistration("/")`로 통일. (`lib/push/client.ts`, `components/service-worker-register.tsx`)

## 재사용 패턴

### 서버 액션이 nullable을 수용하면 폼 필드를 선택/접이식으로 분리
`onboardingCreateMember`는 은행·계좌·이메일을 nullable로 받는다. 가입 마찰을 줄이려면 서버가 선택으로 받는 필드를 "추가 정보(선택)" 접이식으로 내려 필수 입력을 최소화하고, 나머지는 가입 후 별도 페이지(`/profile/bank`)에서 입력하게 한다. 서버 페이로드 구조는 그대로 유지된다.
