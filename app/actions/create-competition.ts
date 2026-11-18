"use server";

import { revalidateTag } from "next/cache";

import { createCompetitionCore, type CompetitionCreateInput } from "@/lib/competition-create";
import { toCompetition } from "@/lib/competition-row";
import { getCachedCmmCdRows } from "@/lib/queries/cmm-cd-cached";
import { withActive } from "@/lib/actions/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 대회 추가(웹). 검증·저장은 `lib/competition-create.ts` 코어를 운영 MCP `create_competition` 과 공유한다 —
 * 여기는 신원(세션)·캐시 무효화만 맡는다.
 */
export async function createCompetition(input: CompetitionCreateInput) {
  return withActive(async ({ member }) => {
    const cmmRows = await getCachedCmmCdRows();
    const result = await createCompetitionCore(createAdminClient(), {
      input,
      memberId: member.id,
      cmmRows,
    });
    if (!result.ok) return { ok: false, message: result.message };

    revalidateTag("competitions", "max");
    return {
      ok: true, message: null,
      // ⚠️ 이 객체는 곧바로 상세 다이얼로그로 들어간다(mini-calendar의 handleCompetitionCreated가
      //    받자마자 연다). 그래서 short_id·crt_by를 둘 다 실어야 한다(COMPETITION_COLUMNS가 묶어 둔다):
      //    - crt_by 없으면 **방금 만든 사람이 자기 대회의 수정 버튼을 못 본다** — 날짜 오타를
      //      알아채는 바로 그 순간이라 이게 빠지면 이 기능의 핵심 동선이 끊긴다
      //    - short_id 없으면 그 화면의 공유 링크가 uuid로 나간다
      competition: toCompetition(result.comp),
    };
  });
}
