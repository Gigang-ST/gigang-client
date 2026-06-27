"use client";

import { isIOS, isStandalone } from "@/components/in-app-browser-gate";
import { env } from "@/lib/env";

import {
  deletePushSubscription,
  savePushSubscription,
} from "@/app/actions/push-subscription";

/**
 * 클라이언트 푸시 구독 라이브러리.
 * 권한 요청 + PushSubscription 발급/해제 + 서버(push_sub_rel) 동기화를 담당한다.
 *
 * 환경 분기(설계 + iOS 함정 반영):
 * - 데스크톱: 푸시 대상 아님 → canUsePush() = false
 * - iOS 웹(미설치): 권한 요청 불가 → 설치 먼저. canUsePush() = false, needsInstall() = true
 * - iOS PWA(설치) / Android: 권한 요청 가능
 *
 * ⚠️ requestPermission()은 반드시 사용자 제스처(클릭) 안에서 호출할 것.
 *    iOS는 자동/타이머 호출 시 조용히 차단한다.
 */

/** 모바일(iOS·Android) 여부 — 데스크톱은 푸시 대상에서 제외 */
function isAndroid(): boolean {
  if (typeof window === "undefined") return false;
  return /android/i.test(navigator.userAgent);
}

function isMobile(): boolean {
  return isIOS() || isAndroid();
}

function isSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * 모바일 웹(미설치)이라 권한 요청 전에 PWA 설치가 필요한 상태인가.
 * 정책: 웹(브라우저)에서는 푸시 권한을 요청하지 않는다. 웹 권한과 설치된 PWA 권한이
 * 분리돼 혼란을 주므로, iOS·Android 모두 "알림 받으려면 앱 설치"로 통일한다.
 * 설치된 PWA(standalone)에서만 푸시를 켠다.
 */
export function needsInstall(): boolean {
  return isMobile() && !isStandalone();
}

/** 이 환경에서 푸시 구독이 가능한가 (데스크톱·모바일 미설치 제외 → 설치된 PWA만) */
export function canUsePush(): boolean {
  if (!isSupported()) return false;
  if (!isMobile()) return false; // 데스크톱 제외 (정책 1)
  if (needsInstall()) return false; // 모바일 웹은 설치 먼저 (정책 2 — iOS·Android 공통)
  return true;
}

/** 현재 OS 권한 상태 */
export function getPermission(): NotificationPermission | "unsupported" {
  if (!isSupported()) return "unsupported";
  return Notification.permission;
}

/** 푸시 전용 서비스워커를 등록(또는 기존 등록 반환)한다 */
async function getRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return existing;
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

/** base64 VAPID 공개키 → ArrayBuffer (PushManager.subscribe applicationServerKey 형식) */
function urlBase64ToBuffer(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buffer;
}

/** 현재 기기에 활성 구독이 있는지 */
export async function hasSubscription(): Promise<boolean> {
  if (!isSupported()) return false;
  const reg = await navigator.serviceWorker.getRegistration("/");
  if (!reg) return false;
  const sub = await reg.pushManager.getSubscription();
  return sub !== null;
}

type SubscribeResult =
  | { ok: true }
  | { ok: false; reason: "unsupported" | "denied" | "needs-install" | "error" };

/**
 * 푸시 구독을 생성하고 서버에 저장한다.
 * 권한이 default면 요청한다 — 반드시 클릭 핸들러 안에서 호출할 것.
 */
export async function subscribePush(): Promise<SubscribeResult> {
  if (!isSupported() || !isMobile()) return { ok: false, reason: "unsupported" };
  if (needsInstall()) return { ok: false, reason: "needs-install" };

  if (Notification.permission === "default") {
    const result = await Notification.requestPermission();
    if (result !== "granted") return { ok: false, reason: "denied" };
  } else if (Notification.permission === "denied") {
    return { ok: false, reason: "denied" };
  }

  const vapidPublicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) return { ok: false, reason: "unsupported" };

  try {
    const reg = await getRegistration();
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToBuffer(vapidPublicKey),
      });
    }

    const json = sub.toJSON();
    const keys = json.keys ?? {};
    if (!json.endpoint || !keys.p256dh || !keys.auth) {
      return { ok: false, reason: "error" };
    }

    await savePushSubscription({
      endpoint: json.endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: navigator.userAgent,
    });
    return { ok: true };
  } catch {
    return { ok: false, reason: "error" };
  }
}

/**
 * 푸시 구독을 해제하고 서버에서도 삭제한다 (푸시 토글 OFF).
 * ⚠️ 로그아웃 시에는 호출하지 말 것 — iOS는 unsubscribe 후 재구독에 제스처를 요구한다.
 *    명시적 토글 OFF에서만 호출한다.
 */
export async function unsubscribePush(): Promise<void> {
  if (!isSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration("/");
  if (!reg) return;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  await deletePushSubscription(endpoint);
}
