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
/** 기강이야기 전광판 — 운동기록(릴스)이 사는 곳. `?rec=`로 그 장을 연다. */
const STORY = "/story";

/**
 * 딥링크로 붙는 쿼리 키 전부 — **아래 `NOTI_ROUTE`가 만들어 내는 키와 짝이다.**
 *
 * 화면이 딥링크를 처리한 뒤에는 이 키들을 주소에서 지운다(`clearDeepLinkParams`).
 * 안 지우면 새로고침·뒤로가기 때마다 상세가 다시 열려 "닫았는데 또 뜨는" 상태가 된다.
 *
 * **키를 늘리면 여기에도 반드시 더한다.** 실제로 `rec`(운동기록 릴스)이 라우트에만 추가되고
 * 이 목록에서 빠져 있었다 — 그래서 릴스 딥링크만 주소가 남았다. 목록을 라우트 규칙 옆에
 * 둔 이유가 그것이다(예전엔 mini-calendar 안에 사본으로 있어 갱신이 누락됐다).
 */
export const DEEP_LINK_PARAM_KEYS = ["post", "comp", "gthr", "rec"] as const;

/**
 * 처리된 딥링크 쿼리만 현재 URL에서 골라 **동기 제거**한다.
 * 다른 쿼리·해시·경로는 보존한다.
 *
 * ⚠️ **상세를 열기(setOpen) 전에 부를 것.** `router.replace`는 transition이라 다이얼로그의
 * pushState(`useDialogHistoryBack`)가 먼저 쌓인 뒤 그 위 항목만 교체되고, 뒤로가기가 딥링크
 * URL 항목으로 돌아가 상세가 다시 열리는 무한 루프가 생긴다. 네이티브 `replaceState`는 동기
 * 실행이며 Next가 패치해 `useSearchParams`도 함께 동기화된다.
 *
 * 비동기 콜백(fetch `.then`)에서 부를 땐 이펙트의 cancelled 가드를 먼저 통과할 것 — 대상 키만
 * 지우므로 경로는 보존되지만, 페이지를 떠난 뒤의 히스토리 조작 자체가 부수효과다.
 */
export function clearDeepLinkParams(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  for (const key of DEEP_LINK_PARAM_KEYS) url.searchParams.delete(key);
  window.history.replaceState(null, "", url.pathname + url.search + url.hash);
}

/** 댓글 멘션/답글 공용: refType에 따라 대회·모임·운동기록·정보 게시물로 분기 */
function commentTargetRoute(
  refId: string | null,
  refType: string | null,
): string {
  if (refType === "comp")
    return refId ? `${SCHEDULE}?comp=${refId}` : SCHEDULE;
  if (refType === "gathering")
    return refId ? `${SCHEDULE}?gthr=${refId}` : SCHEDULE;
  // 운동기록(기강이야기 릴스)은 `/schedule`이 아니라 **전광판**에 산다 — 저 페이지엔
  // 이 글을 열 화면이 없다. `?post=`를 그대로 흘려보내면 MiniCalendar가 sch_post_id로
  // 읽어 조용히 아무것도 안 여는 게 더 나쁘다(주소는 살아 있는데 화면이 안 뜬다).
  if (refType === "post")
    return refId ? `${STORY}?rec=${refId}` : STORY;
  return refId ? `${SCHEDULE}?post=${refId}` : SCHEDULE;
}

const NOTI_ROUTE: Record<
  string,
  (refId: string | null, refType: string | null) => string | null
> = {
  // 프로필로만 보내면 "무엇이 새로 생겼는지"를 알 길이 없다 — 칭호는 조용히 붙고
  // 카드의 칭호 줄은 이름만 나열하므로 방금 딴 게 어느 것인지 구분되지 않는다.
  // 획득 이력 시트(시간 역순)를 바로 열어 맨 윗줄이 그 답이 되게 한다.
  ttl_grnt: () => "/profile?ttl=history",
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
  // 운동기록 댓글·답글 — 전광판의 그 기록(릴스)을 연다. refId는 post_id.
  post_cmnt: (refId) => (refId ? `${STORY}?rec=${refId}` : STORY),
  post_reply: (refId) => (refId ? `${STORY}?rec=${refId}` : STORY),
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
  // 자동 배치 실패 — 운영진에게만 간다. 결과·이력을 그 자리에서 보고 다시 돌릴 수 있게
  // 배치 관리 화면으로(설계 §3.4). 관리자가 아니면 그 화면이 막으므로 별도 분기는 없다.
  batch_failed: () => "/admin/system/batch",
};

/** 알림 타입+ref로 딥링크 URL을 해석한다. 매핑이 없으면 null. */
export function resolveNotiDeepLink(
  notiTypeEnm: string,
  refId: string | null,
  refTypeEnm: string | null,
): string | null {
  return NOTI_ROUTE[notiTypeEnm]?.(refId, refTypeEnm) ?? null;
}
