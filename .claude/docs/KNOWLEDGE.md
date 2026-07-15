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
- **부과 시작 = 앵커 `last_calc_dt` 다음 달**(시드 06-04 → 7월부터; 6월분은 시드에 녹은 것으로 간주 — 기존 증분 동작과 동일). 앵커 없으면 **첫 부과월(`firstChargeMonth`)부터** — 원칙은 가입 당월부터이나, **`JOIN_MONTH_EXEMPT_FROM`(2026-07-01) 이후 가입자는 가입 당월 미부과(다음 달부터)**. `join_dt`는 불변이라 이 조건은 소급 안전하고, 리플레이 특성상 배포 시점과 무관하게 컷오프 이후 가입자 전원에게 자동 적용(백필 불요). 부과 여부를 참조하는 곳(잔액 재계산 fromMonth·참여 감면 배치 대상·퀘스트 카드 표시)은 **반드시 같은 `firstChargeMonth`를 공유**할 것 — 어긋나면 부과 없는 달에 감면이 붙어 공돈이 된다(잔액 RPC에 면제 캡 없음).
- **커서(p_last_calc_at)를 납부 0건이라고 now 로 두면 안 된다** — 업로드 컷오프(매칭 거래가 커서 이전이면 skip)에 걸려 그 회원의 과거 입금이 조용히 소실된다(QS-9). 납부 없으면 앵커 커서, 그마저 없으면 **가입월 초(첫 부과월이 아님!)** — 가입 당월 미부과 회원의 커서를 첫 부과월(미래)로 두면 가입월 중 은행 입금이 컷오프에 걸려 소실된다.
- **리플레이는 과거 증분 시대에 눌어붙은 오차를 자가 치유한다**: dev 전수 대조(161명)에서 137명 정확 일치, 23명은 기대 차이(비활성 회원 당월 미부과), 1명은 06-06 옛 JS 재계산이 근거 이력 없이 +2,000 가산한 것이 교정 대상으로 확인. **배포 직후 전체 재계산 후 원장 diff 를 한 번 훑을 것.**

### 회비 원장 화면은 잔액 스냅샷만 믿지 말고 active 회원으로 한 번 더 좁힌다
`fee_mem_bal_snap`은 파생 스냅샷이라 회원 상태 변경(`team_mem_rel.mem_st_cd='left'|'inactive'`)과 동시에 삭제되지 않는다. 회비 현황에서 탈퇴 처리한 회원을 계속 보여주지 않으려면 `getDuesLedger()`가 `team_mem_rel`의 현재 active 멤버 id를 먼저 구한 뒤 스냅샷을 `.in("mem_id", activeIds)`로 필터링해야 한다. 재계산 액션도 active 회원만 대상으로 하므로 이 화면의 기본 범위는 active가 맞다.

### 딥링크로 다이얼로그를 열 때 URL 정리는 setOpen 전에 네이티브 replaceState로
알림 딥링크(`/?post=`·`/?comp=`·`/?gthr=`)로 상세 다이얼로그를 열고 `router.replace("/")`로 쿼리를 지우는 순서(setOpen → router.replace)는 **무한 재오픈 루프**를 만든다. `router.replace`는 transition이라 실제 히스토리 교체가 다이얼로그의 `useDialogHistoryBack` pushState보다 **늦게** 일어나, 히스토리가 `[이전, "/?gthr=id", "/"]`로 남는다. 뒤로가기(popstate)든 스와이프 닫기(cleanup의 `history.back()`)든 `/?gthr=id` 항목으로 복귀 → `useSearchParams` 동기화 → 딥링크 이펙트 재발동 → 상세 재오픈 반복.
**해결:** 다이얼로그를 열기 **전에** 동기 API `window.history.replaceState(null, "", "/")`를 호출한다(`mini-calendar.tsx`의 `clearDeepLinkParams`). Next 14.1+는 네이티브 push/replaceState를 패치해 `useSearchParams`도 함께 동기화하므로 `router.replace` 후속 호출은 필요 없다.

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

### MCP generate_typescript_types 결과에는 재정렬 노이즈가 섞인다
dev MCP로 `database.types.ts`를 재생성하면 기존 테이블 블록이 diff상 삭제+재추가로 보일 수 있다(예: fee_policy_cfg 44줄). 실제 손실인지 이동인지 `git diff | grep "^+" | grep <이름>`으로 반드시 재확인할 것 — dev/prd drift로 진짜 소실될 수도 있다(TODO의 "스키마 drift" 항목 참조).

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
