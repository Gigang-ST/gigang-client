"use server";

import { withAdmin } from "@/lib/actions/auth";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 회비 프로젝트(모금) 생성. 활성 이름 중복은 유니크 인덱스(uk_fee_prj_mst_team_nm)가 막는다.
 */
export async function createProject(input: { name: string; memo?: string | null }) {
  return withAdmin(async ({ member }) => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();

    const name = input.name.trim();
    if (!name) return { ok: false as const, message: "프로젝트 이름을 입력해 주세요." };

    const { data, error } = await db
      .from("fee_prj_mst")
      .insert({
        team_id: teamId,
        prj_nm: name,
        memo_txt: input.memo?.trim() || null,
        created_by: member.id,
        st_cd: "active",
        vers: 0,
        del_yn: false,
      })
      .select("prj_id")
      .single();

    if (error) {
      if (error.code === "23505") {
        return { ok: false as const, message: "같은 이름의 프로젝트가 이미 있습니다." };
      }
      return { ok: false as const, message: "프로젝트 생성에 실패했습니다." };
    }
    return { ok: true as const, message: null, prjId: data.prj_id };
  });
}

/**
 * 프로젝트 모금 상태 변경. closed 되면 인박스 선택지에서 빠진다(이미 귀속된 거래는 유지).
 */
export async function setProjectStatus(prjId: string, stCd: "active" | "closed") {
  return withAdmin(async () => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();

    const { data, error } = await db
      .from("fee_prj_mst")
      .update({ st_cd: stCd })
      .eq("team_id", teamId)
      .eq("prj_id", prjId)
      .eq("del_yn", false)
      .select("prj_id");

    if (error) return { ok: false as const, message: "상태 변경에 실패했습니다." };
    if (!data?.length) return { ok: false as const, message: "프로젝트를 찾을 수 없습니다." };
    return { ok: true as const, message: null };
  });
}
