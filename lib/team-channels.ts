/**
 * 팀 채널(오픈채팅·인스타·소모임·가민) 주소 — 화면에 넘기는 모양.
 *
 * 값은 팀 설정(`team_cfg` 의 `social.channels`)에서 서버가 읽어 props 로 내려준다
 * (`lib/team-social.ts`). 클라이언트 컴포넌트도 이 타입을 쓰므로 server-only 파일과 나눠 둔다.
 * 비어 있는 채널은 화면에서 칸째 안 그린다 — 기강 주소를 기본값으로 두면 다른 팀 화면에 기강 채널이 뜬다.
 */
export type TeamChannels = {
  kakao_open_chat?: string;
  instagram?: string;
  somoim?: string;
  garmin?: string;
};

export type TeamChannelKey = keyof TeamChannels;

/** 화면에 그리는 순서 — 오픈채팅이 맨 앞(비번 다이얼로그가 붙는 칸) */
export const TEAM_CHANNEL_ORDER: readonly TeamChannelKey[] = ["kakao_open_chat", "instagram", "somoim", "garmin"];

/** 주소가 있는 채널만 순서대로 */
export function listTeamChannels(channels: TeamChannels): { key: TeamChannelKey; href: string }[] {
  return TEAM_CHANNEL_ORDER.flatMap((key) => (channels[key] ? [{ key, href: channels[key] as string }] : []));
}

/** 모임 계좌(팀 설정 `bank.team_account`). 번호는 보이는 형식(하이픈 포함) — 복사할 땐 숫자만 */
export type TeamAccount = { bank: string; number: string; holder: string };
