/**
 * 푸시 수신 전용 서비스워커 (얇은 파일).
 *
 * 이 프로젝트는 캐싱/오프라인 목적의 서비스워커를 쓰지 않는다.
 * 오직 웹 푸시 수신(push 이벤트)과 알림 클릭 처리(notificationclick)만 담당한다.
 * 탭이 닫혀 있어도 OS가 이 서비스워커를 깨워 push 이벤트를 전달한다.
 *
 * ⚠️ serwist/next-pwa 미사용 — 빌드로 덮어쓰이지 않으므로 이 파일을 직접 관리한다.
 */

const GROUP_TAG = "gigang";
const SUMMARY_TAG = "gigang-summary";

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
  const options = {
    body: payload.body || "",
    icon: "/android-icon-192x192.png",
    badge: "/android-icon-192x192.png",
    tag: payload.tag || `gigang-${Date.now()}`,
    data: { url },
    // Android: 같은 그룹으로 묶어 알림창에서 1줄로 보이게
    renotify: false,
  };

  event.waitUntil(showWithGroupSummary(title, options));
});

/**
 * 개별 알림을 표시하고, Android에서 그룹 요약(접혔을 때 1줄)을 갱신한다.
 * iOS는 group/isGroupSummary 미지원 — OS가 앱별로 자동 그룹핑하므로 개별 알림만 띄운다.
 */
async function showWithGroupSummary(title, options) {
  await self.registration.showNotification(title, options);

  // 그룹 요약은 Android 계열에서만 의미가 있다. 실패해도 개별 알림은 이미 떴으므로 무시.
  try {
    const existing = await self.registration.getNotifications({
      tag: SUMMARY_TAG,
    });
    // 요약 자신을 제외한 실제 알림 개수
    const all = await self.registration.getNotifications();
    const count = all.filter((n) => n.tag !== SUMMARY_TAG).length;
    if (count > 1) {
      await self.registration.showNotification("기강", {
        body: `새 알림 ${count}개`,
        icon: "/android-icon-192x192.png",
        badge: "/android-icon-192x192.png",
        tag: SUMMARY_TAG,
        data: { url: "/" },
        silent: true,
      });
    }
    void existing;
  } catch {
    // iOS 등 미지원 환경 — 무시
  }
  void GROUP_TAG;
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
