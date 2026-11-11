/**
 * 칭호 기능을 끈 팀(`feature.titles` = false)에서 **사람에게 붙은 칭호를 걷어 낸다** — 대표 칭호·칭호 이펙트·프레임.
 *
 * 기강이야기·전당 데이터는 칭호를 실은 채 캐시돼 오는데(RPC·캐시가 팀 설정을 모른다), 끈 팀 화면에 그대로
 * 넘기면 이미 받아 둔 칭호가 보인다. 그래서 **서버가 화면에 넘기기 직전** 여기서 걷는다. 이펙트·프레임도
 * 칭호로 해금하는 꾸미기라 같이 걷는다. 카드 팝업은 DB 함수가 직접 거른다(`get_public_member_card` — `team_feature_on`).
 * 회귀 테스트 `lib/__tests__/team-titles.test.ts`.
 */

type TitleCarrier = { primary_title?: unknown; badge_effect?: string; frame_cd?: string };

export function withoutTitle<T extends TitleCarrier>(row: T): T {
  return {
    ...row,
    ...("primary_title" in row && { primary_title: null }),
    ...(row.badge_effect !== undefined && { badge_effect: "none" }),
    ...(row.frame_cd !== undefined && { frame_cd: "frame-none" }),
  };
}

/** 목록 전체 — 끈 팀일 때만 걷는다(켠 팀은 그대로 돌려준다) */
export function stripTitlesIfOff<T extends TitleCarrier>(rows: T[], titlesEnabled: boolean): T[] {
  return titlesEnabled ? rows : rows.map(withoutTitle);
}
