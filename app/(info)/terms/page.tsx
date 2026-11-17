import type { Metadata } from "next";
import { LegalDocView } from "@/components/legal/legal-doc-view";
import { getTeamLegalDoc } from "@/lib/queries/legal";
import { getTeamPageDescription } from "@/lib/queries/team-copy";

/**
 * 약관류는 열려 있지만 검색으로 찾아올 지면이 아니다 — 크롤은 열어 두되(Google 브랜드 인증이 링크로 쓴다 — #695)
 * 여기서 `index: false`로 색인을 막는다. 그래도 제목·설명은 고유해야 한다:
 * 비워 두면 루트 값을 상속해 **홈과 같은 제목·설명을 쓰는 문서**가 되고, 네이버는
 * 그걸 중복 문서로 본다(웹마스터 가이드 「동일 설명문 발견」).
 */
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "이용약관",
    // 검색 설명은 팀 기준(§lib/team-copy pageDescription) — 기강은 다듬어 둔 문장 그대로, 다른 팀은 크루 이름으로 만든 중립 문장
    description: await getTeamPageDescription("terms"),
    robots: { index: false, follow: true },
  };
}

/** 본문은 팀별(`lib/legal-docs.ts`) — 울산 주소엔 모보브·운영 주체 기준 문서가 선다(#658) */
export default async function TermsPage() {
  return <LegalDocView doc={await getTeamLegalDoc("terms")} />;
}
