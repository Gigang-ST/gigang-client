/**
 * 알림 타입별 딥링크 URL 매핑 (서버/클라이언트 공용).
 *
 * 인앱 알림 클릭(notification-item)과 푸시 알림 클릭(sw.js) 둘 다 같은 목적지로
 * 가야 하므로, 라우트 규칙을 이 한 곳에서 정의해 양쪽이 재사용한다.
 */
const NOTI_ROUTE: Record<
  string,
  (refId: string | null, refType: string | null) => string | null
> = {
  ttl_grnt: () => "/profile",
  adm_cust: () => null,
  dues_notice: () => "/profile/dues",
  dues_check_req: () => null,
  sch_post_cmnt: (refId) => (refId ? `/?post=${refId}` : "/"),
  sch_post_new: (refId) => (refId ? `/?post=${refId}` : "/"),
  cmnt_mention: (refId, refType) =>
    refType === "comp"
      ? refId
        ? `/?comp=${refId}`
        : "/"
      : refType === "gathering"
        ? refId
          ? `/?gthr=${refId}`
          : "/"
        : refId
          ? `/?post=${refId}`
          : "/",
  cmnt_reply: (refId, refType) =>
    refType === "comp"
      ? refId
        ? `/?comp=${refId}`
        : "/"
      : refType === "gathering"
        ? refId
          ? `/?gthr=${refId}`
          : "/"
        : refId
          ? `/?post=${refId}`
          : "/",
  gthr_new: (refId) => (refId ? `/?gthr=${refId}` : "/"),
  gthr_upd: (refId) => (refId ? `/?gthr=${refId}` : "/"),
  gthr_del: () => "/",
  gthr_cmnt: (refId) => (refId ? `/?gthr=${refId}` : "/"),
  gthr_reply: (refId) => (refId ? `/?gthr=${refId}` : "/"),
  gthr_mention: (refId) => (refId ? `/?gthr=${refId}` : "/"),
  fdbk_new: () => "/admin/feedback",
  fdbk_rspd: () => "/profile/feedback",
};

/** 알림 타입+ref로 딥링크 URL을 해석한다. 매핑이 없으면 null. */
export function resolveNotiDeepLink(
  notiTypeEnm: string,
  refId: string | null,
  refTypeEnm: string | null,
): string | null {
  return NOTI_ROUTE[notiTypeEnm]?.(refId, refTypeEnm) ?? null;
}
