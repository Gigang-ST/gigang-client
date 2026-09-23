/**
 * 푸시 수신 전용 서비스워커 (얇은 파일).
 *
 * 이 프로젝트는 캐싱/오프라인 목적의 서비스워커를 쓰지 않는다.
 * 웹 푸시 수신·열린 화면 갱신 신호·알림 클릭 처리만 담당한다.
 * 탭이 닫혀 있어도 OS가 이 서비스워커를 깨워 push 이벤트를 전달한다.
 *
 * ⚠️ serwist/next-pwa 미사용 — 빌드로 덮어쓰이지 않으므로 이 파일을 직접 관리한다.
 */

// 새 SW가 바로 활성화되도록
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    // 페이로드 파싱 실패 시 빈 알림 방지: 본문만 텍스트로 시도
    payload = { title: "기강", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "기강";
  const url = payload.url || "/";
  // 개별 알림만 띄운다. 같은 앱 알림의 "N개" 묶음(접으면 1줄, 펼치면 개별)은
  // 안드로이드 OS가 자동으로 처리하므로 수동 요약을 만들지 않는다.
  event.waitUntil(
    Promise.allSettled([
      self.registration.showNotification(title, {
        body: payload.body || "",
        // icon(우측 large icon): 알림에 표시할 대표 이미지(컬러 로고).
        icon: "/GIGANG.png",
        // badge(상태바 단색 아이콘): 흰색 실루엣 + 투명 배경 전용 PNG.
        badge: "/notification-badge.png",
        tag: payload.tag || `gigang-${Date.now()}`,
        data: { url },
      }),
      notifyOpenWindows(),
    ]).then((results) => {
      // ⚠️ `allSettled`는 **절대 reject하지 않는다.** 격리 자체는 의도다(열린 화면 갱신이
      // OS 알림 표시를 막으면 안 된다). 다만 그대로 두면 표시 실패(권한·쿼터·잘못된 아이콘)가
      // 흔적 없이 사라져, 알림이 안 뜬 이유를 어디서도 알 수 없다. 예전 `waitUntil(show…)`은
      // 적어도 서비스워커 unhandled rejection으로 남았다.
      for (const result of results) {
        if (result.status === "rejected") console.error("[sw] push 처리 실패", result.reason);
      }
    }),
  );
});

/** 알림 내용은 전달하지 않는다 — 열린 페이지가 현재 로그인 계정으로 다시 조회한다. */
async function notifyOpenWindows() {
  const windows = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  for (const client of windows) {
    client.postMessage({ type: "NOTIFICATIONS_CHANGED" });
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // 심층 방어: 서버가 내려준 url이라도 상대경로(앱 내부)만 허용 (open redirect/javascript: 차단)
  const raw = event.notification.data?.url || "/";
  const safeUrl = typeof raw === "string" && raw.startsWith("/") ? raw : "/";

  event.waitUntil(handleClick(safeUrl));
});

async function handleClick(safeUrl) {
  const clientList = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  const sameOrigin = clientList.filter((c) =>
    c.url.startsWith(self.location.origin),
  );

  // 1순위: 이미 목적지와 같은 URL인 탭이 있으면 그 탭만 focus
  const exact = sameOrigin.find(
    (c) => c.url === self.location.origin + safeUrl,
  );
  if (exact && "focus" in exact) return exact.focus();

  // 2순위: 같은 origin 탭을 목적지로 이동 + focus.
  // iOS PWA에서 navigate()가 거부/무시될 수 있으므로 await하고, 실패하면 openWindow로 폴백.
  const first = sameOrigin[0];
  if (first && "focus" in first) {
    try {
      if (first.navigate) await first.navigate(safeUrl);
      return await first.focus();
    } catch {
      // navigate 실패(iOS 등) → 새 창으로 폴백
    }
  }

  // 없거나 폴백: 새 탭으로 open
  if (self.clients.openWindow) return self.clients.openWindow(safeUrl);
}
