# PWA 푸시 알림 설계 문서

> 작성일: 2026-06-21 | 갱신: 2026-06-27 | 상태: **기본 푸시 구현 완료** (모임 리마인더는 미구현 — 섹션 3)
>
> **구현 결과 요약 (2026-06-27)**
> - 테이블 `push_sub_rel` dev+prd 생성 / `lib/env.ts`에 VAPID 3개(public=client, private·subject=server, subject는 mailto·https 형식 검증)
> - `lib/push/send-push.ts`(Node 런타임, 410/404 구독 삭제) · `public/sw.js`(push+notificationclick, url 상대경로 강제, Android 그룹 요약) · `components/service-worker-register.tsx`
> - `lib/push/client.ts`(권한·구독·해제, 데스크톱·iOS미설치 게이트) · `app/actions/push-subscription.ts`(save/delete, withMember 가드)
> - `components/push-permission-prompt.tsx`(첫 진입 soft prompt, 영구 dismiss) · 알림 설정 뷰 맨 위 푸시 on/off 토글
> - `lib/notifications/deep-link.ts`(딥링크 공용 매핑, 인앱+푸시 재사용) · `insertNoti()`에서 INSERT 직후 `sendPushToMember` **fire-and-forget** 호출
> - ⚠️ **남은 수동 작업**: ① Vercel dev/prd 환경변수에 VAPID 등록 ② `public/notification-badge.png`(흰색 단색 badge 아이콘) 준비 — 없으면 Android badge만 기본 대체

---

## 1. 현재 인앱 알림 구조

### 핵심 테이블: `noti_mst`

| 컬럼 | 설명 |
|------|------|
| `noti_id` | UUID PK |
| `mem_id` | 수신 멤버 |
| `team_id` | 팀 |
| `noti_type_enm` | 알림 종류 (아래 목록 참고) |
| `noti_nm` | 알림 제목 |
| `noti_cont` | 알림 본문 |
| `ref_id` | 딥링크 대상 UUID (게더링 ID, 일정 ID 등) |
| `ref_type_enm` | 딥링크 대상 타입 (`gathering`, `comp`, `sch_post`) |
| `read_yn` | 읽음 여부 |
| `del_yn` | 삭제 여부 |
| `crt_at` | 생성일시 |

### 현재 알림 타입 (`noti_type_enm`)

| 타입 | 설명 | 딥링크 |
|------|------|--------|
| `adm_cust` | 관리자 공지 | 없음 |
| `dues_notice` | 회비 안내 | `/profile/dues` |
| `dues_check_req` | 회비 확인 요청 | 없음 |
| `ttl_grnt` | 타이틀 획득 | `/profile` |
| `sch_post_new` | 정보 일정 등록 | `/?post={ref_id}` |
| `sch_post_cmnt` | 정보 일정 댓글 | `/?post={ref_id}` |
| `cmnt_mention` | 댓글 멘션 | ref_type에 따라 분기 |
| `cmnt_reply` | 댓글 답글 | ref_type에 따라 분기 |
| `gthr_new` | 모임 등록 (전체 멤버) | `/?gthr={ref_id}` |
| `gthr_upd` | 참가 모임 수정 (참석자) | `/?gthr={ref_id}` |
| `gthr_del` | 참가 모임 삭제 (참석자) | `/` |
| `gthr_cmnt` | 모임 댓글 | `/?gthr={ref_id}` |
| `gthr_reply` | 모임 답글 | `/?gthr={ref_id}` |
| `gthr_mention` | 모임 멘션 | `/?gthr={ref_id}` |

### 인앱 알림 흐름

```
서버 액션 실행 (댓글 작성, 모임 등록 등)
  └→ noti_mst INSERT (대상 멤버 수만큼 row)
       └→ 알림 탭에서 read_yn=false인 row 카운트 → 빨간 뱃지
            └→ 멤버가 알림 탭 진입 또는 알림 클릭 → read_yn=true
```

### 알림 설정: `noti_pref_cfg`
- 멤버별로 `noti_type_enm` + `enabled_yn` 저장
- enabled_yn=false면 해당 타입 알림 INSERT 안 함

---

## 2. PWA 푸시 알림 설계 (미구현)

### 인앱 알림과의 관계

**푸시 알림과 인앱 알림은 완전히 독립적.**

- 푸시 알림 = 기기 OS가 띄우는 알림. 앱이 꺼져 있어도 도착.
- 인앱 알림 = 앱 열었을 때 알림 탭 빨간 뱃지.

푸시를 껐다고 `noti_mst` INSERT가 멈추는 게 아님.
푸시를 탭해서 앱을 열었다고 `read_yn`이 자동으로 true가 되지 않음.
→ 푸시로 내용 확인해도 인앱 알림 탭에 빨간 뱃지는 그대로 남음.

이는 대부분의 앱(카카오톡, 인스타 등)과 동일한 UX.

### 구현에 필요한 것

**추가 테이블: `push_sub_rel`**
```sql
push_sub_rel (
  sub_id      uuid PK,
  mem_id      uuid FK,
  team_id     uuid FK,
  endpoint    text,       -- PushSubscription endpoint
  p256dh      text,       -- 암호화 키
  auth        text,       -- 암호화 키
  user_agent  text,       -- 기기/브라우저 구분용
  crt_at      timestamptz
)
```
한 멤버가 여러 기기(폰+PC 등) 구독 가능 → 멤버당 여러 row.

**서버: `web-push` 라이브러리 + VAPID 키**
```
VAPID_PUBLIC_KEY   → 클라이언트에서 구독 시 사용 (NEXT_PUBLIC_*)
VAPID_PRIVATE_KEY  → 서버에서 푸시 발송 시 사용 (서버 전용)
VAPID_SUBJECT      → mailto: 또는 사이트 URL (web-push 발송 시 필수)
```
- `pnpm add web-push` + `pnpm add -D @types/web-push` 설치 필요.
- 키 발급: `npx web-push generate-vapid-keys`
- `lib/env.ts`에 위 3개 환경변수 추가 (public 키는 `client` 블록, private/subject는 `server` 블록).
- **런타임 주의**: `web-push`는 Node API 의존 → 발송 코드(`sendPush`)를 호출하는 서버 액션/route는 **Node 런타임**이어야 함 (Edge 런타임 불가).

**Service Worker (푸시 수신 전용)**

> 서비스워커는 캐싱/오프라인 최적화 도구가 아니라, **웹 푸시를 받기 위한 필수 구성요소**다.
> 탭이 닫혀 있어도 OS가 서비스워커를 깨워 `push` 이벤트를 전달하므로, 서비스워커 없이는 푸시 수신 자체가 불가능하다.
> 브라우저는 서비스워커에 등록된 상태에서만 `PushSubscription`을 발급한다.

- 본 프로젝트는 **캐싱 목적의 서비스워커를 쓰지 않으므로**, `push` / `notificationclick`만 처리하는 **얇은 푸시 전용 서비스워커**를 둔다 (수십 줄 규모).
- serwist 완전 제거 상태 → `public/sw.js`를 직접 작성 (빌드로 덮어씌워지지 않음).
- `push` 이벤트 수신 → `showNotification()`
- `notificationclick` 이벤트 → 딥링크 URL로 이동 (이미 열린 탭이 있으면 focus, 없으면 새로 open)
- SW 등록은 클라이언트 컴포넌트(`components/service-worker-register.tsx`)에서 담당 (신규 작성 필요).

**PWA Manifest 보강 (`public/manifest.json`)**

현재 `manifest.json`이 `"name": "App"`에 아이콘 목록만 있는 빈약한 상태 → 푸시(특히 iOS PWA 설치 푸시) 전에 보강 필수.
- `name` / `short_name` / `start_url` / `scope` / `display: "standalone"` / `theme_color` / `background_color` 추가.
- **알림용 아이콘 준비**: 표준 `192x192`, `512x512` PNG + Android 알림 badge용 **단색(흰색 실루엣) 아이콘**(`showNotification`의 `badge`에 사용).

### 발송 흐름

```
서버 액션 실행
  ├→ noti_mst INSERT (인앱 알림, 기존과 동일)
  └→ push_sub_rel 조회 (대상 멤버의 구독 목록)
       └→ web-push로 각 endpoint에 발송
            └→ Service Worker push 이벤트 수신
                 └→ showNotification() 표시
```

**핵심: 발송 지점이 이미 중앙화돼 있음.**
모든 인앱 알림은 `lib/notifications/insert-noti.ts`의 `insertNoti()` 한 곳에서 INSERT되고, `noti_pref_cfg` 설정 체크도 여기서 한다.
→ `insertNoti()` 안에서 INSERT 직후 `sendPush()`를 호출하면, **모든 알림 타입이 자동으로 푸시까지 발송**된다 (개별 서버 액션 수정 불필요).
→ `noti_pref_cfg`로 꺼진 타입은 INSERT 자체를 스킵하므로 푸시도 자동으로 안 나감 — 설계 의도(인앱/푸시 설정 일치)가 공짜로 달성됨.

### 발송 실패 처리

`web-push`가 **410 Gone** 응답을 반환하면 해당 구독이 만료/취소된 것이므로 `push_sub_rel`에서 즉시 삭제.
그 외 일시적 오류(5xx 등)는 콘솔 에러 로깅만 하고 재시도 없이 무시 (알림 특성상 재시도 불필요).

```ts
for (const sub of subscriptions) {
  try {
    await webpush.sendNotification(sub, payload);
  } catch (err: any) {
    if (err.statusCode === 410) {
      // 구독 만료 → DB에서 제거
      await admin.from("push_sub_rel").delete().eq("endpoint", sub.endpoint);
    } else {
      console.error("[push] 발송 실패", err.statusCode, sub.endpoint);
    }
  }
}
```

### 알림 그룹핑 전략

**목표: 폰 알림창에서 기강 앱 알림이 항상 1줄로만 보임. 탭하거나 펼치면 개별 알림 확인 가능.**

#### Android
`isGroupSummary`로 완전히 제어 가능.

```js
// Service Worker에서 개별 알림 표시
showNotification("새 모임이 등록됐습니다", {
  body: "양재천 자유러닝",
  tag: `noti-${notiId}`,
  group: "gigang",
  data: { url: "/?gthr=xxx" },
})

// 그룹 요약 (접혔을 때 보이는 1줄)
const existing = await self.registration.getNotifications({ tag: "gigang-summary" })
showNotification("기강", {
  body: `새 알림 ${existing.length + 1}개`,
  tag: "gigang-summary",
  group: "gigang",
  isGroupSummary: true,
})
```

결과:
- 접힌 상태: "기강 — 새 알림 N개" 1줄
- 펼친 상태: 개별 알림 목록 (인앱 알림 탭과 동일한 내용)

#### iOS (iOS 16.4+)
`group`/`isGroupSummary` 미지원. OS가 앱별로 자동 그룹핑.
- 접힌 상태: "기강 N개의 알림" (OS 기본 표현)
- 펼친 상태: 개별 알림 목록

커스텀 요약 텍스트는 불가능하지만 그룹핑 자체는 자동으로 됨.

### 알림 권한 요청 시점

**정책: 일반 앱처럼 첫 진입 시 권한을 요청한다.**

배포 시점에는 `push_sub_rel`이 비어 있어 아무도 푸시를 못 받는 상태다(푸시는 옵트인 — 사용자가 직접 "허용"해야 구독이 생김). 기존 사용자가 자연스럽게 구독되도록, **앱 진입 시 알림 권한을 한 번 요청**한다.

**요청 규칙**
- **데스크톱은 제외** — 첫 진입 권한 요청은 모바일(iOS·Android)에서만 동작. 데스크톱이면 아무 prompt도 띄우지 않음 (정책 1).
- **iOS 웹(미설치)은 권한 요청 대신 설치 배너 하나만** 노출 (정책 2). 권한 요청은 설치된 PWA에서 진행.
- 로그인/가입이 완료된 멤버가 모바일에서 진입하면, `Notification.permission === "default"`일 때 1회 권한 요청.
- **단, 첫 화면에서 바로 OS 권한창을 띄우지 않는다.** OS 권한창은 거부당하면 재요청이 불가능(영구 차단)하므로, 먼저 **앱 내 안내(soft prompt)**를 한 번 보여주고 사용자가 "알림 받기"를 누르면 그때 실제 `requestPermission()`을 호출한다.
- soft prompt 안내문에 **"나중에 우측 상단 알림 설정에서도 켤 수 있어요"를 처음부터 포함**한다 (거절 전에 미리 고지).
- soft prompt를 닫으면(나중에) 일정 기간(예: 며칠) 다시 띄우지 않음 — `localStorage`에 dismiss 기록. (`PwaInstallPrompt`의 7일 dismiss 패턴 재사용 가능.)
- 이미 `granted`면 조용히 재구독만 갱신, `denied`면 안내만(기기 설정에서 켜도록) 표시하고 OS 요청은 하지 않음.

> **dismiss 동작이 설치 배너와 다름:**
> - 설치 권유 배너 → "일주일간 보지 않기"(7일 후 재노출).
> - 알림 권한 요청 → **거절하면 다시 자동으로 조르지 않음.** 마음 바뀌면 우측 상단 알림 설정에서 직접 켬. (앱이 권한을 반복해 요청하면 거슬리므로.)

> 거부해도 인앱 알림(빨간 뱃지)은 그대로 동작하므로 아무 정보도 놓치지 않는다. 푸시는 부가 채널일 뿐.

**거부 시 안내 (중요) — 안내를 두 군데서 한다**
첫 진입 요청을 거부하더라도, **언제든 우측 상단 알림(벨 아이콘) → 알림 설정에서 푸시 알림을 다시 켤 수 있다**는 점을 알린다.
1. **soft prompt 안내문 (사전 고지)**: 권한 요청 단계에서부터 "나중에 우측 상단 알림 설정에서도 켤 수 있어요" 한 줄을 노출.
2. **거절 직후 토스트 (사후 고지)**: 사용자가 거절하면 하단에 "알림은 우측 상단 알림 설정에서 다시 켤 수 있어요" 토스트를 1회 띄움.
- 알림 설정 뷰의 푸시 토글이 단일 진입점 역할을 하므로, 거부 후에도 사용자가 스스로 찾아와 켤 수 있다.
- (OS 레벨에서 `denied`로 영구 차단된 경우엔 앱에서 권한을 되돌릴 수 없으므로, 토글 시 "기기 설정에서 알림을 허용해 주세요" 안내로 분기.)

**그 외 보조 진입점**
- 모임 신청 완료 직후 등 맥락 있는 지점에서의 재유도 (선택)

### 푸시 알림 on/off 토글 (알림 설정 UI)

우측 상단 벨 아이콘(`components/notifications/notification-bell-icon.tsx`)의 **알림 설정 뷰 맨 위**에, 기존 타입별 토글들과 **별개의 "푸시 알림" on/off 토글**을 추가한다.

- 위치: 알림 설정 목록 최상단 (타입별 설정 `gthr_new`, `gthr_upd` 등보다 위, 구분선으로 분리).
- 의미: 이 기기에서 푸시를 받을지 여부 (= 구독 생성/삭제). 타입별 `noti_pref_cfg`와는 **다른 층위** — 타입 토글은 "어떤 알림을 받을지", 푸시 토글은 "이 기기로 OS 푸시를 받을지"를 제어.
- **ON** → 권한 요청 + `PushSubscription` 발급 + `push_sub_rel`에 저장.
- **OFF** → 구독 해제(`subscription.unsubscribe()`) + `push_sub_rel`에서 해당 endpoint 삭제. (인앱 알림은 그대로 유지.)
- 상태 표시: 현재 `Notification.permission` + 구독 존재 여부로 ON/OFF를 판단해 토글 초기값 반영.
- iOS 웹(미설치)에서는 토글 대신 "홈 화면에 추가하면 알림을 받을 수 있어요" 안내로 분기 (위 분기 로직 재사용).

**iOS vs Android 분기 필수**

iOS Safari는 PWA로 설치(홈 화면 추가)된 경우에만 푸시 알림이 가능.
웹 브라우저에서 그냥 접속한 상태에서는 권한 요청 자체가 불가능.
→ iOS 웹에서는 알림 권한 요청 대신 PWA 설치 안내로 분기해야 함.

> **"권한 먼저 받고 → 설치 유도" 순서는 iOS에서 불가능하다.**
> 1. iOS 웹(미설치)에서는 `Notification.requestPermission()` 호출 자체가 동작하지 않으므로, 설치 전에 권한을 받거나 on으로 만들 방법이 없다.
> 2. 홈 화면에 설치된 PWA는 Safari와 **별도 권한 컨텍스트**라, 설사 웹에서 허용했어도 그 권한이 PWA로 이어지지 않는다.
> → 따라서 iOS의 강제 순서는 **"설치 먼저 → 설치된 PWA 안에서 권한 요청"**이다.
> 설치 동기를 높이려면 안내 문구를 "푸시 알림을 받으려면 홈 화면에 추가하세요"처럼 알림 맥락으로 제시한다.
> (Android/데스크톱은 반대로 웹에서 바로 권한 요청 가능 — 설치 불필요.)

```typescript
const isStandalone =
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as any).standalone === true; // iOS Safari 전용

const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);

if (isIOS && !isStandalone) {
  // 알림 권한 요청 불가 → PWA 설치 안내 (PwaInstallPrompt)
} else {
  // 알림 권한 요청 가능 (iOS Standalone or Android/데스크톱)
  if (Notification.permission === 'default') {
    await Notification.requestPermission();
  } else if (Notification.permission === 'denied') {
    // 재요청 불가 → 기기 설정에서 허용하도록 안내
  }
}
```

| 환경 | 푸시 대상 | 해야 할 것 |
|------|----------|------------|
| iOS Safari (웹) | ○ (설치 후) | **설치 배너 하나만** 노출 (알림 동기 문구) |
| iOS PWA (홈 화면 추가) | ○ | 권한 요청 |
| Android Chrome (웹/PWA) | ○ | 바로 권한 요청 (설치 불필요) |
| 데스크톱 Chrome/Edge | **✕ (대상 아님)** | **아무것도 안 함** (권한 요청 X, 설치 안내 X) |

> **정책 1 — 데스크톱은 푸시 대상에서 제외.**
> 러닝크루 앱 특성상 푸시는 모바일에서만 의미가 있으므로, **데스크톱에서는 푸시 권한 요청도 홈 화면 추가 안내도 하지 않는다.**
> 푸시 권한 요청·설치 배너는 모두 **모바일(iOS·Android)에서만** 동작하도록 게이트한다.
> → 구현: `isIOS() || isAndroid()` 같은 모바일 판별을 추가해 데스크톱이면 early return.

> **정책 2 — iOS 웹에서는 배너를 하나만 띄운다 (설치 배너에 알림 동기 문구).**
> iOS 웹은 결국 "설치 먼저"가 강제되므로, 설치 배너와 알림 배너를 따로 띄우지 않는다.
> 기존 `PwaInstallPrompt` 설치 배너 **하나만** 유지하되, 문구를 "**푸시 알림을 받으려면 홈 화면에 추가하세요**" 같은 알림 동기형으로 제시.
> 설치 → 설치된 PWA에서 권한 요청으로 이어진다. (별도 알림 권유 배너 추가하지 않음.)

> **정책 3 — Android는 설치 없이 바로 권한 요청.**
> 즉 분기는 `isIOS && !isStandalone` → 설치 배너(알림 문구), 그 외 모바일(Android/iOS PWA) → 권한 요청, 데스크톱 → 아무것도 안 함.

기존 `PwaInstallPrompt`에서 standalone 체크 로직을 이미 사용 중이므로 재사용 가능.

### `noti_pref_cfg` 연동
기존 인앱 알림 설정(`enabled_yn`)을 푸시에도 그대로 적용.
특정 타입 알림을 껐으면 `noti_mst` INSERT도, 푸시 발송도 둘 다 안 함.
푸시 전용 on/off는 별도로 추가하지 않음 — 인앱과 푸시 설정을 일치시켜 UX 단순화.

**알림 설정 항목 (인앱 알림 설정 UI)**

| noti_type_enm | 설정 라벨 | 비고 |
|---------------|----------|------|
| `gthr_new` | 모임 등록 | 새 모임 개설 |
| `gthr_upd` | 참가 모임 수정·삭제 | `gthr_del`도 이 설정으로 제어 |
| `ttl_grnt` | 칭호 획득 | |
| `sch_post_new` | 정보 등록 | |

`gthr_upd` / `gthr_del`은 같은 설정 항목(`gthr_upd`)으로 묶어서 on/off 관리.
→ `deleteGathering` 서버 액션도 `gthr_upd` 설정값을 기준으로 필터링. **(완료)**

`gthr_new`, `gthr_upd` 설정 항목 UI 추가 및 `gthr_upd`/`gthr_del` noti_pref_cfg 체크 누락 버그 수정 완료.

---

## 3. 모임 리마인더 (미구현 — 향후 과제)

카카오톡처럼 모임 당일/전날 리마인더를 푸시로 발송하는 기능. 기본 푸시 구현 이후 별도로 진행.

### 설계 방향 (결정 사항)
- **작성자가 리마인더 시각을 설정** (참가자별 설정 X — 인프라 복잡도 대비 실용성 낮음)
- 예: 모임 생성 폼에 "D-1일 오전 9시", "당일 오전 7시" 등 선택지 제공

### 필요한 DB 변경 (`gthr_mst`)
```sql
ALTER TABLE gthr_mst
  ADD COLUMN remind_before_min integer,   -- 모임 시작 몇 분 전에 발송 (null = 리마인더 없음)
  ADD COLUMN remind_sent_yn boolean NOT NULL DEFAULT false;  -- 발송 완료 여부
```

`remind_at`을 직접 저장하지 않고 `stt_at - remind_before_min * interval '1 minute'`으로 계산.
→ 모임 시간이 수정돼도 자동으로 리마인더 시각이 따라감.

### 실행 인프라
- **Supabase Edge Function + cron 트리거** (1분마다 실행)
- pg_cron은 SQL만 실행 가능 → web-push 라이브러리 사용 불가라서 제외

```
[Edge Function — 1분마다]
  → gthr_mst에서 remind_sent_yn=false 이고
    stt_at - remind_before_min분 <= now() 인 모임 조회
  → 해당 모임 참가자(gthr_attd_rel)에게 푸시 발송
  → remind_sent_yn = true 업데이트
```

### 알림 타입
`gthr_remind` 추가 필요 (noti_mst에도 INSERT해서 인앱 알림과 동기화).

---

## 4. 구현 순서 (나중에 진행할 때 참고)

1. `pnpm add web-push` + `@types/web-push` 설치
2. VAPID 키 생성(`npx web-push generate-vapid-keys`) + `lib/env.ts`에 `VAPID_PUBLIC/PRIVATE/SUBJECT` 추가
3. `public/manifest.json` 보강 (name·start_url·display·theme_color 등) + 알림용 아이콘(192/512 + 단색 badge) 준비
4. `push_sub_rel` 테이블 마이그레이션
5. `public/sw.js` Service Worker 작성 (push + notificationclick) — **푸시 수신 전용 얇은 파일**
6. `components/service-worker-register.tsx` 작성 (SW 등록)
7. 클라이언트 구독 로직 (권한 요청 + PushSubscription 발급 + `push_sub_rel` 저장/삭제)
8. **첫 진입 시 권한 요청 (soft prompt)** — iOS 웹은 설치 안내로 분기, 거부 시 "알림 설정에서 켤 수 있음" 안내
9. **알림 설정 뷰 맨 위에 푸시 on/off 토글 추가** (`notification-bell-icon.tsx`)
10. `lib/push/send-push.ts` 유틸 작성 (410 → 구독 삭제 처리 포함, Node 런타임)
11. `insertNoti()`(`lib/notifications/insert-noti.ts`)에 `sendPush()` 연동 → 모든 알림 타입 자동 푸시
12. Android 그룹핑 적용 (isGroupSummary)
8. (별도) 리마인더: gthr_mst 마이그레이션 + Edge Function cron 작성
