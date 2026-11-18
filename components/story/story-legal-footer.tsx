import Link from "next/link";

import type { StoryCopy } from "@/lib/team-copy";

/**
 * 홈 맨 끝 안내 — 서비스 소개 · 로그인으로 받는 정보 · 개인정보처리방침/이용약관 링크.
 *
 * 로그인 없이 보이는 홈에 있어야 한다: Google 브랜드 인증이 홈페이지에서 앱 목적 설명과
 * 개인정보처리방침 링크를 찾는다(이슈 #651). 서버 렌더 HTML 에 실려야 하므로 상태·effect 없이
 * 순수 마크업으로 둔다. 크루 이름·호칭은 팀 문구에서 받는다(팀 이름을 박지 않는다).
 */
export function StoryLegalFooter({
  copy,
}: {
  copy: Pick<StoryCopy, "crewName" | "memberNoun">;
}) {
  return (
    <footer
      aria-label="서비스 안내"
      className="flex flex-col gap-2 border-t border-border px-6 py-5 text-[12px] leading-relaxed text-muted-foreground"
    >
      <p>
        {copy.crewName}은 러닝 모임과 대회·기록을 한곳에서 관리하는 크루 서비스예요. 모임 일정을
        확인하고 참석을 신청하며, 대회 출전과 개인 기록을 남기고 함께 나눌 수 있어요.
      </p>
      <p>
        Google·카카오 계정으로 로그인하면 이메일, 이름, 프로필 사진을 받아요. {copy.memberNoun}{" "}
        식별과 모임 신청, 기록 관리에만 쓰여요.
      </p>
      <nav aria-label="약관" className="flex gap-4">
        <Link href="/privacy" className="py-1 underline">
          개인정보처리방침
        </Link>
        <Link href="/terms" className="py-1 underline">
          이용약관
        </Link>
      </nav>
    </footer>
  );
}
