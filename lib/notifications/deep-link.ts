/**
 * 알림 타입별 딥링크 URL 매핑 (서버/클라이언트 공용).
 *
 * 인앱 알림 클릭(notification-item)과 푸시 알림 클릭(sw.js) 둘 다 같은 목적지로
 * 가야 하므로, 라우트 규칙을 이 한 곳에서 정의해 양쪽이 재사용한다.
 */
/** 댓글 멘션/답글 공용: refType에 따라 대회·모임·정보 게시물로 분기 */
function commentTargetRoute(
  refId: string | null,
  refType: string | null,
): string {
  if (refType === "comp") return refId ? `/?comp=${refId}` : "/";
  if (refType === "gathering") return refId ? `/?gthr=${refId}` : "/";
  return refId ? `/?post=${refId}` : "/";
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
  sch_post_cmnt: (refId) => (refId ? `/?post=${refId}` : "/"),
  sch_post_new: (refId) => (refId ? `/?post=${refId}` : "/"),
  cmnt_mention: (refId, refType) => commentTargetRoute(refId, refType),
  cmnt_reply: (refId, refType) => commentTargetRoute(refId, refType),
  gthr_new: (refId) => (refId ? `/?gthr=${refId}` : "/"),
  gthr_upd: (refId) => (refId ? `/?gthr=${refId}` : "/"),
  gthr_del: () => "/",
  gthr_cncl: (refId) => (refId ? `/?gthr=${refId}` : "/"),
  gthr_cmnt: (refId) => (refId ? `/?gthr=${refId}` : "/"),
  gthr_reply: (refId) => (refId ? `/?gthr=${refId}` : "/"),
  gthr_mention: (refId) => (refId ? `/?gthr=${refId}` : "/"),
  fdbk_new: () => "/admin/feedback",
  fdbk_rspd: () => "/profile/feedback",
  // 뉴비 온보딩 미참석 넛지 — 홈 일정 섹션으로 랜딩(설계 §7.1)
  newbie_nudge_14: () => "/",
  newbie_nudge_28: () => "/",
};

/** 알림 타입+ref로 딥링크 URL을 해석한다. 매핑이 없으면 null. */
export function resolveNotiDeepLink(
  notiTypeEnm: string,
  refId: string | null,
  refTypeEnm: string | null,
): string | null {
  return NOTI_ROUTE[notiTypeEnm]?.(refId, refTypeEnm) ?? null;
}
