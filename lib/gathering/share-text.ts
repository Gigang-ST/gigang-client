/**
 * 모임 공유 문구 조립 — 단톡방 공유 버튼과 카톡 자동 발송이 **같은 함수**를 쓴다.
 *
 * 예전엔 이 조립이 `gathering-detail-dialog.tsx` 안에만 있었다. 서버(액션)에서 같은 문구가
 * 필요해지면서 빼냈다 — 두 벌로 두면 한쪽만 고쳐져 화면 공유문과 톡방 공지가 갈린다.
 *
 * 시각 포맷은 KST 고정(`parseEventTime(...).tz("Asia/Seoul")`). 서버는 UTC라 이걸 빠뜨리면
 * 00~09시 모임이 하루 밀려 나간다(CLAUDE.md §날짜/시간).
 */
import { dayjs, parseEventTime } from "@/lib/dayjs";

/** 문구 조립에 필요한 최소 표면 — 화면 타입(GatheringDetail)과 액션 입력 양쪽이 만족한다. */
export type GatheringShareInput = {
  title: string;
  /** 시작 일시. UTC ISO 또는 날짜 문자열(`parseEventTime`이 KST 자정으로 고정). */
  sttAt: string;
  endAt?: string | null;
  location?: string | null;
  /** 개설자 이름. 없으면 줄째 생략. */
  authorName?: string | null;
  /** 참석 인원. 1명(작성자뿐)이면 생략 — 처음 공유는 항상 1명이라 적을 값이 없다. */
  attendeeCount?: number | null;
  maxCount?: number | null;
  /** 상세로 가는 전체 URL. 없으면 링크 줄을 빼고 조립한다. */
  url?: string | null;
};

/** 모임 상세 딥링크. `?gthr=`를 읽는 건 일정 페이지의 MiniCalendar 뿐이다(홈은 전광판). */
export function buildGatheringShareUrl(origin: string, ref: string): string {
  return `${origin.replace(/\/+$/, "")}/schedule?gthr=${ref}`;
}

/** 시작~종료 표기. 같은 날이면 종료는 시각만. 공유 시트 라벨도 이걸 쓴다. */
export function formatShareDateTime(sttAt: string, endAt?: string | null): string {
  const stt = parseEventTime(sttAt).tz("Asia/Seoul");
  if (!endAt) return stt.format("M/D (ddd) A h:mm");

  const end = parseEventTime(endAt).tz("Asia/Seoul");
  const sameDay = stt.format("YYYY-MM-DD") === end.format("YYYY-MM-DD");
  return `${stt.format("M/D (ddd) A h:mm")} ~ ${sameDay ? end.format("A h:mm") : end.format("M/D (ddd) A h:mm")}`;
}

/**
 * 모임 등록 공유 본문 — 정보 나열이 아니라 "같이 뛰어요 + CTA"로 참여를 유도한다.
 */
export function buildGatheringShareText(g: GatheringShareInput): string {
  const lines = [
    "🏃‍♂️ 같이 뛰어요!",
    "",
    `「${g.title}」`,
    `🗓 ${formatShareDateTime(g.sttAt, g.endAt)}`,
  ];
  if (g.location) lines.push(`📍 ${g.location}`);
  if (g.authorName) lines.push(`🙋 ${g.authorName}`);
  if ((g.attendeeCount ?? 0) >= 2) {
    lines.push(`👥 ${g.maxCount != null ? `${g.attendeeCount}/${g.maxCount}명` : `${g.attendeeCount}명`}`);
  }
  if (g.url) lines.push("", "참여하기 👇", g.url);
  return lines.join("\n");
}

/** 수정 발송에서 무엇이 바뀌었는지. 문구에 그대로 쓰인다. */
export type GatheringChangeKind = "time" | "location";

/**
 * 모임 정보 변경 공지 — 바뀐 항목을 제목 줄에서 밝히고, 본문엔 **바뀐 뒤의 값**을 적는다.
 * (이전 값은 싣지 않는다 — 톡방에서 두 줄을 대조하게 만들면 오히려 헷갈린다)
 */
export function buildGatheringUpdateText(
  g: GatheringShareInput,
  changes: GatheringChangeKind[],
): string {
  const what = changes.includes("time") && changes.includes("location")
    ? "일시·장소가"
    : changes.includes("time")
      ? "일시가"
      : "장소가";

  const lines = [
    `📢 모임 ${what} 변경됐어요`,
    "",
    `「${g.title}」`,
    `🗓 ${formatShareDateTime(g.sttAt, g.endAt)}`,
  ];
  if (g.location) lines.push(`📍 ${g.location}`);
  if (g.url) lines.push("", "확인하기 👇", g.url);
  return lines.join("\n");
}

/**
 * 모임 취소 공지 — **링크를 붙이지 않는다**. 눌러 봐야 없는 모임이라 "왜 안 열리지"만 남는다.
 */
export function buildGatheringCancelText(g: GatheringShareInput): string {
  const lines = [
    "❌ 모임이 취소됐어요",
    "",
    `「${g.title}」`,
    `🗓 ${formatShareDateTime(g.sttAt, g.endAt)}`,
  ];
  if (g.location) lines.push(`📍 ${g.location}`);
  return lines.join("\n");
}

/**
 * 일시·장소가 실제로 바뀌었는지. 시각은 **절대시각**으로 견준다 — 한쪽은 UTC ISO,
 * 다른 쪽은 KST 로컬 문자열로 올라오므로 문자열 비교는 늘 "바뀜"이 된다.
 */
export function detectGatheringChanges(
  prev: { sttAt: string | null; endAt?: string | null; location?: string | null },
  next: { sttAt: string | null; endAt?: string | null; location?: string | null },
): GatheringChangeKind[] {
  const changes: GatheringChangeKind[] = [];

  const sameInstant = (a?: string | null, b?: string | null) => {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return dayjs(a).valueOf() === dayjs(b).valueOf();
  };

  if (!sameInstant(prev.sttAt, next.sttAt) || !sameInstant(prev.endAt, next.endAt)) {
    changes.push("time");
  }
  if ((prev.location ?? null) !== (next.location ?? null)) {
    changes.push("location");
  }
  return changes;
}

