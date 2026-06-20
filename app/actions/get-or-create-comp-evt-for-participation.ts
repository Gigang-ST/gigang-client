"use server";

import { compEvtTypeContainsHangul } from "@/lib/comp-evt-type";
import { ensureTeamCompPlanRel } from "@/lib/queries/ensure-team-comp-plan-rel";
import { withMember } from "@/lib/actions/auth";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import {
  normalizeCompEvtType,
  resolveOrCreateCompEvtId,
} from "@/lib/server/comp-evt-cfg";
import { createAdminClient } from "@/lib/supabase/admin";

export async function getOrCreateCompEvtIdForParticipation(
  competitionId: string,
  rawEventType: string,
): Promise<{ ok: true; compEvtId: string } | { ok: false; message: string }> {
  return withMember(async ({ supabase }) => {
    const upper = normalizeCompEvtType(rawEventType);
    if (!upper) return { ok: false, message: "참가 종목을 선택하거나 입력해 주세요." };
    if (compEvtTypeContainsHangul(upper)) {
      return { ok: false, message: "종목은 한글을 사용할 수 없습니다. 영문·숫자로 입력해 주세요." };
    }

    const { teamId } = await getRequestTeamContext();
    const ensured = await ensureTeamCompPlanRel(supabase, teamId, competitionId);
    if (!ensured.ok) return { ok: false, message: "대회 플랜을 확인하지 못했습니다." };

    const admin = createAdminClient();
    const resolved = await resolveOrCreateCompEvtId(admin, competitionId, upper);
    if (!resolved.ok) return { ok: false, message: resolved.message };
    return { ok: true, compEvtId: resolved.compEvtId };
  });
}
