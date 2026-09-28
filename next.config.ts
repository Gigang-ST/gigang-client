import type { NextConfig } from "next";
import { execSync } from "child_process";
import bundleAnalyzer from "@next/bundle-analyzer";

function getGitVersion(): string {
  try {
    return execSync("git describe --tags --abbrev=0", { encoding: "utf-8" }).trim();
  } catch {
    return "v0.0.0";
  }
}

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
  openAnalyzer: false,
});

const nextConfig: NextConfig = {
  cacheComponents: true,
  env: {
    NEXT_PUBLIC_APP_VERSION: getGitVersion(),
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  /**
   * www → apex 정규화.
   *
   * www.gigang.team이 리다이렉트 없이 200으로 같은 사이트를 그대로 내주고 있었다
   * (2026-09-01 확인). 크롤러 눈에는 같은 내용의 사이트가 두 개라 중복 문서가 되고,
   * 유입 신호도 두 호스트로 쪼개진다. 308로 한 호스트에 모은다.
   *
   * Vercel 대시보드의 도메인 리다이렉트 설정으로도 같은 일을 할 수 있다 —
   * 그쪽을 켜면 이 블록은 중복이니 하나만 남긴다.
   */
  /**
   * 인트로 사진(/crew, /lines)은 내용이 바뀌면 이름이나 폴더가 바뀐다. 그러니 브라우저가
   * 1년간 묻지 않고 써도 된다 — max-age=0이면 버스트에서 프레임마다 재검증이 돌아
   * 깜빡임으로 보인다(랜딩 저장소에서 실측: 24회 → 0회).
   */
  async headers() {
    const year = "public, max-age=31536000, immutable";
    return [
      { source: "/crew/:path*", headers: [{ key: "Cache-Control", value: year }] },
      { source: "/lines/:path*", headers: [{ key: "Cache-Control", value: year }] },
    ];
  },
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.gigang.team" }],
        destination: "https://gigang.team/:path*",
        permanent: true,
      },
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
