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

### 개발 전용 UI 게이트는 `isDevModeEnabled()`만 쓴다
`env.NEXT_PUBLIC_ENABLE_DEV_MODE`를 컴포넌트에서 **직접** 읽으면 로컬 `pnpm dev`에서 그 변수를 안 둔 경우 해당 UI만 사라진다. 정본은 `lib/dev-mode.ts`의 `isDevModeEnabled()`이고, 이건 `NODE_ENV === "development"`면 자동으로 true다. 그래서 다른 개발 전용 기능(이메일 로그인 등)은 전부 보이는데 **직접 읽는 한 곳만** 안 보이는, 원인 찾기 어려운 상태가 된다. (전광판 제호의 "스타일 비교" 버튼이 이렇게 사라졌음)
**확인법:** `grep -rn "NEXT_PUBLIC_ENABLE_DEV_MODE" app components lib` 결과에 `lib/env.ts`·`lib/dev-mode.ts` 외의 파일이 있으면 그게 버그다.

### 시안(mock) 폴더끼리 import로 물리면 한쪽만 못 지운다
`/dev/*` 시안 화면은 결론이 나면 폴더째 지우는 게 전제다. 그런데 A 시안 폴더가 B 시안 폴더의 `mock.ts`를 import하면 B를 지울 때 A가 깨진다. 게다가 상대경로 import는 프로젝트 `no-restricted-imports` 규칙에도 걸린다.
**해결:** 시안 폴더마다 자기 `mock.ts`를 둔다. 목업 데이터 중복은 감수한다 — 독립적으로 삭제 가능한 게 더 중요하다.

### (info) route group은 BackHeader를 강제한다
`app/(info)/layout.tsx`는 모든 하위 페이지에 `BackHeader`(`sticky top-0 z-40`)를 렌더한다. 상단 고정(`fixed top-0`) 컴포넌트(예: 가입 진행바 `SignupProgress`)를 쓰는 페이지를 `(info)`에 두면 BackHeader와 위치·z-index가 겹친다. 또 카톡 공유 등 **외부에서 직접 진입하는 랜딩**은 뒤로 갈 history가 없어 BackHeader가 무의미하다.
**해결:** 그런 페이지는 route group 밖(`app/<route>/`)에 두어 RootLayout만 적용받게 한다. route group은 URL에 영향 없으므로 URL은 유지된다. (가입 위저드 `/newbie`를 `app/(info)/newbie` → `app/newbie`로 이동한 사례)

### pre-commit lint-staged가 import 순서를 부분 정렬한다
husky pre-commit의 `lint-staged`가 `eslint --fix`로 `import/order`를 정렬하지만, 커밋 후 working tree에 정렬 잔여 변경이 남는 경우가 있다(프로젝트 전반 188+ 파일이 import/order baseline 위반 상태라 전체 lint 결과는 신뢰도 낮음).
**확인법:** 변경 파일만 `npx eslint <files>`로 검사하고, 커밋 후 `git status`로 잔여 변경을 확인해 별도 `style:` 커밋으로 정리한다.

### pnpm run build는 로컬 env 미설정 시 컴파일 후 실패한다
`.env` 미설정 시 `pnpm run build`가 `✓ Compiled successfully` 직후 t3-env(`lib/env.ts`) 런타임 검증에서 실패한다. 코드/타입 오류가 아니다.
**확인법:** 코드 검증은 `npx tsc --noEmit` 또는 build의 "Compiled successfully" 단계 통과를 기준으로 한다. 라우트 이동 후 tsc가 `.next/types/validator.ts`의 옛 경로를 참조해 에러를 내면 stale 캐시이므로 `rm -rf .next/types .next/dev/types` 후 재확인.

### cacheComponents dev 렌더 재시작이 uncached fetch를 abort → supabase가 error로 반환
`next.config.ts`의 `cacheComponents: true` dev 서버는 캐시 미스를 만나면 렌더를 `AbortController.abort()`로 중단하고 다시 그린다(`renderWithRestartOnCacheMissInDev` — dev 런타임 `app-page-turbo.runtime.dev.js` **전용**, 프로덕션엔 없음). 이때 진행 중이던 **uncached** supabase fetch가 함께 끊기는데, supabase-js는 이 중단을 **throw 하지 않고** `{ error }`로 정규화해 돌려준다(`message: "AbortError..."`, `hint: "Request was aborted (timeout or manual cancellation)"`). 그래서 조회부의 `if (error) console.error(...)`가 **정상 취소를 조회 실패인 것처럼** 로깅한다. 증상: dev 서버 콘솔에 `[getGhostMembers] 유령회원 조회 실패 { AbortError ... }` — 그런데 화면은 재시작 렌더로 멀쩡히 그려진다.
**같은 abort는 운영에서도 날 수 있다** — dev 재시작이 아니라 **실제 요청 취소/타임아웃**(유저가 렌더 도중 이탈)일 때. 둘 다 코드 결함이 아니다.
**해결(형제 전수):** abort 판정을 `lib/supabase/is-abort-error.ts`의 `isRequestAbortError(error)` 한 곳에 가두고, "에러 삼키고 폴백 반환"하는 조회부는 `if (!isRequestAbortError(error)) console.error(...)`로 abort만 로그에서 뺀다(진짜 오류 — RPC 없음·RLS 거부·SQL 오류 등 — 은 그대로 남는다). 적용: `ghost-members`·`story-feed`(3)·`team-overview`·`story-posts`·`story-pledges`·`gathering-cancel-history(.client)`·`onboarding-gatherings`(2)·`onboarding-profile`. **throw 하는 조회부**(`cmm-cd-cached`·`home-calendar`)는 abort면 throw가 Next 재시작 machinery로 정상 처리되므로 이 스코프에서 제외.
**확인법:** 새 uncached 조회부에서 supabase `error`를 `console.error`로 찍는다면 `isRequestAbortError` 가드를 함께 붙일 것.

### 제어 input은 모바일 자동완성 값을 놓쳐 RHF가 빈 값으로 본다
`value={field.value}` 제어 컴포넌트는 모바일 브라우저 **자동완성(autofill)이 DOM `.value`만 채우고 React `onChange`를 발화하지 않을 때** RHF 상태가 빈 채로 남는다. 화면엔 값이 보이지만 `required` 검증이 실패한다(증상: 회색으로 번호가 보이는데 그 밑에 "연락처를 입력해 주세요"). 신규 가입자에게만 집중 발생(기존 회원은 해당 화면 미경유). 추가로 iOS 연락처는 국가번호 `+82` 형식으로 채워 `010` 검증을 통과하지 못한다.
**해결 1차(불충분):** 제출 직전 입력 `ref`의 실제 DOM 값을 `form.setValue`로 동기화(버튼 클릭·Enter 양쪽), `autoComplete="tel"`/`name` 부여. 전화번호는 `lib/phone-utils.ts`의 `normalizeKoreanMobileDigits`로 `+82`→`010` 정규화. (PR #336)
**왜 1차가 부족했나:** `value=`로 제어된 입력은 React가 **리렌더 시점에 DOM `.value`를 다시 `field.value`(빈 값)로 되돌린다.** 자동완성 후 리렌더가 한 번이라도 끼면 제출 직전 `ref.value`마저 비어 동기화가 헛돈다.
**해결 2차(근본):** 입력을 `value=` 제어 대신 **`defaultValue=` 비제어**로 둔다. 제어 value가 없으면 React가 자동완성 값을 되돌리지 않아 DOM에 값이 보존된다. 라이브 포맷은 `onChange`에서 `event.target.value`에 직접 쓰고 RHF에 미러링. 1차의 제출 직전 `ref` 동기화는 이중 안전장치로 유지. (PR #336 + 후속, `components/auth/member-onboarding-form.tsx`)

### `pnpm db:types` 전체 재생성은 dev↔prd 스키마 drift로 빌드를 깨뜨린다
`lib/supabase/database.types.ts`를 dev 또는 prd 한쪽 기준으로 전부 재생성하면 타입이 깨진다. **dev에는 `gthr_mst`/`gthr_attd_rel`(모임) 테이블이 있지만 prd엔 없고, 반대로 prd 일부 RPC 함수는 `short_id`를 반환하는데 dev 함수엔 없다.** 현재 커밋된 `database.types.ts`는 양쪽을 수동 병합한 상태라, 통째로 덮으면 어느 쪽으로 생성하든 기존 코드가 컴파일 실패한다.
**해결:** 신규 테이블 추가 시 전체 재생성하지 말고, **해당 테이블 타입 블록만 수동으로 끼워넣는다**(알파벳 순 위치, `Row`/`Insert`/`Update`/`Relationships` 구조는 기존 테이블 복사). `push_sub_rel` 추가가 이 방식. 근본 해결은 dev/prd 스키마 동기화이며 별도 과제(TODO).

### anon RLS 정책이 anon-비가시 테이블을 참조하면 정책 전체가 막힌다 _(해결됨)_
RLS 정책 `USING` 안의 서브쿼리(EXISTS/JOIN)는 **현재 역할로 대상 테이블의 RLS를 다시 탄다.** 그래서 `anon` 정책이 anon엔 SELECT 정책이 없는 테이블(예: `team_mst`)을 `EXISTS(SELECT 1 FROM team_mst ...)`로 참조하면 그 서브쿼리가 항상 0행 → 정책이 **어떤 행도 통과시키지 못한다.** 증상: 비로그인이 `gthr_mst`를 직접 조회하는 경로(공유링크 `?gthr=<short_id>` 딥링크, `mini-calendar.tsx`)에서 존재하는 모임도 "삭제되었거나 찾을 수 없는 모임입니다".
**왜 달력은 멀쩡했나:** 달력은 `get_public_team_gatherings`/`get_gathering_detail` 같은 **SECURITY DEFINER RPC**로 조회 → RLS 우회. 직접 테이블 SELECT만 정책에 걸려 "목록·달력은 되는데 상세 공유링크만 깨지는" 비대칭이 생긴다.
**잉여 조건이기도:** `gthr_mst.team_id`는 NOT NULL + team_mst FK라 `EXISTS(team_mst)` 존재체크는 **항상 참인 잉여 조건**(테넌트 격리도 못 함). authenticated 정책의 `v2_rls_auth_in_team(team_id)`를 anon용으로 복붙하며 팀 조건 껍데기만 남긴 잔재였다.
**해결:** anon 정책에서 team_mst 의존 제거, `sch_post_mst_select_anon`과 동일하게 `USING (del_yn = false)`로 정렬. 참석관계(`gthr_attd_rel`)도 team_mst JOIN만 걷어내고 gthr_mst(비삭제) 스코프는 유지(gthr_mst anon이 열려 서브쿼리 정상 동작). 마이그레이션 `20260721100000_fix_gthr_anon_rls_drop_team_mst.sql`, dev/prd 적용.
**원칙(형제 전수):** anon 정책 추가·검토 시 `USING` 식이 참조하는 테이블이 anon에 SELECT 가능한지 확인.
**전수 점검 함정 — `TO PUBLIC` 을 빠뜨리지 마라:** RLS 정책은 `TO anon` 뿐 아니라 **`TO PUBLIC`(pg_policy.polroles = `{0}`, 즉 `pg_roles` 조인 시 roles 가 빈 배열로 보임)** 로도 anon 에 적용된다. `'anon' = any(roles)` 로만 거르면 PUBLIC 정책을 놓쳐 "정책 없음"으로 **오판**한다. 점검 쿼리는 `pol.polroles = '{0}' OR 'anon' = any(...)` 로 PUBLIC 을 포함할 것. (실제로 `comp_mst`/`comp_evt_cfg` 는 `TO PUBLIC` + `del_yn = false` 라 대회 공유링크 `?comp=` 는 **비로그인도 정상** — 이번에 이 함정으로 "깨졌다"고 오진했다가 anon 실측(1083건 조회)으로 정정. 깔끔한 PUBLIC+del_yn 이 정답 패턴이고, `gthr` 만 `TO anon`+team_mst 의존으로 깨졌던 것.)

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
- **부과 시작 = 앵커 `last_calc_dt` 다음 달**(시드 06-04 → 7월부터; 6월분은 시드에 녹은 것으로 간주 — 기존 증분 동작과 동일). 앵커 없으면 **첫 부과월(`firstChargeMonth`)부터** — 원칙은 가입 당월부터이나, **`JOIN_MONTH_EXEMPT_FROM`(2026-07-01) 이후 가입자는 가입 당월 미부과(다음 달부터)**. `join_dt`는 불변이라 이 조건은 소급 안전하고, 리플레이 특성상 배포 시점과 무관하게 컷오프 이후 가입자 전원에게 자동 적용(백필 불요). 부과 여부를 참조하는 곳(잔액 재계산 fromMonth·참여 감면 배치 대상·퀘스트 카드 표시)은 **반드시 같은 `firstChargeMonth`를 공유**할 것 — 어긋나면 부과 없는 달에 감면이 붙어 공돈이 된다(잔액 RPC에 면제 캡 없음).
  이 컷오프 자동 소급은 **앵커 없는 회원에 한한다** — 앵커(`LEDGER_EPOCH` 이전 스냅샷)가 있는 회원은 과거 가입월 부과 여부가 이미 `bal_amt`에 녹아 있어 리플레이가 재도출하지 못한다(`lib/dues/ledger-replay.ts:16-19` 주석). 컷오프~에포크 경계(2026-07-01~02) 사이에 스냅샷이 생긴 회원이 있으면 수동 정리가 필요하지만, 현재 prd 기준 해당자는 0명.
- **커서(p_last_calc_at)를 납부 0건이라고 now 로 두면 안 된다** — 업로드 컷오프(매칭 거래가 커서 이전이면 skip)에 걸려 그 회원의 과거 입금이 조용히 소실된다(QS-9). 납부 없으면 앵커 커서, 그마저 없으면 **가입월 초(첫 부과월이 아님!)** — 가입 당월 미부과 회원의 커서를 첫 부과월(미래)로 두면 가입월 중 은행 입금이 컷오프에 걸려 소실된다.
- **리플레이는 과거 증분 시대에 눌어붙은 오차를 자가 치유한다**: dev 전수 대조(161명)에서 137명 정확 일치, 23명은 기대 차이(비활성 회원 당월 미부과), 1명은 06-06 옛 JS 재계산이 근거 이력 없이 +2,000 가산한 것이 교정 대상으로 확인. **배포 직후 전체 재계산 후 원장 diff 를 한 번 훑을 것.**

### 회비 원장 화면은 잔액 스냅샷만 믿지 말고 active 회원으로 한 번 더 좁힌다
`fee_mem_bal_snap`은 파생 스냅샷이라 회원 상태 변경(`team_mem_rel.mem_st_cd='left'|'inactive'`)과 동시에 삭제되지 않는다. 회비 현황에서 탈퇴 처리한 회원을 계속 보여주지 않으려면 `getDuesLedger()`가 `team_mem_rel`의 현재 active 멤버 id를 먼저 구한 뒤 스냅샷을 `.in("mem_id", activeIds)`로 필터링해야 한다. 재계산 액션도 active 회원만 대상으로 하므로 이 화면의 기본 범위는 active가 맞다.

### 딥링크로 다이얼로그를 열 때 URL 정리는 setOpen 전에 네이티브 replaceState로
알림 딥링크(`/schedule?post=`·`?comp=`·`?gthr=`)로 상세 다이얼로그를 열고 `router.replace`로 쿼리를 지우는 순서(setOpen → router.replace)는 **무한 재오픈 루프**를 만든다. `router.replace`는 transition이라 실제 히스토리 교체가 다이얼로그의 `useDialogHistoryBack` pushState보다 **늦게** 일어나, 히스토리가 `[이전, "/schedule?gthr=id", "/schedule"]`로 남는다. 뒤로가기(popstate)든 스와이프 닫기(cleanup의 `history.back()`)든 `?gthr=id` 항목으로 복귀 → `useSearchParams` 동기화 → 딥링크 이펙트 재발동 → 상세 재오픈 반복.
**해결:** 다이얼로그를 열기 **전에** 동기 API `window.history.replaceState`를 호출한다(`mini-calendar.tsx`의 `clearDeepLinkParams`). Next 14.1+는 네이티브 push/replaceState를 패치해 `useSearchParams`도 함께 동기화하므로 `router.replace` 후속 호출은 필요 없다.
**경로를 `/`로 갈아끼우지 않는다** — `post`·`comp`·`gthr` 키만 지우고 경로·나머지 쿼리·해시는 보존한다. 딥링크가 `/schedule`에 붙게 된 뒤로(홈이 전광판이 되며 `/`엔 읽는 쪽이 없다) 경로를 `/`로 덮으면 상세를 닫는 순간 엉뚱한 화면으로 튄다.

### SW `getRegistration` 인자는 스코프(디렉토리)지 스크립트 경로가 아니다
`navigator.serviceWorker.getRegistration("/sw.js")`처럼 스크립트 경로를 넘기면 브라우저마다 다르게 동작(Safari는 undefined 반환 가능). 등록 스코프 기준으로 조회해야 한다.
**해결:** 등록은 `register("/sw.js", { scope: "/" })`, 조회는 `getRegistration("/")`로 통일. (`lib/push/client.ts`, `components/service-worker-register.tsx`)

### 열린 다이얼로그의 Root(Dialog↔Drawer)가 교체되면 히스토리 스택이 어긋난다 — 해결됨 (2026-07-06)
`ResponsiveDrawer`의 `useMediaQuery`가 초기값 `false`로 시작해 이펙트에서 보정하던 탓에, 데스크톱에서 상세 다이얼로그가 **open 상태로 마운트**되면(null 가드로 조건부 렌더되는 상세류의 첫 오픈) 첫 렌더는 Drawer로 `pushState` → 직후 Dialog로 교체되며 Drawer 언마운트 cleanup이 `history.back()` 회수 + Dialog가 재푸시. 큐된 back() 트래버설이 **원래 앱 엔트리로 착지**해, 이후 X 닫기의 `back()`이 한 칸 더 나가 **사이트 진입 이전 페이지로 이탈**했다. 모바일은 교체가 없어 정상 → "데스크톱에서만 닫기가 이전 사이트로 튕김" 증상.
**해결 1(근본):** `useMediaQuery` 초기값을 lazy initializer로 `window.matchMedia(query).matches` 즉시 읽기 — 첫 렌더부터 올바른 Root로 마운트되어 교체가 사라짐. (`components/common/responsive-drawer.tsx`)
**해결 2(방어):** `useDialogHistoryBack` cleanup은 `history.state.dialog === id`(현재 항목이 자기 것)이거나 `pendingProgrammaticBack > 0`(같은 커밋에서 중첩 다이얼로그가 동시에 닫혀 위쪽 back()이 큐만 된 상태 — history.state가 잠시 낡음)일 때만 `back()` 호출 — 스택이 어긋났을 때 고아 항목 하나 남기는 쪽이 페이지 이탈보다 안전. (`lib/hooks/use-dialog-history-back.ts`)
**남은 한계:** 다이얼로그를 연 채로 창 폭을 768px 경계 너머로 리사이즈하면 여전히 Root가 교체된다(기존부터 있던 엣지). 가드 덕에 사이트 이탈은 안 하고 고아 항목 1개(뒤로가기 한 번 무반응)로 완화됨.
**원칙:** `useDialogHistoryBack`이 붙은 Root(Dialog/Sheet/Drawer)는 **열린 채로 다른 Root로 갈아끼우면 안 된다.** 반응형 분기 등으로 Root를 조건 교체하는 컴포넌트는 분기 값이 첫 렌더부터 확정돼 있어야 한다.

### public 스키마의 일반 함수는 PostgREST /rpc/로 노출된다 (기본 EXECUTE가 PUBLIC)
Postgres는 새 함수에 기본적으로 PUBLIC EXECUTE를 부여하고, Supabase는 public 스키마 함수를 `/rpc/<name>`으로 노출한다. `RETURNS trigger`는 RPC 불가라 안전하지만, **트리거가 부르는 헬퍼(RETURNS void/int)나 SECURITY DEFINER 유틸은 클라이언트가 직접 호출 가능**해진다. 또 `ALTER DEFAULT PRIVILEGES` 잔재(20260325 remote_schema)로 **새 테이블에도 anon/authenticated GRANT ALL이 자동 부여**된다 — RLS 정책 0개면 실질 차단되지만 권한 레벨은 열려 있다.
**원칙:** 내부 전용 함수·비공개 테이블을 만들면 `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` / `REVOKE ALL ON TABLE ... FROM anon, authenticated`를 마이그레이션에 항상 동봉한다. (선례: `noti_func_revoke_public`, 포인트 `pt_*` 일괄 REVOKE — 2026-07-04)

### 원천에 유니크 제약이 없는 "존재 확인 후 INSERT"는 advisory lock으로 직렬화
포인트 원장의 net 판정(§5.2)처럼 **"현재 상태 SELECT → 조건부 INSERT"** 패턴은 원천 테이블 제약이 동시 이벤트를 직렬화해줄 때만 안전하다(참석=UNIQUE(gthr_id,mem_id) 등). 마일리지런 기록처럼 (mem, 날짜) 유니크가 없는 원천은 겹치는 트랜잭션이 서로의 미커밋 INSERT를 못 봐 이중 적립된다. append-only 테이블은 잠글 row도 없어 `FOR UPDATE` 불가.
**해결:** `pg_advisory_xact_lock(hashtext('<도메인>:'||키)::bigint)`로 논리 키를 직렬화. (선례: `recalc_member_balance`(2026-06-28), `pt_earn_mlg_record`/`recheck_mlg_goal`(2026-07-04))

### createAdminClient(RLS 우회) 서버 액션은 팀 스코프·대상 검증을 코드로 강제해야 한다
관리자 서버 액션이 `createAdminClient()`(service role)를 쓰는 순간 RLS가 전부 무력화되므로, "어느 팀의 무엇을 대상으로 하는가"를 **액션 안에서 직접 검증**해야 한다. 안 하면 임의 id를 넘겨 타 팀 데이터를 조작하는 IDOR이 된다 (모임 참가자 관리 리뷰에서 발견 — 초안이 gthr_id 팀 소속 확인 없이 DELETE).
**패턴:** `getRequestTeamContext()`로 teamId → 대상 row를 teamId 조건 포함해 조회(없으면 거부) → 변경. 선례: `manage-member.ts`의 `.eq("team_id", teamId)`, `manage-gathering-attendance.ts`의 `verifyGatheringInTeam()`. 클라이언트 필터(활성 멤버만 셀렉트 등)는 UI 편의일 뿐 서버 검증을 대체하지 않는다.

### 관리자 화면 브라우저 QA는 dev0X 이메일 계정으로 불가 (전부 일반 회원)
dev DB의 이메일 로그인 테스트 계정(dev01~05@dev.com)은 모두 비관리자 멤버라 `/admin/*` 화면 QA에 못 쓴다. 관리자 권한 계정은 전부 OAuth(카카오/구글)라 자동화 세션 확보 불가. 관리자 화면을 에이전트가 브라우저로 검증하려면 dev 환경에서 dev 계정 하나에 admin 역할(`team_mem_rel.team_role_cd`)을 부여해 둬야 한다(운영자 결정 필요). 그 전까지는 임베드 쿼리 REST 스모크(200/400) + SQL 기대값 대조 + 라우트 컴파일 확인이 최선의 proxy. (2026-07-14 참여현황 기능에서 확인)

### 새 RPC를 만든 직후엔 PostgREST 스키마 캐시 때문에 앱에서만 "함수 없음"이 난다
`apply_migration`으로 함수를 만들면 **SQL로는 즉시 호출되는데 앱(PostgREST `/rpc/`)에서는 한동안 실패**한다. PostgREST가 스키마를 캐시하고 있어서다. 증상이 고약한 이유: RPC 실패를 빈 배열로 폴백하는 쿼리(`getStoryPosts` 등)면 에러가 안 보이고 **화면만 계속 빈 상태**로 뜬다 — 데이터가 없는 건지 함수를 못 찾는 건지 화면으론 구분이 안 간다. 게다가 `unstable_cache`가 그 빈 결과를 revalidate 시간만큼 붙잡는다(이중 지연).
**해결:** 새 함수 마이그레이션 뒤에 `NOTIFY pgrst, 'reload schema';`를 한 번 실행한다. 진단 순서는 ① SQL로 직접 호출해 함수 자체를 확인 → ② 되면 스키마 캐시 → ③ 그래도 비면 `unstable_cache` 만료 대기(또는 dev 서버 재시작). (2026-07-24 `get_team_posts` 신설에서 확인)

### 자주 쓰는 소규모 데이터는 큰 피드 RPC/캐시에서 떼어낸다 (무효화 전염 차단)
`get_team_story_feed`(CTE 10개+, `story-feed` 태그, 5분 캐시)에 새 존을 계속 얹으면, 그 존의 잦은 쓰기가 `revalidateTag("story-feed")`로 **피드 전체를 재계산**시킨다. 특히 놀이성 상호작용(응원 연타·각오 띄우기)은 무효화가 잦아 캐시가 남아나지 않는다. **패턴:** 그런 슬라이스는 별도 RPC + 별도 캐시 태그로 분리한다 — `get_team_posts`/`story-posts`(기록자랑), `get_team_pledges`/`story-pledges`(각오 하늘). 그러면 그 슬라이스의 쓰기가 자기 태그만 무효화하고 큰 피드는 안 건드린다. 실시간이 필요하면 그 테이블만 `supabase_realtime`에 얹고 클라이언트가 구독→`router.refresh()`(알림 `noti_mst`/댓글 `cmnt_mst`와 동일). **단, 그 refresh가 최신값을 받으려면 쓰기 액션이 `updateTag`여야 한다** — `revalidateTag(tag,"max")`면 SWR이라 낡은 값이 온다(아래 §`revalidateTag(tag, "max")` 항목). 리액션은 아예 `revalidateTag`를 안 부르고 30초 캐시로 흡수하는 더 강한 변형(§`story-reaction`). (2026-07-24 각오 공유 하늘 Realtime에서 확인)

### `revalidateTag(tag, "max")`는 서버 액션이 **자기 쓰기를 되읽지 못하게** 막는다 → `updateTag`
Next 16의 `revalidateTag(tag, profile)`에서 프로필을 주면 그건 **stale-while-revalidate 갱신**이라, Next가 **의도적으로** `store.pathWasRevalidated`를 안 찍는다. `next/dist/server/web/spec-extension/revalidate.js`의 주석 그대로: _"if profile is provided and this is a stale-while-revalidate update we do not mark the path as revalidated **so that server actions don't pull their own writes**"_ — `expire === 0`일 때만 revalidate로 표시한다. 기본 프로필 `max`는 `expire: 60*60*24*365`(≠0)라 항상 이 SWR 경로를 탄다.
**증상:** 저장 직후 `router.refresh()`가 **낡은 캐시**를 받고 갱신은 백그라운드로만 돈다 → "각오/기록을 올렸는데 새로고침해야 보인다". Realtime 구독으로 `router.refresh()`를 도는 **다른 사람 화면도 똑같이 낡은 값**을 받아, 낙관적 UI가 있는 작성자에게만 보이는 **반쪽 실시간**이 된다(각오 띄우기가 이 케이스).
**해결:** 쓰기 직후 즉시 보여야 하는 서버 액션은 `revalidateTag(tag, "max")` 대신 **`updateTag(tag)`**(Next 16, 즉시 만료 + read-your-own-writes). `unstable_cache` 태그에도 그대로 통한다(내부적으로 프로필 없는 옛 `revalidateTag`와 같은 경로).
**주의:** `updateTag`는 **서버 액션 전용**이다 — `workStore.page`가 `/route`로 끝나면 throw한다. 라우트 핸들러(`app/api/revalidate/route.ts` 등)와 "지금 안 보여도 되는" 저빈도 무효화는 `revalidateTag(tag, "max")`를 유지한다.
**남은 형제:** 같은 패턴이 board(`create-post`·`update-post`·`delete-post`)·대회(`create-competition`·`manage-competition`·`revalidate-competitions`)·기록(`save-race-record`·`save-utmb-profile`·`refresh-utmb-indexes`·`revalidate-cache`)에 그대로 있다. 그 화면에서 "저장했는데 안 보임"이 보고되면 같은 처방. (2026-07-24 전광판 각오·기록자랑에서 확인)

### MCP generate_typescript_types 결과에는 재정렬 노이즈가 섞인다
dev MCP로 `database.types.ts`를 재생성하면 기존 테이블 블록이 diff상 삭제+재추가로 보일 수 있다(예: fee_policy_cfg 44줄). 실제 손실인지 이동인지 `git diff | grep "^+" | grep <이름>`으로 반드시 재확인할 것 — dev/prd drift로 진짜 소실될 수도 있다(TODO의 "스키마 drift" 항목 참조).

### 내린 칭호(`ttl_mst.use_yn = false`)는 **관리자 화면 밖 모든 곳에서 안 보여야 한다**
칭호를 운영에서 내릴 때 `use_yn = false`로만 두고 행은 남긴다(`mem_ttl_rel`이 FK로 물고 있어 지우면 이력이 깨진다). 엔진(`lib/titles/engine.ts` 3곳)과 RPC 3종(`get_public_member_card`·`get_team_story_feed`·`get_team_posts`)은 전부 조인에서 `use_yn = true`를 걸지만, **앱 코드의 `ttl_mst` 직접 조회는 각자 걸어야 한다**. 빠뜨리면 조용히 실패하지 않고 *더 나쁘게* 실패한다 — `desc_visibility = 'always'`인 칭호는 마스킹도 안 걸려 **이름이 그대로 보이는데 눌러도 반응이 없는** 상태가 된다. _(2026-07-30: 단거리왕 → 총알도령/총알낭자 분리 후 도감에 단거리왕이 남아 발견. 도감·랭킹 배지·마일리지런 후기 배지 3곳이 동시에 빠져 있었다.)_

- **거는 곳**: 유저에게 보이는 모든 경로. 도감(`collection-sheet.tsx`)은 쿼리에서 아예 받지 않는다 — 받아 놓고 "표시하되 선택 불가"로 두면 위 상태가 된다.
- **안 거는 곳**: 칭호 관리·수여 이력·관리자 멤버 상세(내린 칭호를 봐야 토글·회수를 한다), 그리고 엔진의 조건 평가용 메타 조회(`lib/titles/snapshot.ts` — 표시가 아니다).
- **`!left` 아래 중첩된 임베드에는 `.eq("...ttl_mst.use_yn", true)`를 쓰지 말 것.** PostgREST가 부모 조인을 좁혀 *칭호 없는 멤버의 행 자체*를 떨군다(마일리지런 후기가 통째로 사라진다). 그 경우 `use_yn`을 select해서 JS로 거른다.

### 서버 액션에서 `after()`를 쓰면 그 액션의 기존 테스트가 통째로 깨진다
`import { after } from "next/server"`는 **요청 스코프**를 요구한다. 서버 액션을 vitest에서
직접 호출하는 테스트(모임 취소 3파일 9개가 그렇다)는 스코프가 없어 ``after` was called outside
a request scope``로 던진다. 액션 본문이 정상 동작해도 테스트가 전부 실패하므로, 원인을 액션
로직에서 찾다 시간을 버린다.

- **처방**: 액션에서는 `await 부수작업().catch(로깅)`을 쓴다. `save-race-record.ts`가 원래
  그 형태고, 칭호 훅(모임 취소·깅스타그램 게시·댓글 작성)도 같은 형태로 맞췄다.
- catch가 삼키므로 부수작업 실패가 본 액션을 롤백시키지 않는다 — `after`를 쓰려던 목적은 그대로다.
- `after`가 맞는 자리는 **Route Handler**다(`app/auth/callback/route.ts`가 그렇게 쓴다).
  _(2026-08-14 칭호 트리거 훅 추가 중 발견)_

### jsonb 객체는 키 순서를 보존하지 않는다 — 순서에 뜻이 있으면 배열로
Postgres `jsonb`는 키를 **정렬해서 저장**한다(길이순 → 사전순). `Record<string, number>`를
그대로 넣으면 읽을 때 순서가 뒤섞인다. 배치 실행 결과 지표를 `{시즌, 평가, 부여}`로 넣었는데
화면에 `부여 · 시즌 · 평가`로 나왔다.

- **처방**: 순서가 의미를 갖는 데이터는 `{label, value}[]` **배열**로 담는다(jsonb 배열은
  순서를 보존한다). `batch_run_hist.result_json`의 `metrics`가 그 형태다.
- 같은 이유로 **jsonb에서 읽은 값은 항상 한 번 거른다** — 스키마를 못 믿는 자리다.
  옛 행은 필드가 아예 없고(null), 형태가 바뀌면 키도 다르다. 화면이 곧바로 파고들면
  옛 행 하나에 페이지가 통째로 터진다(`parseStoredBatchResult`가 그 관문).
  _(2026-08-14 배치 결과 가시성 작업 중 발견)_

### "늦게 온 응답을 버린다" 가드는 **그 축에 종속된 값만** 덮어야 한다
늦은 응답 폐기 가드(`if (ref.current !== 요청당시값) return;`)는 한 축(열린 모임 / 보고 있는 달)이
바뀌었을 때 옛 응답이 새 화면을 덮지 않게 하는 장치다. 그런데 `return`은 **그 아래 전부**를 버리므로,
같은 응답으로 만드는 값 중 **그 축과 무관한 것까지** 같이 사라진다.

- **실제 사고(2026-08-19 prd)**: `MiniCalendar`의 마운트 1회 조회가 ①이 달의 내 대회(`myRaces`)와
  ②**달과 무관한** 내 등록 맵(`registrationsByCompetitionId`)을 같이 만들었는데, 월 이동 가드가
  둘 다 버렸다. 대회는 대개 다음 달 이후라 **사용자는 들어오자마자 달을 넘긴다** — 그 스와이프가
  응답보다 빠르면(모바일 RTT ~300ms) 맵이 빈 채로 남았고, **다시 만드는 경로가 없어**
  그 페이지 세션 내내 복구되지 않았다.
  결과: 이미 신청한 사람에게 상세가 "정보 수정"이 아니라 **"참가 신청"**으로 열리고
  (취소 버튼은 렌더조차 안 됨), 제출하면 INSERT가 `uk_comp_reg_rel_team_comp_mem_vers`(23505)에
  걸려 **"신청에 실패했습니다"만 뜨는 막다른 길**이 됐다.
- **처방 셋** — 하나만 하면 또 샌다.
  1. **가드보다 위**에 축과 무관한 값을 반영한다(늦게 와도 유효한 값이다).
  2. **만드는 경로를 하나로 두지 않는다.** "마운트 1회"짜리 상태는 그 한 번을 놓치면 영영 빈다 —
     이후에도 도는 조회(여기선 달 이동 `fetchMonthData`)가 같이 갱신하게 해서 **스스로 낫게** 만든다.
     그러려면 그 조회의 `select`도 같은 필드를 실어야 한다(빠져 있으면 복구가 불가능하다).
  3. **소비하는 쪽에 폴백을 둔다.** `CompetitionDetailDialog`는 어차피 참가자 목록을 읽으므로
     거기서 내 등록을 되찾는다(`lib/competition-registration.ts`의 `findMyRegistration`) —
     추가 요청 없이 막다른 길이 구조적으로 사라진다.
- **INSERT/UPDATE를 클라이언트 캐시로 가르는 화면은 전부 이 위험을 갖는다.** 캐시가 비면
  "수정"이 조용히 "신규"가 되고, 유니크 제약이 있으면 사용자는 이유를 알 수 없는 실패만 본다.

## 재사용 패턴

### 상세 다이얼로그 오픈 = "인스턴트 오픈 + 백필 + 댓글 자체조회" (전 경로 공통 원칙)
상세 오픈 경로는 홈 8곳(행 클릭 3종: 일정·모임·대회 / 딥링크 3종: `?post`·`?comp`·`?gthr` / 대회 선택 팝업 / 등록 직후) + `/races` 리스트. 어떤 경로든:
1. **손에 있는 데이터(행·리스트·폼 입력값)로 즉시 연다.** 조회를 기다렸다 여는 것 금지 — 부족한 필드는 열린 뒤 백필(`setState((prev) => prev.id === id ? {...} : prev)` 가드로 늦은 응답 폐기).
2. **댓글은 절대 기다리지 않는다.** `initialComments={undefined}` → CommentSection이 자체 조회·로딩 표시.
3. **딥링크 not-found는 무반응 금지** — `notifyDeepLinkMissing()`(토스트 + 파라미터 정리).
4. **한 경로에서 버그·개선을 발견하면 위 경로 전체에 같은 수정을 전수 적용**하고, 경로가 늘면 이 목록을 갱신한다. _(2026-07-03: 대회 클릭이 조회 후 오픈, 일정·대회 딥링크가 댓글까지 대기하던 것을 모임 패턴으로 일괄 정렬)_

### 서버 액션이 nullable을 수용하면 폼 필드를 선택으로 분리 (또는 온보딩에서 제거)
`onboardingCreateMember`는 은행·계좌·이메일을 nullable로 받는다. 가입 마찰을 줄이려면 서버가 선택으로 받는 필드를 필수 입력에서 빼고, 가입 후 별도 페이지(`/profile/bank`)에서 입력하게 한다. 서버 페이로드 구조는 그대로 유지(폼은 `bankName:null, bankAccountRaw:""`로 항상 빈 값 전달). _(2026-07-09: 6단계 위저드 개편 때 계좌 접이식 UI를 온보딩에서 완전 제거 — 가입 시점엔 계좌 맥락이 없어 거부감만 준다는 판단.)_

### 다단계 위저드의 입력은 제어 컴포넌트로 — 비제어(defaultValue)는 단계 왕복 시 깨진다
온보딩 phone 입력을 비제어(`defaultValue`)로 두면 (1) "번호 다시 입력"으로 단계를 되돌아올 때 값이 최초 마운트 값에 고정돼 안 바뀌고, (2) `autoComplete="tel"` autofill이 이름 등 엉뚱한 값을 그 칸에 채운다("이름이 연락처로 넘어옴"). **해결:** `value={field.value}` 제어 입력 + `autoComplete="off"`. 그러면 `phoneInputRef`/`syncPhoneFromDom` 같은 autofill 우회 장치도 전부 불필요. (원래 비제어로 뒀던 이유가 "모바일 autofill이 onChange 없이 DOM만 채운다"였는데, autofill을 끄면 그 문제 자체가 사라진다.) 2026-07-09 수정.

### 회원 생성 직후 다중 테이블 INSERT는 트랜잭션이 아니다 — 핵심/부가를 나눠 비치명 처리
서버 액션은 문장별 실행이라 `mem_mst` INSERT → `team_mem_rel` → `mem_onbd_prf` → 참석 INSERT가 한 트랜잭션으로 묶이지 않는다. 원칙: **가입 성립에 필수인 것**(`mem_mst`+`team_mem_rel`)은 실패 시 service_role로 앞 INSERT를 되돌리고(`mem_mst` DELETE 정책이 없어 admin 클라이언트 필요), **부가 데이터**(`mem_onbd_prf`, 참석 약속 모임 신청)는 실패해도 가입을 롤백하지 않고 `console.error` 로깅만 한다. `mem_onbd_prf` FK가 `ON DELETE CASCADE`라 앞 단계 롤백 시 자동 정리되지만, 이는 "프로필 INSERT는 롤백 지점 뒤"라는 순서에 의존하는 암묵 전제. (선례: `onboardingCreateMember` 2026-07-09)

### 관리자가 타 회원 온보딩 프로필을 볼 때 서버 액션이 필요 없다 (RLS가 이미 허용)
`mem_onbd_prf`에는 `mem_onbd_prf_select_team_admin` RLS(팀 owner/admin이면 팀원 행 SELECT 허용)가 걸려 있다. 그래서 관리자 회원관리 상세(`admin-members-client.tsx`의 `OnboardingSection`)는 `TitleSection`처럼 **브라우저 클라이언트(`createClient()`)로 직접 조회**하면 된다 — `withAdmin`+`createAdminClient` 서버 액션을 새로 만들 필요 없음(반사적으로 만들기 쉬운 함정). 반대로 본인 편집 경로(`getNearStation`)는 `mem_onbd_prf_select_own`으로 통과. 라벨은 `lib/validations/member.ts` 단일 출처(`PACE_LABELS`/`JOIN_SRC_LABELS`), 관리자 요약용 압축 라벨은 같은 파일 `JOIN_PURP_SHORT_LABELS`. (2026-07-10 회원관리 온보딩 표시 추가)

### "개편 후 신규 가입자" 식별은 위성 테이블 row 존재가 아니라 전용 플래그로
`mem_onbd_prf`는 온보딩에서도 생기고 기존 회원이 프로필 편집에서 러닝 프로필을 입력해도 생긴다(upsert). 따라서 "row 존재 = 신규 온보딩 가입자"가 아니다. 넛지 크론 대상 판별은 **`attd_pldg_at IS NOT NULL`**(참석 서약은 온보딩 경로에서만 기록)로 한다. 프로필 편집 서버 액션(`update-running-profile`)은 `attd_pldg_at`/`pldg_gthr_id`/`join_src_cd`/`join_src_txt`를 payload에서 제외해 절대 덮어쓰지 않는다.

### Tailwind v4 빌드가 "globals.css:1 Invalid code point"로 실패하면 — 소스의 이모지를 찾아라
`RangeError: Invalid code point`가 나면서 에러 위치가 `app/globals.css:1:1`(`@import "tailwindcss"`)로 찍히면 **CSS는 범인이 아니다.** Tailwind v4 스캐너가 소스 파일 전체에서 클래스 후보를 뽑아 CSS 이스케이프를 되돌리는데, astral-plane 문자(이모지, U+FFFF 초과)가 있으면 서로게이트 페어를 깨뜨려 `String.fromCodePoint`가 터진다. CSS 파일을 아무리 이등분해도 안 잡히고(=CSS를 통째로 지워도 재현), 스택에 `at Function.fromCodePoint / at String.replace`만 보이는 게 단서. **JSX 텍스트의 이모지를 `lucide-react` 아이콘으로 교체**하면 해결. 기존 파일(예: 카톡 공유 문구)의 이모지는 문자열 리터럴이라 괜찮았고, 새로 추가한 JSX 본문 이모지(📣)에서 터졌다. 디버깅 시 `git stash -u`로 전체를 되돌려 HEAD가 빌드되는지부터 확인할 것 — 그래야 "내 변경이 원인"을 먼저 확정한다. (2026-07-22 프로필 카드 구현)

### `gthr_attd_rel`에는 취소 플래그가 없다 — 살아있는 행이 곧 유효 참석
모임 참석 취소는 행을 UPDATE하지 않고 **삭제 + `gthr_attd_hist`에 이벤트 기록**(`evt_cd`)으로 처리한다. 따라서 참석 횟수 집계에 "취소 제외" 조건을 따로 걸 필요가 없고, 걸려고 컬럼을 찾으면 없다. 과거 참석만 세려면 `gthr_mst.stt_at < now()`를 더한다. 취소자 표시가 필요한 화면은 `gthr_attd_hist`를 별도 조회한다(`gathering-canceled-attendees.tsx` 선례). (2026-07-22 프로필 카드 `gthr_attd_cnt` 구현)

### 회원별 설정이 "조회 범위"를 바꾸면 localStorage가 아니라 쿠키다 (+ 팀 공용 캐시는 키를 쪼개지 말고 범위를 합집합으로)
개인 설정을 붙일 때 홈 필터(`home-filter-type`)를 그대로 따라 localStorage + 마운트 후 복원으로 만들기 쉬운데, **그게 통하는 건 필터가 "이미 받아온 데이터를 거르기만" 하기 때문이다.** 설정이 *서버가 무엇을 조회할지*를 바꾸면 얘기가 다르다 — SSR은 localStorage를 못 읽어 기본값으로 그려 내려보내고, 마운트 후 다시 그리면서 ① 레이아웃이 통째로 재배치되고 ② 서버가 안 받아온 가장자리 데이터가 빈 채로 떴다가 뒤늦게 채워진다. **쿠키는 요청에 실려 오므로 첫 렌더부터 맞는다.**
- 비용은 0에 가깝다: 대부분의 동적 페이지는 이미 `getCurrentMember()`(→`lib/supabase/server.ts`의 `cookies()`)로 쿠키를 읽고 Suspense 안에 있어서, **쿠키를 하나 더 읽어도 새 동적 경계가 안 생긴다**(빌드 표에서 `◐ Partial Prerender`가 유지되는지로 확인).
- DB 컬럼(`team_mem_rel`)으로 빼는 건 기기 간 동기화가 필요할 때만. 마이그레이션 + 이력 함수 동반 갱신이 붙고, **비로그인도 보는 지면이면 애초에 성립하지 않는다.**
- ⚠️ **`unstable_cache`가 팀 공용이면 캐시 키에 개인 설정을 넣지 않는다** — 엔트리가 인원수만큼 갈라져 전 회원 히트율이 떨어진다. 대신 **조회 범위를 모든 설정값의 합집합으로 넓혀 엔트리 하나가 다 서빙**하게 하고, 범위 밖 행은 각 화면이 자기 범위로 거른다. 합집합은 상수로 박지 말고 원래 계산 함수를 실제로 돌려 min/max를 취한다(계산식이 바뀌어도 따라오게).
- ⚠️ **범위를 바꾸면 캐시 키의 버전을 올린다**(`home-calendar-v2-…`). 안 올리면 배포 직후 남아 있는 옛 좁은 범위 엔트리가 만료(1시간)까지 그대로 서빙돼, 설정을 켠 회원의 가장자리 데이터가 **에러 없이 빈다**.
- 새 설정을 함수 인자로 흘릴 땐 **기본값을 두지 않는다.** 기본값이 있으면 넘기기를 빠뜨린 호출부를 `tsc`가 안 잡아 주고, 그 자리만 조용히 기본 범위를 조회한다(화면과 데이터가 서로 다른 범위 → 조용한 누락). 실제로 필수로 두니 storybook 누락을 tsc가 즉시 잡았다.
(2026-08-06 일정탭 주 시작 요일 설정 — `lib/week-start.ts` · `gridFetchRange` · `app/actions/set-week-start.ts`)

### 비활성 안내는 표면마다 짓지 말고 `lib/inactive-notice.ts`가 판정한다
비활성 회원이 막히는 자리는 성격이 셋으로 갈린다 — ① 참여 게이트 다이얼로그(`InactiveGateDialog`, 호출부 13곳) ② 다이얼로그로 갈 길이 아예 없는 전면 차단면(프로필탭) ③ 클라이언트 게이트를 우회했을 때 서버가 던지는 문구(`withActive` — 기강이야기 응원·팻말·한마디·깅스타그램이 사용자에게 보여 주는 **유일한** 설명이다). 자리마다 사유를 꺼내 쓰면 노출 규칙이 흩어져 반드시 어긋난다.
- **판정은 `getVisibleInactiveReason()` 하나.** `inact_rsn_txt` 컬럼 하나가 비활성·탈퇴를 겸하는데 **탈퇴 사유는 안 보여준다** — 관리자 입력칸의 "본인에게 보여요" 경고가 비활성 쪽에만 붙어 있어서, 경고 없이 적힌 탈퇴 메모가 새면 안 된다. 재활성화가 컬럼을 null로 비우지만 상태를 진실로 삼아 한 번 더 막는다.
- **클라이언트가 넘기는 `kind`를 게이트로 쓰지 않는다.** 대회 등록·기록 저장 경로는 `kind`를 클라이언트 스토어에서 파생해 `left`를 구분 못 한다 — 상태 판정은 서버에서만.
- **새 차단 표면을 만들면 사유 문구를 새로 쓰지 말고** `InactiveReasonNote`(사유 칸) / `buildInactiveActionMessage()`(서버 문구) / `useReactivationRequest()`(문의 동작)를 가져다 쓴다. `withActive`가 이미 사유를 싣고 있어 서버 액션 쪽은 대개 손댈 게 없다.
- **관리자 입력칸에 경고를 같이 세운다** — 원래 관리자끼리 보던 메모라 문구가 직설적이다. 노출 범위를 넓히면 입력 시점 경고도 같이 옮긴다(`admin-members-client.tsx` 인라인·일괄 두 곳).
(2026-08-19 비활성 사유 노출 — `lib/inactive-notice.ts` · `components/common/inactive-reason-note.tsx` · `lib/hooks/use-reactivation-request.ts`)

### 다이얼로그를 여는 길이 둘이 되면 조회는 클릭 핸들러가 아니라 `open`에 건다
딥링크(`?social=kakao`, `?ttl=history`)로 기존 다이얼로그를 열 수 있게 만들 때 가장 잘 밟는 함정이다. 원래 이런 다이얼로그는 **클릭 핸들러 안에서** "열기 + 데이터 조회"를 같이 하는데, 딥링크는 `useEffect`에서 `setOpen(true)`만 하므로 **조회가 영영 안 돌아 스피너에 갇힌다.** 크래시도 에러 로그도 없고 타입도 통과해서, 딥링크를 실제로 눌러 보기 전엔 모른다.
- 고치는 방향은 상태를 늘리는 게 아니라 **조회를 `open`에 매다는 것**이다(`useEffect(..., [open])` + `useRef` 가드로 한 번만). 여는 길이 몇 개든 조회 경로는 하나가 된다.
- ⚠️ **그런데 그 이동 자체가 두 번째 버그를 만든다.** 핸들러에서 `setOpen(true)`와 `setLoading(true)`를 같이 부르던 걸 이펙트로 옮기면, React가 **렌더를 먼저 하고 이펙트를 나중에** 돌리므로 `loading=false` + `데이터=미조회` 프레임이 반드시 한 번 지나간다. 그 조합이 "조회했는데 없음"과 같은 화면으로 떨어지면 **멤버에게 "회원가입 하세요"가 다이얼로그 열림 애니메이션 내내 보인다**(실제로 그렇게 신고가 들어왔다). 타이밍을 맞추려 하지 말고 **상태를 유니온 하나로 들어 그 조합을 표현할 수 없게** 만든다(`{kind:"loading"|"member"|"guest"|"error"}`, 초기값 `loading`). 덤으로 실패를 `guest`로 못 박지 않게 되어, 네트워크가 흔들려도 멤버에게 가입 안내가 안 뜬다.
- **이펙트 안에서 동기 `setState`를 하지 않는다** — `react-hooks/set-state-in-effect`가 잡아 준다. 초기값을 `loading`으로 두면 시작 시 상태를 건드릴 이유가 애초에 없다.
- **`renderToStaticMarkup` 렌더 테스트로는 못 잡는다** — effect를 안 돌리고 환경도 jsdom이 아니라 node다. 이 경로는 브라우저 확인이 유일한 검증이라, 딥링크를 붙였으면 "터미널 검증 통과"를 완료로 읽지 않는다.
- 서버 판정은 그대로 둔다: 링크가 새어 나가도 민감값이 안 나가는 건 조회 액션이 세션을 다시 보기 때문이다(`getKakaoChatPassword()` → `getCurrentMember()`). 딥링크를 추가할 때 **클라이언트에서 미리 걸러 두었다는 이유로 서버 판정을 빼지 않는다.**
(2026-08-19 더보기 개편 — `components/social-links.tsx`의 `SocialTiles` · `docs/design/2026-08-19-더보기-소셜-정리.md`)

### supabase-js `.insert()`/`.update()`는 **초과 속성 검사를 안 한다** — 새 컬럼 오타를 tsc가 안 잡는다
`database.types.ts`의 `Insert`/`Update` 타입에 **없는 컬럼을 넘겨도 tsc가 통과한다.** 객체가 제네릭 타입 인자를 거쳐 들어가서 TypeScript의 excess property check가 발동하지 않기 때문이다(객체 리터럴을 변수에 담거나 `...rest`로 스프레드하면 더 확실히 새어 나간다).
- 그래서 **마이그레이션을 아직 안 돌린 상태에서 새 컬럼을 insert/update에 얹으면 조용히 컴파일된다.** 반대로 **같은 컬럼을 `.select()`에 쓰면 즉시 터진다**(`SelectQueryError<"column ... does not exist">`) — 그래서 "select만 고치면 되는구나" 하고 캐스팅으로 덮고 넘어가기 쉬운데, 그때 insert 쪽 오타는 그대로 남아 **런타임에 그 컬럼만 안 들어간다.**
- 컬럼명을 손볼 땐 **gen types를 먼저 돌린다.** 못 돌리는 상황(마이그레이션 미적용)이면 select 캐스팅 자리에 "gen types 후 제거" 주석을 남기고, insert/update 쪽도 같이 훑는다 — 한쪽만 고쳐도 tsc가 아무 말을 안 한다.
- 같은 이유로 **DTO 필드를 `?:`(optional)로 두지 않는다**(`X | null`로). 컴파일러 방어를 두 번 끄는 셈이 된다.
(2026-08-25 모임 참여조건·승인제 — `app/actions/gathering/manage-gathering.ts`)

### 상태가 없는 릴레이션에 "대기" 상태를 얹기 전에 그 릴레이션에 매달린 트리거를 먼저 센다
`gthr_attd_rel`은 **행이 있으면 곧 참석 확정**이라 상태 컬럼이 없고, 그 전제에 70개 파일이 매달려 있다 — 특히 `trg_pt_gthr_attd_rel`(`AFTER INSERT`)이 포인트를 적립한다. 여기에 `st_cd = 'pending'`을 얹었다면 **신청만 해도 포인트가 붙고 활동량·팀 펄스·전광판·유령회원 판정에 잡혔을 것이다.**
- **DB 트리거는 앱 코드에 훅이 없어 grep에도 리뷰에도 안 걸린다**(AGENTS.md 기강포인트 항목과 같은 이야기). "COUNT(*)를 쓰는 곳을 전부 고치면 된다"는 계획은 트리거를 세지 않는다.
- 대안은 **대기를 별도 테이블에 담고 확정되는 순간에만 원래 릴레이션에 INSERT**하는 것이다. 그러면 옵션을 안 켠 기존 행의 코드 경로가 **완전히 그대로**라 회귀 위험이 새 옵션을 켠 행에만 갇힌다.
- 판단 기준 한 줄: **"이 테이블에 행이 생기는 것이 곧 무슨 사건인가"**를 먼저 답한다. 그 사건에 트리거·집계가 걸려 있으면 상태 컬럼으로 의미를 흐리지 않는다.
(2026-08-25 모임 참여조건·승인제 — `docs/superpowers/specs/2026-08-25-모임-참여조건-승인제-design.md` §2)

### 홈 캘린더는 **쓰기 액션이 직접 `updateTag`** 해야 한다 — DB 트리거 웹훅만으론 로컬에서 영영 안 돈다
`/schedule`(일정탭)의 서버 렌더는 `getCachedHomeCalendar`(`unstable_cache`, 1시간)를 읽는데, 무효화를 **DB 트리거 웹훅**(`app/api/revalidate`)에만 맡겨 두면 두 군데서 샌다.
- **웹훅은 배포 URL로 쏜다 → 로컬 개발에선 아예 안 닿는다.** 그래서 로컬에서 만든 모임이 **1시간 동안** 일정탭에 안 나타난다.
- 프로드에서도 웹훅이 쓰는 건 `revalidateTag(tag, "max")`(SWR)이라 **바로 다음 읽기는 낡은 값**이다.
- **증상이 헷갈리는 이유**: 달력 안에서 만들면 `refreshMonthData()`가 **클라이언트에서 RPC를 직접** 불러 즉시 보인다(캐시를 안 거친다). 그래서 **"만들 땐 보였는데 새로고침하니 사라진다"**로 나타나고, DB·RPC를 아무리 뒤져도 멀쩡하다. 실제로 여기서 한 번 헛짚었다 — 원인을 가르는 질문은 **"만든 직후엔 보였나"** 하나다.
- **처방**: 모임 생성·수정·삭제·참석토글·신청/승인/취소 **쓰기 액션마다** `updateTag(HOME_CALENDAR_CACHE_TAG)`. 참석자 수(`attd_count`)도 같은 캐시 payload라 참석 계열도 빠뜨리면 **남의 화면과 새로고침 후 숫자가 최대 1시간 낡는다.**
- ⚠️ **라우트 핸들러에선 `updateTag`가 throw한다**(서버 액션 전용). MCP 도구(`lib/mcp/create-gathering.ts`)처럼 `/route` 아래인 곳은 `revalidateTag(tag, "max")`를 쓴다.
- ⚠️ 태그 상수를 `lib/queries/home-calendar.ts`에서 가져오면 **그 파일의 `import "server-only"`가 딸려 와** 서버 액션 단위 테스트가 `Cannot find package 'server-only'`로 죽는다. 정본은 의존성 없는 `lib/home-calendar-cache-tag.ts`에 둔다(`lib/common-codes-cache-tag.ts`와 같은 이유).
(2026-08-27 모임 참여조건·승인제 — §KNOWLEDGE "저장했는데 안 보임"의 모임 형제. board·대회·기록 형제는 아직 그대로다)

### 같은 테이블로 가는 FK가 둘이면 PostgREST 임베드가 **요청째 거절**된다 — 그걸 `data`만 받으면 "없음"으로 보인다
`gthr_aply_rel` 은 `mem_mst` 로 가는 FK 가 둘이다(`mem_id` 신청자 / `rvw_by` 심사자). 이때 `.select("..., mem_mst(mem_nm)")` 처럼 **관계를 특정하지 않으면** PostgREST 가 어느 FK 인지 몰라 응답 전체를 에러로 돌려준다.
- **증상이 "버그"로 안 보인다**: 호출부가 `const { data } = await ...` 로 error 를 안 보면 `data`가 null → 빈 배열 → 화면엔 **"신청이 없어요"**. 실제로 본인이 대기 중인데 신청 관리 목록이 비어 보였다. 크래시도 로그도 없다.
- **처방**: 임베드에 FK 이름을 박는다 — `mem_mst!gthr_aply_rel_mem_id_fkey(mem_nm, avatar_url)`. 그리고 **`error` 를 반드시 받아 로그로 남긴다**(빈 결과와 실패를 구분할 수 있게).
- **새 테이블을 만들 때 미리 본다**: `mem_mst` 를 두 번 참조하는 컬럼 조합(작성자+처리자, 신청자+승인자, 대상+행위자)은 이 프로젝트에 흔하다 — `gthr_attd_hist`(`mem_id`+`actor_mem_id`)도 같은 모양이다.
(2026-08-27 모임 승인제 신청 명단 — `app/actions/gathering/manage-application.ts`)
