/**
 * 알림 타입별 딥링크 URL 매핑 (서버/클라이언트 공용).
 *
 * 인앱 알림 클릭(notification-item)과 푸시 알림 클릭(sw.js) 둘 다 같은 목적지로
 * 가야 하므로, 라우트 규칙을 이 한 곳에서 정의해 양쪽이 재사용한다.
 *
 * **딥링크 쿼리(?post=·?comp=·?gthr=)는 반드시 `/schedule`에 붙인다.** 이 쿼리를 읽어
 * 상세를 여는 건 `MiniCalendar`인데 그건 일정 페이지에만 있다. 예전엔 홈(`/`)이 곧
 * 달력이라 `/?gthr=`로 충분했지만, 홈이 전광판으로 바뀌면서(app/(main)/page.tsx의
 * HOME_PAGE) `/`에는 읽는 쪽이 없어졌다 — 주소는 살아 있는데 파라미터만 조용히
 * 무시된다. 홈을 다시 달력으로 되돌리더라도 `/schedule`은 그대로 살아 있으므로
 * 이 경로는 손댈 필요가 없다.
 */
const SCHEDULE = "/schedule";

/** 댓글 멘션/답글 공용: refType에 따라 대회·모임·정보 게시물로 분기 */
function commentTargetRoute(
  refId: string | null,
  refType: string | null,
): string {
  if (refType === "comp")
    return refId ? `${SCHEDULE}?comp=${refId}` : SCHEDULE;
  if (refType === "gathering")
    return refId ? `${SCHEDULE}?gthr=${refId}` : SCHEDULE;
  return refId ? `${SCHEDULE}?post=${refId}` : SCHEDULE;
}

const NOTI_ROUTE: Record<
  string,
  (refId: string | null, refType: string | null) => string | null
> = {
  ttl_grnt: () => "/profile",
  adm_cust: () => null,
  dues_notice: () => "/profile/dues",
  dues_check_req: () => null,
  // 재활성 문의 — 관리자가 바로 그 회원을 처리하도록 회원관리 딥링크(?member=team_mem_id)
  reactivate_req: (refId) => (refId ? `/admin/members?member=${refId}` : "/admin/members"),
  sch_post_cmnt: (refId) => (refId ? `${SCHEDULE}?post=${refId}` : SCHEDULE),
  sch_post_new: (refId) => (refId ? `${SCHEDULE}?post=${refId}` : SCHEDULE),
  cmnt_mention: (refId, refType) => commentTargetRoute(refId, refType),
  cmnt_reply: (refId, refType) => commentTargetRoute(refId, refType),
  gthr_new: (refId) => (refId ? `${SCHEDULE}?gthr=${refId}` : SCHEDULE),
  gthr_upd: (refId) => (refId ? `${SCHEDULE}?gthr=${refId}` : SCHEDULE),
  // 삭제된 모임 — 열 상세가 없으니 일정 목록으로. 홈(전광판)으로 보내면 방금 받은
  // 알림과 아무 상관 없는 화면이 뜬다.
  gthr_del: () => SCHEDULE,
  gthr_cncl: (refId) => (refId ? `${SCHEDULE}?gthr=${refId}` : SCHEDULE),
  gthr_cmnt: (refId) => (refId ? `${SCHEDULE}?gthr=${refId}` : SCHEDULE),
  gthr_reply: (refId) => (refId ? `${SCHEDULE}?gthr=${refId}` : SCHEDULE),
  gthr_mention: (refId) => (refId ? `${SCHEDULE}?gthr=${refId}` : SCHEDULE),
  fdbk_new: () => "/admin/feedback",
  fdbk_rspd: () => "/profile/feedback",
  // 게시판 공지·업데이트 — 새 글이 올라오면 팀 전체에 알림. 클릭 시 그 글 상세로.
  // refId가 post_id라 상세로 바로 가고, 없으면 해당 탭 목록으로 떨어진다.
  brd_notice: (refId) => (refId ? `/board/${refId}` : "/board?tab=notice"),
  brd_update: (refId) => (refId ? `/board/${refId}` : "/board?tab=update"),
  // 뉴비 온보딩 미참석 넛지 — 일정으로 랜딩(설계 §7.1). "나와 보라"는 알림이라
  // 목적지는 달력이어야 한다. 예전 `/`는 홈이 곧 달력이라 성립했지만 지금은 전광판이다.
  newbie_nudge_14: () => SCHEDULE,
  newbie_nudge_28: () => SCHEDULE,
};

/** 알림 타입+ref로 딥링크 URL을 해석한다. 매핑이 없으면 null. */
export function resolveNotiDeepLink(
  notiTypeEnm: string,
  refId: string | null,
  refTypeEnm: string | null,
): string | null {
  return NOTI_ROUTE[notiTypeEnm]?.(refId, refTypeEnm) ?? null;
}
