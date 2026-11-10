import "server-only";

import { cache } from "react";
import { headers } from "next/headers";

import { resolveTeamContextFromHost } from "@/lib/queries/request-team";
import { buildRequestOrigin, pickRequestHost } from "@/lib/request-origin";
import type { SiteMetaInput } from "@/lib/seo/site-metadata";
import { getTeamCfg } from "@/lib/team-cfg/read";
import { canonicalTeamHost } from "@/lib/team-host";
import { getTeamSite } from "@/lib/team-site";

/**
 * 지금 요청의 팀 → 사이트 메타데이터 재료(`buildSiteMetadata` 의 입력). React `cache()` 로 같은 렌더 안에서 한 번.
 *
 * - 팀 설정은 서버 메모리 1분 캐시(`getTeamCfg`)라 화면마다 불러도 DB·Vercel 계량이 늘지 않는다.
 * - **모르는 주소면 `null`** — `getRequestTeamContext()` 처럼 던지지 않는다. 메타데이터는 모든 화면 머리에 붙어서,
 *   던지면 화면 하나가 통째로 에러가 된다(페이지 요청은 proxy 가 먼저 404 로 끊어 보통 여기까지 안 온다).
 * - 루트 레이아웃이 요청 헤더를 읽어도 정적이던 지면이 동적으로 바뀌지 않는다 — 레이아웃에 이미 쿠키를 읽는
 *   Suspense 섬(설치 배너·접속자·알림)이 있어 **모든 지면이 이미 요청마다 그려지고 있다**. 함수 호출이 늘지 않는다.
 */
export const getSiteMetaInput = cache(async (): Promise<SiteMetaInput | null> => {
  const h = await headers();
  const host = pickRequestHost(h.get("x-forwarded-host"), h.get("host"));
  const ctx = resolveTeamContextFromHost(host);
  if (!ctx) return null;

  const [name, title, titleSuffix, description, slogan] = await Promise.all([
    getTeamCfg(ctx.teamId, "brand.name"),
    getTeamCfg(ctx.teamId, "seo.title"),
    getTeamCfg(ctx.teamId, "seo.title_suffix"),
    getTeamCfg(ctx.teamId, "seo.description"),
    getTeamCfg(ctx.teamId, "brand.slogan"),
  ]);

  const canonicalHost = canonicalTeamHost(ctx.teamCd, "prd");
  return {
    canonicalOrigin: canonicalHost ? `https://${canonicalHost}` : null,
    requestOrigin: buildRequestOrigin(host, h.get("x-forwarded-proto")),
    name,
    title,
    titleSuffix,
    description,
    slogan,
    site: getTeamSite(ctx.teamCd),
  };
});
