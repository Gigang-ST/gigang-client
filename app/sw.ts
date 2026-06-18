import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist, CacheFirst, NetworkFirst, NetworkOnly, ExpirationPlugin } from "serwist";

// Serwist 빌드 시 precache manifest 주입 위치
declare global {
  interface ServiceWorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  // 빌드 시 자동 생성되는 정적 에셋 precache 목록 (_next/static/**)
  precacheEntries: self.__SW_MANIFEST,
  // 새 SW가 활성화되면 즉시 기존 클라이언트를 제어
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // _next/static/** — 파일명에 해시가 포함되어 있으므로 영구 CacheFirst
    {
      matcher: /\/_next\/static\/.*/i,
      handler: new CacheFirst({
        cacheName: "next-static",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 200,
            maxAgeSeconds: 365 * 24 * 60 * 60, // 1년
          }),
        ],
      }),
    },
    // Google Fonts 등 외부 폰트 — 30일 캐시
    {
      matcher: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
      handler: new CacheFirst({
        cacheName: "google-fonts",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 20,
            maxAgeSeconds: 30 * 24 * 60 * 60, // 30일
          }),
        ],
      }),
    },
    // 이미지 (_next/image 포함, public 이미지, Supabase Storage) — 30일 캐시
    {
      matcher: ({ request }) => request.destination === "image",
      handler: new CacheFirst({
        cacheName: "images",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 150,
            maxAgeSeconds: 30 * 24 * 60 * 60, // 30일
          }),
        ],
      }),
    },
    // Supabase API / REST / Auth — 실시간 데이터이므로 캐싱 안 함
    {
      matcher: /supabase\.co\/.*/i,
      handler: new NetworkOnly(),
    },
    // Next.js API Routes — 캐싱 안 함
    {
      matcher: /\/api\/.*/i,
      handler: new NetworkOnly(),
    },
    // 페이지 네비게이션 — NetworkFirst (오프라인 시 캐시 폴백)
    {
      matcher: ({ request }) => request.mode === "navigate",
      handler: new NetworkFirst({
        cacheName: "pages",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 30,
            maxAgeSeconds: 24 * 60 * 60, // 1일
          }),
        ],
      }),
    },
  ],
});

serwist.addEventListeners();
