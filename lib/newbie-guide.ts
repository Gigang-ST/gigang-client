import { z } from "zod";

/**
 * 신입 안내(`/newbie`)의 팀별 안내 — 「이런 활동을 해요」 칩과 「더 알아보기」 칸 목록(#650, 2026-11-23).
 *
 * 예전엔 기강 운영 안내(안내말씀·회칙·안전수칙·러닝팁)가 화면 코드에 박혀 있어 문구 하나에 배포가 필요했고, 다른 팀(모비)은
 * 「지어내지 않는다」는 이유로 칸이 아예 없었다. 지금은 **팀 설정**(`newbie.activities` · `newbie.sections`)이라 각 팀 운영진이
 * 관리자 「팀 설정」에서 칸을 더하고·지우고·순서를 바꾸고, 본문은 게시판과 같은 마크다운 에디터로 쓴다. 비어 있으면 안 그린다.
 *
 * 순수 데이터·형식이라 설정 사전(서버)·편집 화면(브라우저)·신입 안내(서버)가 같이 읽는다. 아이콘 그림은 화면이 이 키로 고른다.
 */

/** 칸 아이콘 — 정해진 몇 개에서 고른다(자유 입력이면 화면마다 그림 출처가 갈린다) */
export const GUIDE_ICONS = [
  { value: "notice", label: "📋 안내" },
  { value: "rules", label: "📜 회칙" },
  { value: "safety", label: "🛡️ 안전" },
  { value: "tip", label: "💡 팁" },
  { value: "place", label: "📍 장소" },
  { value: "schedule", label: "📅 일정" },
  { value: "info", label: "ℹ️ 기타" },
] as const;
export const GUIDE_ICON_KEYS = GUIDE_ICONS.map((i) => i.value) as [GuideIconKey, ...GuideIconKey[]];
export type GuideIconKey = (typeof GUIDE_ICONS)[number]["value"];

export const guideSectionSchema = z.object({
  /** 드롭다운 제목 */
  title: z.string().trim().min(1, "제목을 넣어 주세요").max(40),
  icon: z.enum(GUIDE_ICON_KEYS),
  /** 본문 — 마크다운(소제목·목록·굵게·표). 엔터 한 번이 그대로 줄바꿈이다(§lib/markdown/remark-soft-breaks) */
  body: z.string().max(5000),
  /** 지우지 않고 잠깐 숨긴다 */
  visible: z.boolean(),
});
export type GuideSection = z.infer<typeof guideSectionSchema>;

export const guideSectionsSchema = z.array(guideSectionSchema).max(20);
export const guideActivitiesSchema = z.array(z.string().trim().min(1).max(20)).max(20);

/** 화면에 세울 칸 — 숨긴 칸과 본문이 빈 칸은 뺀다(빈 드롭다운을 열면 아무것도 없다) */
export function visibleGuideSections(sections: readonly GuideSection[]): GuideSection[] {
  return sections.filter((s) => s.visible && s.body.trim().length > 0);
}
