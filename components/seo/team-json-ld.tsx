import { getSiteTeam } from "@/lib/queries/site-metadata";
import { buildOrganizationJsonLd, jsonLdScript } from "@/lib/seo/structured-data";
import { getTeamCfg } from "@/lib/team-cfg/read";
import { getTeamSite } from "@/lib/team-site";
import { getTeamChannels } from "@/lib/team-social";

/**
 * 조직 구조화 데이터(JSON-LD) — **들어온 주소의 팀** 것. 검색엔진에 "이 사이트는 어떤 단체인가"를 기계가 읽는 형태로 준다.
 *
 * 요청 주소를 읽으므로 루트 레이아웃의 **Suspense 안**에 둔다(밖에 두면 정적 셸이 막힌다). 예전엔 기강 상수를 정적
 * 셸에 박아 모든 주소에 기강 조직으로 나갔다(2026-11-10 팀별로).
 * 네이버(`Yeti`)·카톡 같은 HTML 봇에겐 Next 가 Suspense 까지 다 기다린 완성 HTML 을 준다(`shouldWaitOnAllReady`) —
 * 스트리밍으로 옮겨도 수집에서 빠지지 않는다. 구글봇은 JS 를 돌린다.
 *
 * 팀 파일 표(`lib/team-site.ts`)에 `organization` 이 없는 팀이면 아무것도 안 그린다.
 */
export async function TeamJsonLd() {
  const team = await getSiteTeam();
  if (!team?.canonicalOrigin) return null;
  const site = getTeamSite(team.teamCd);
  if (!site.organization) return null;

  const [description, channels] = await Promise.all([
    getTeamCfg(team.teamId, "seo.description"),
    getTeamChannels(team.teamId),
  ]);

  const data = buildOrganizationJsonLd({
    organization: site.organization,
    canonicalOrigin: team.canonicalOrigin,
    description,
    channels,
    logo: site.logo,
    image: site.ogImage?.path,
  });

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(data) }} />;
}
