"use server";

import { revalidateTag } from "next/cache";

import { HOME_CALENDAR_CACHE_TAG } from "@/lib/home-calendar-cache-tag";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createClient } from "@/lib/supabase/server";
import { teamCacheTag } from "@/lib/team-cache-tag";

export async function revalidateCompetitions() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  revalidateTag("competitions", "max");
}

/**
 * **참가 신청**(팀 것)이 바뀐 뒤 — 접속한 팀의 일정·피드 캐시만 비운다.
 *
 * 참가 신청은 팀별 대회 계획(`team_comp_plan_rel`)에 붙어 다른 팀 화면엔 영향이 없다. 예전엔 대회 원본용
 * `revalidateCompetitions()`(전역 `competitions` 태그)를 불러 **모든 팀의 홈 피드**를 다시 계산하게 했고, 정작
 * 이 팀의 일정 캐시는 안 비웠다(#653, PR #649 리뷰). 대회 원본(이름·날짜·종목)을 고친 뒤엔 위 함수를 그대로 쓴다.
 */
export async function revalidateTeamCompetitionPlans() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { teamId } = await getRequestTeamContext();
  revalidateTag(teamCacheTag(HOME_CALENDAR_CACHE_TAG, teamId), "max");
  revalidateTag(teamCacheTag("story-feed", teamId), "max");
}
