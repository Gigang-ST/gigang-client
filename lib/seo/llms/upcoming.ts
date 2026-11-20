import { dayjs } from "@/lib/dayjs";

/**
 * llms.txt 「다가오는 일정」 섹션 — 순수 포맷터(DB·Next 의존 없음, 테스트 대상).
 *
 * **공개 범위는 OG 공유 카드(`lib/queries/gathering-og.ts`)와 같다**: 모임 이름·시작 시각·장소·종목까지만.
 * 참석자·참석 인원·모임장 이름·설명·연락처·비용은 절대 싣지 않는다(개인정보·운영 정보).
 * 시각은 timestamptz 라 KST 로 찍는다(`formatKST` 규칙 — 서버가 UTC 라 그냥 찍으면 하루 밀린다).
 */

/** 본문 안에서 동적 섹션이 들어갈 자리 표시. 없으면 맨 끝에 붙는다 */
export const LLMS_UPCOMING_SLOT = "{{UPCOMING}}";

export type UpcomingGathering = {
  gthrNm: string;
  /** timestamptz ISO */
  sttAt: string;
  locTxt: string | null;
};

export type UpcomingProject = {
  evtNm: string;
  /** date `YYYY-MM-DD` */
  sttDt: string;
  /** date `YYYY-MM-DD` */
  endDt: string;
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** 한 줄로 만든다 — 모임 이름·장소에 줄바꿈·마크다운 기호가 있어도 목록 구조가 안 깨지게 */
function oneLine(text: string): string {
  return text.replace(/[\r\n]+/g, " ").replace(/[[\]]/g, "").replace(/\s+/g, " ").trim();
}

function formatGatheringTime(sttAt: string): string {
  const kst = dayjs(sttAt).tz("Asia/Seoul");
  return `${kst.format("M월 D일")}(${WEEKDAYS[kst.day()]}) ${kst.format("HH:mm")}`;
}

function formatDateKo(dt: string): string {
  const d = dayjs(dt);
  return d.format("YYYY년 M월 D일");
}

export function buildUpcomingSection(input: {
  gatherings: readonly UpcomingGathering[];
  projects: readonly UpcomingProject[];
  /** 앞으로 며칠치인지(제목에 적는다) */
  days: number;
}): string {
  const { gatherings, projects, days } = input;
  const lines: string[] = [`## 다가오는 일정 (앞으로 ${days}일)`, ""];

  if (gatherings.length === 0) {
    lines.push(`- 앞으로 ${days}일 안에 공개된 모임이 아직 없습니다.`);
  } else {
    for (const g of gatherings) {
      const loc = g.locTxt ? oneLine(g.locTxt) : "";
      lines.push(`- ${formatGatheringTime(g.sttAt)} ${oneLine(g.gthrNm)}${loc ? ` — ${loc}` : ""}`);
    }
  }

  if (projects.length > 0) {
    lines.push("", "### 진행 중인 프로젝트", "");
    for (const p of projects) {
      lines.push(`- ${oneLine(p.evtNm)} (${formatDateKo(p.sttDt)} ~ ${formatDateKo(p.endDt)})`);
    }
  }

  lines.push("", "참석 현황·참석자는 크루원 로그인 뒤 일정 화면(/schedule)에서 볼 수 있습니다.", "");
  return lines.join("\n");
}

/** 정적 본문에 동적 섹션을 끼운다. 자리 표시가 없으면 맨 끝에 붙인다 */
export function composeLlmsTxt(staticBody: string, upcoming: string): string {
  if (staticBody.includes(LLMS_UPCOMING_SLOT)) return staticBody.replace(LLMS_UPCOMING_SLOT, upcoming);
  return `${staticBody.trimEnd()}\n\n${upcoming}`;
}
