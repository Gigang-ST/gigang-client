import { LegalLinks } from "@/components/common/legal-links";
import { Caption, Micro } from "@/components/common/typography";
import { nowKST } from "@/lib/dayjs";
import type { FooterContacts } from "@/lib/legal-docs";
import type { StoryCopy } from "@/lib/team-copy";

/**
 * 홈 맨 끝 판권면 — 약관 링크 · 서비스 소개 · 운영·문의 · 로그인으로 받는 정보 · ©.
 *
 * 순서는 보통 서비스 푸터를 따른다: 링크 줄이 맨 위(개인정보 처리방침만 굵게), 운영 정보는 작은 회색 몇 줄, 맨 끝 ©.
 * 본문과 갈라 보이게 전폭 옅은 띠(`bg-secondary`)를 깐다 — 괘선 하나로 가르면 본문 문단처럼 읽혔다(2026-11-23 개편).
 *
 * **로그인 없이 보이는 홈에 있어야 한다**: Google 브랜드 인증이 홈페이지에서 앱 목적 설명과 개인정보처리방침 링크를
 * 찾는다(이슈 #651). 더보기에도 약관 링크가 있지만 심사자는 등록한 홈 주소 한 장만 본다. 서버 렌더 HTML 에 실려야 하므로
 * 상태·effect 없이 순수 마크업으로 두고, 접어 두지도 않는다.
 * 문구는 팀을 따른다 — 소개 문장은 팀 문구(`serviceIntro`), 운영·문의는 약관과 같은 팀 설정(`legal.*`).
 */
export function StoryLegalFooter({
  copy,
  contacts,
}: {
  copy: Pick<StoryCopy, "serviceIntro" | "orgName">;
  contacts: FooterContacts;
}) {
  const rows = [
    contacts.operator && { label: "운영", value: contacts.operator },
    contacts.contact && { label: "문의", value: contacts.contact },
  ].filter((r): r is { label: string; value: string } => !!r);

  return (
    // 위쪽은 링크 줄 자체 히트 영역(py-2)이 여백을 겸해 pt 를 작게 둔다
    <footer aria-label="서비스 안내" className="flex flex-col gap-3 bg-secondary px-6 pb-6 pt-2">
      <LegalLinks />
      <Caption className="block leading-relaxed">{copy.serviceIntro}</Caption>
      {rows.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
          {rows.map((r) => (
            <div key={r.label} className="contents">
              <dt>
                <Micro>{r.label}</Micro>
              </dt>
              <dd className="min-w-0 break-all">
                <Micro className="text-foreground/70">{r.value}</Micro>
              </dd>
            </div>
          ))}
        </dl>
      )}
      <Micro className="block leading-relaxed text-muted-foreground/80">
        Google·카카오 계정으로 로그인하면 이메일·이름·프로필 사진을 받아요.
        <br />
        회원 확인과 모임 신청, 기록 관리에만 쓰여요.
      </Micro>
      <Micro className="text-muted-foreground/70">{`© ${nowKST().year()} ${copy.orgName}`}</Micro>
    </footer>
  );
}
