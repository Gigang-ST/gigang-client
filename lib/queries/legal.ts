import "server-only";

import { getRequestTeamContext } from "@/lib/queries/request-team";
import { getSiteTeam } from "@/lib/queries/site-metadata";
import { getTeamCopy } from "@/lib/queries/team-copy";
import { LEGAL_DOC_BUILDERS, type LegalDoc, type LegalDocKind } from "@/lib/legal-docs";
import { getTeamCfg } from "@/lib/team-cfg/read";

/**
 * 지금 요청 팀의 약관 문서(`lib/legal-docs.ts`, #658). 요청 주소를 읽으므로 Suspense 안에서만 부른다 — `(info)` 레이아웃의
 * `loading.tsx` 가 그 경계다. 팀 설정은 서버 메모리 1분 캐시라 Vercel 계량 호출이 없다(§lib/team-cfg/read).
 */
export async function getTeamLegalDoc(kind: LegalDocKind): Promise<LegalDoc> {
  const { teamId, teamCd } = await getRequestTeamContext();
  const [copy, site, operator, contact, duesEnabled, titlesEnabled, runningProfileEnabled] = await Promise.all([
    getTeamCopy(),
    getSiteTeam(),
    getTeamCfg(teamId, "legal.operator"),
    getTeamCfg(teamId, "legal.contact"),
    getTeamCfg(teamId, "feature.dues"),
    getTeamCfg(teamId, "feature.titles"),
    getTeamCfg(teamId, "feature.running_profile"),
  ]);
  return LEGAL_DOC_BUILDERS[kind]({
    teamCd,
    crewName: copy.crewName,
    hallName: copy.hallName,
    galleryName: copy.galleryName,
    // 정식(운영) 주소 — dev·로컬에서 열어도 문서엔 운영 주소가 적힌다
    appHost: site?.canonicalOrigin ? new URL(site.canonicalOrigin).host : null,
    operator,
    contact,
    duesEnabled,
    titlesEnabled,
    runningProfileEnabled,
  });
}
