"use server";

import { withAdmin } from "@/lib/actions/auth";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 회비 분류(FEE_ITEM_CD) 관리 — **이 팀이 추가한 항목만** 고친다(§lib/fee-items).
 * 기본 분류(공용, team_id NULL)는 코드가 이름으로 쓰고 모든 팀이 같이 보므로 손대지 않는다.
 * service_role 이라 RLS 가 없다 — cd_id 만 받으면 다른 팀 항목·공용 항목도 고쳐지므로 팀 조건을 직접 건다.
 */

const SHARED_LOCKED = "기본 분류는 모든 팀이 같이 써서 바꿀 수 없어요.";

async function getFeeItemGroupId(db: ReturnType<typeof createAdminClient>) {
  const { data } = await db
    .from("cmm_cd_grp_mst")
    .select("cd_grp_id")
    .eq("cd_grp_cd", "FEE_ITEM_CD")
    .eq("vers", 0)
    .eq("del_yn", false)
    .single();
  return data?.cd_grp_id ?? null;
}

export async function addFeeItem({ cd, cdNm, sortOrd }: { cd: string; cdNm: string; sortOrd: number }) {
  return withAdmin(async () => {
    const { teamId } = await getRequestTeamContext();
    if (!cd.trim() || !cdNm.trim()) return { ok: false as const, message: "코드와 항목명을 입력해주세요." };
    if (!/^[a-z][a-z0-9_]*$/.test(cd.trim())) return { ok: false as const, message: "코드는 영문 소문자·숫자·밑줄만 허용됩니다." };

    const db = createAdminClient();
    const cdGrpId = await getFeeItemGroupId(db);
    if (!cdGrpId) return { ok: false as const, message: "FEE_ITEM_CD 그룹을 찾을 수 없습니다." };

    const { data: dup } = await db.from("cmm_cd_mst").select("cd_id").eq("cd_grp_id", cdGrpId).eq("cd", cd.trim()).eq("vers", 0).maybeSingle();
    if (dup) return { ok: false as const, message: "이미 존재하는 코드입니다." };

    // 코드(cd)는 공통코드 전체에서 유일해야 한다(uk_cmm_cd_mst_grp_cd_vers) — 위 중복 검사는 팀을 안 가린다.
    const { error } = await db.from("cmm_cd_mst").insert({ cd_grp_id: cdGrpId, cd: cd.trim(), cd_nm: cdNm.trim(), sort_ord: sortOrd, is_default_yn: false, team_id: teamId, vers: 0, del_yn: false });
    if (error) return { ok: false as const, message: "항목 추가에 실패했습니다." };
    return { ok: true as const, message: null };
  });
}

export async function updateFeeItem({ cdId, cdNm }: { cdId: string; cdNm: string }) {
  return withAdmin(async () => {
    if (!cdNm.trim()) return { ok: false as const, message: "항목명을 입력해주세요." };
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();
    const { data, error } = await db
      .from("cmm_cd_mst")
      .update({ cd_nm: cdNm.trim() })
      .eq("cd_id", cdId)
      .eq("team_id", teamId)
      .eq("vers", 0)
      .select("cd_id");
    if (error) return { ok: false as const, message: "항목 수정에 실패했습니다." };
    if (!data?.length) return { ok: false as const, message: SHARED_LOCKED };
    return { ok: true as const, message: null };
  });
}

export async function reorderFeeItems(items: { cdId: string; sortOrd: number }[]) {
  return withAdmin(async () => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();
    // 이 팀 항목만 순서를 바꾼다 — 공용 항목은 조건에 안 걸려 그대로 남는다(화면도 공용 항목은 못 옮긴다)
    const results = await Promise.all(
      items.map(({ cdId, sortOrd }) =>
        db.from("cmm_cd_mst").update({ sort_ord: sortOrd }).eq("cd_id", cdId).eq("team_id", teamId).eq("vers", 0),
      ),
    );
    // 하나라도 실패하면 클라이언트가 이전 순서로 롤백할 수 있도록 실패를 알린다.
    if (results.some((r) => r.error)) return { ok: false as const, message: "순서 저장에 실패했습니다." };
    return { ok: true as const, message: null };
  });
}

export async function deleteFeeItem(cdId: string) {
  return withAdmin(async () => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();
    const { data: item } = await db.from("cmm_cd_mst").select("cd, team_id").eq("cd_id", cdId).maybeSingle();
    if (!item) return { ok: false as const, message: "항목을 찾을 수 없습니다." };
    if (item.team_id !== teamId) return { ok: false as const, message: SHARED_LOCKED };

    const { count } = await db
      .from("fee_txn_hist")
      .select("txn_id", { count: "exact", head: true })
      .eq("team_id", teamId)
      .eq("fee_item_cd", item.cd);
    if (count && count > 0) return { ok: false as const, message: `이미 ${count}건의 거래에 사용 중인 항목입니다.` };

    const { error } = await db.from("cmm_cd_mst").update({ del_yn: true }).eq("cd_id", cdId).eq("team_id", teamId).eq("vers", 0);
    if (error) return { ok: false as const, message: "항목 삭제에 실패했습니다." };
    return { ok: true as const, message: null };
  });
}
