import { currentMonthKST, dayjs, todayKST } from "@/lib/dayjs";

/**
 * 기강 활동량 — 표시 규칙 한 곳.
 *
 * 원장은 `pt_txn_hist`지만 **화면에서는 "포인트"라는 말을 쓰지 않는다.** 명칭은 "활동량"으로
 * 통일한다(기존 "활동지수"/"활동량" 혼용을 여기서 정리). 숫자(증감량)는 공개하되 제도 이름은
 * 노출하지 않는다는 게 현재 운영 방침이다.
 *
 * 집계는 **매달** — `aply_dt`가 이번 달인 행만 합산하고 1일에 0부터 다시 시작한다.
 * (설계서 `docs/design/2026-07-04-기강포인트제도.md`는 연 단위 윈도우를 적었지만
 *  운영 판단으로 월 단위로 간다. 원장은 그대로 두고 집계 윈도우만 자르므로 리셋 배치는 없다.)
 */

/** `pt_actv_type_enm` → 화면 라벨. DB enum과 1:1 — 값이 늘면 여기도 늘린다 */
const ACTV_TYPE_LABEL: Record<string, string> = {
  regular_attend: "정모 참석",
  gthr_attend: "벙 참석",
  evt_attend: "이벤트 참석",
  gthr_host: "벙 개설",
  comp_join: "대회 참가",
  comp_record: "대회 기록 등록",
  mlg_record: "마일리지런 기록",
  mlg_goal: "마일리지런 목표 달성",
  sch_post: "정보 등록",
  manual: "운영 조정",
};

export function getActvTypeLabel(actvType: string): string {
  return ACTV_TYPE_LABEL[actvType] ?? "활동";
}

/**
 * 이번 달 집계 구간 (KST).
 *
 * `to`가 오늘인 게 핵심이다. 대회 관련 적립은 **개최일**에 귀속되므로(`aply_dt`),
 * 상한이 없으면 11월 대회를 신청한 사람이 7월 집계에 미리 잡힌다.
 */
export function getActvMonthRange(): { from: string; to: string } {
  return { from: `${currentMonthKST()}-01`, to: todayKST() };
}

/** "7월" — 섹션 리드문·내역 시트 제목에 쓴다 */
export function getActvMonthLabel(): string {
  return dayjs().format("M월");
}

/** 활동량 도움말 본문 — 물음표 팝오버와 빈 상태가 같은 문구를 공유한다 */
export const ACTV_HELP_TEXT =
  "모임에 나오고, 대회를 뛰고, 기록을 올릴 때마다 활동량이 쌓입니다. 매달 1일에 0부터 다시 시작해요.";
