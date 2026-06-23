# PWA 푸시 알림 설계 문서

> 작성일: 2026-06-21 | 상태: 설계 단계 (미구현)

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
VAPID_PUBLIC_KEY   → 클라이언트에서 구독 시 사용
VAPID_PRIVATE_KEY  → 서버에서 푸시 발송 시 사용
```

**Service Worker: `public/sw.js`**
- serwist 완전 제거 상태 → `public/sw.js`를 직접 작성 (빌드로 덮어씌워지지 않음)
- `push` 이벤트 수신 → `showNotification()`
- `notificationclick` 이벤트 → 딥링크 URL로 이동
- SW 등록은 클라이언트 컴포넌트(`components/service-worker-register.tsx`)에서 담당 (재작성 필요)

### 발송 흐름

```
서버 액션 실행
  ├→ noti_mst INSERT (인앱 알림, 기존과 동일)
  └→ push_sub_rel 조회 (대상 멤버의 구독 목록)
       └→ web-push로 각 endpoint에 발송
            └→ Service Worker push 이벤트 수신
                 └→ showNotification() 표시
```

기존 서버 액션에 `sendPush(memberIds, { title, body, url })` 한 줄 추가하는 방식.
기존 코드 변경 최소화.

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

권한을 바로 요청하면 거부율이 높음. 맥락이 있을 때 유도하는 게 표준.

**권장 시점**
- 모임 신청 완료 직후 → "모임 당일 알림 받으시겠어요?"
- 캘린더 페이지 진입 시 → "다가오는 일정 알림 받으시겠어요?"
- 가입 완료 후 온보딩 마지막 단계
- 설정 > 알림 메뉴 (사용자가 직접 찾아온 경우)

거부해도 인앱 알림은 정상 동작.

**iOS vs Android 분기 필수**

iOS Safari는 PWA로 설치(홈 화면 추가)된 경우에만 푸시 알림이 가능.
웹 브라우저에서 그냥 접속한 상태에서는 권한 요청 자체가 불가능.
→ iOS 웹에서는 알림 권한 요청 대신 PWA 설치 안내로 분기해야 함.

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

| 환경 | 가능 여부 | 해야 할 것 |
|------|----------|------------|
| iOS Safari (웹) | 불가 | PWA 설치 안내 |
| iOS PWA (홈 화면 추가) | 가능 | 권한 요청 |
| Android Chrome (웹/PWA) | 가능 | 권한 요청 |
| 데스크톱 Chrome/Edge | 가능 | 권한 요청 |

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

## 3. 구현 순서 (나중에 진행할 때 참고)

1. VAPID 키 생성 + `lib/env.ts`에 환경변수 추가
2. `push_sub_rel` 테이블 마이그레이션
3. `public/sw.js` Service Worker 작성 (push + notificationclick)
4. 클라이언트 구독 등록 UI (설정 페이지 또는 온보딩)
5. `lib/push/send-push.ts` 유틸 작성
6. 기존 서버 액션에 `sendPush()` 연동
7. Android 그룹핑 적용
