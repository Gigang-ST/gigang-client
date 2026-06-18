// @ts-check
import { spawnSync } from "node:child_process";

import { serwist } from "@serwist/next/config";

// 배포마다 고유한 revision — git commit hash 또는 UUID 폴백
const revision =
  spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout?.trim() ??
  crypto.randomUUID();

export default serwist({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  // Next.js가 사전 렌더링한 페이지를 자동으로 precache에 추가
  additionalPrecacheEntries: [{ url: "/", revision }],
});
