import { josa, josaOf } from "@/lib/josa";

/**
 * 정기 모임 안내 문장 — 팀 설정 `gathering.regular_intro`(이름 + 일정). 가입 마지막 「참석 약속」 단계와 관리자 「팀 설정」 미리보기가
 * 같은 함수를 쓴다(한쪽만 고치면 미리보기와 실제 화면이 갈린다). 예전엔 「정기런(격주 수요일)」이 화면에 박혀 울산 가입자에게도
 * 떴다(2026-11-27). 설정이 없으면 요일 없는 중립 문장 — 모르는 일정을 지어내지 않는다.
 */
export type RegularIntro = { name: string; when: string };

/** 「정기런(격주 수요일 저녁)을 추천해요」 — 조사는 이름 받침을 따른다 */
export function regularIntroLine(name: string, when: string): string {
  return `${name}(${when})${josaOf(name, "을/를")} 추천해요`;
}

/** 참석 약속 첫 화면 추천 문장 */
export function pledgeRecommendLine(intro: RegularIntro | null): string {
  return intro ? `${regularIntroLine(intro.name, intro.when)}.` : "가까운 모임에 한 번 나와 보세요.";
}

/**
 * 열린 모임이 없을 때 — 「다음 정기런이 열리면…」 / 「정기런은 **격주 수요일 저녁**에 열려요」.
 * 둘째 줄은 일정만 굵게 그리도록 조각으로 나눠 준다(앞 · 일정 · 뒤).
 */
export function pledgeEmptyLines(intro: RegularIntro | null): {
  next: string;
  when: { before: string; when: string; after: string } | null;
} {
  if (!intro) return { next: "다음 모임이 열리면 가장 먼저 알려드릴게요 🏃", when: null };
  return {
    next: `다음 ${josa(intro.name, "이/가")} 열리면 가장 먼저 알려드릴게요 🏃`,
    when: { before: `${josa(intro.name, "은/는")} `, when: intro.when, after: "에 열려요." },
  };
}
