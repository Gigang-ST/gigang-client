"use server";

import { verifyAdmin } from "@/lib/queries/member";
import { createAdminClient } from "@/lib/supabase/admin";

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
  const adminUser = await verifyAdmin();
  if (!adminUser) return { ok: false as const, message: "권한이 없습니다." };

  if (!cd.trim() || !cdNm.trim()) return { ok: false as const, message: "코드와 항목명을 입력해주세요." };
  if (!/^[a-z][a-z0-9_]*$/.test(cd.trim())) {
    return { ok: false as const, message: "코드는 영문 소문자·숫자·밑줄만 허용됩니다." };
  }

  const db = createAdminClient();
  const cdGrpId = await getFeeItemGroupId(db);
  if (!cdGrpId) return { ok: false as const, message: "FEE_ITEM_CD 그룹을 찾을 수 없습니다." };

  const { data: dup } = await db
    .from("cmm_cd_mst")
    .select("cd_id")
    .eq("cd_grp_id", cdGrpId)
    .eq("cd", cd.trim())
    .eq("vers", 0)
    .maybeSingle();
  if (dup) return { ok: false as const, message: "이미 존재하는 코드입니다." };

  const { error } = await db.from("cmm_cd_mst").insert({
    cd_grp_id: cdGrpId,
    cd: cd.trim(),
    cd_nm: cdNm.trim(),
    sort_ord: sortOrd,
    is_default_yn: false,
    vers: 0,
    del_yn: false,
  });

  if (error) return { ok: false as const, message: "항목 추가에 실패했습니다." };
  return { ok: true as const, message: null };
}

export async function updateFeeItem({ cdId, cdNm }: { cdId: string; cdNm: string }) {
  const adminUser = await verifyAdmin();
  if (!adminUser) return { ok: false as const, message: "권한이 없습니다." };

  if (!cdNm.trim()) return { ok: false as const, message: "항목명을 입력해주세요." };

  const db = createAdminClient();
  const { error } = await db
    .from("cmm_cd_mst")
    .update({ cd_nm: cdNm.trim() })
    .eq("cd_id", cdId)
    .eq("vers", 0);

  if (error) return { ok: false as const, message: "항목 수정에 실패했습니다." };
  return { ok: true as const, message: null };
}

export async function reorderFeeItems(items: { cdId: string; sortOrd: number }[]) {
  const adminUser = await verifyAdmin();
  if (!adminUser) return { ok: false as const, message: "권한이 없습니다." };

  const db = createAdminClient();
  await Promise.all(
    items.map(({ cdId, sortOrd }) =>
      db.from("cmm_cd_mst").update({ sort_ord: sortOrd }).eq("cd_id", cdId).eq("vers", 0),
    ),
  );
  return { ok: true as const, message: null };
}

export async function deleteFeeItem(cdId: string) {
  const adminUser = await verifyAdmin();
  if (!adminUser) return { ok: false as const, message: "권한이 없습니다." };

  const db = createAdminClient();

  // 사용 중인 거래가 있는지 확인
  const { data: item } = await db.from("cmm_cd_mst").select("cd").eq("cd_id", cdId).single();
  if (!item) return { ok: false as const, message: "항목을 찾을 수 없습니다." };

  const { count } = await db
    .from("fee_txn_hist")
    .select("txn_id", { count: "exact", head: true })
    .eq("fee_item_cd", item.cd);

  if (count && count > 0) {
    return { ok: false as const, message: `이미 ${count}건의 거래에 사용 중인 항목입니다.` };
  }

  const { error } = await db.from("cmm_cd_mst").update({ del_yn: true }).eq("cd_id", cdId).eq("vers", 0);
  if (error) return { ok: false as const, message: "항목 삭제에 실패했습니다." };
  return { ok: true as const, message: null };
}
