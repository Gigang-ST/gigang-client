import { Caption } from "@/components/common/typography";

export type OtherTeamLink = { name: string; href: string };

/**
 * 「울산지부 가입이세요? 여기로 →」 — 다른 팀에 가입하려다 이 주소로 온 사람을 가입 전에 넘겨준다.
 * 가입 폼 **첫 화면**에만 둔다(소개 화면은 건너뛰고 바로 로그인하는 사람이 있어서). 목록은 팀 설정
 * `signup.other_teams`. 경고가 아니라 안내라 primary 색. 글자는 작아도 손가락으로 누르므로 py-2 로 영역을 벌린다.
 */
export function OtherTeamHint({ teams }: { teams: OtherTeamLink[] }) {
  if (teams.length === 0) return null;
  return (
    <div className="-my-2 flex flex-col items-end">
      {teams.map((t) => (
        <a key={t.href} href={t.href} className="py-2">
          <Caption className="text-primary">{t.name} 가입이세요? 여기로 →</Caption>
        </a>
      ))}
    </div>
  );
}
