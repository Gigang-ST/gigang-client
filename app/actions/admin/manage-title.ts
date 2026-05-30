"use server";

import { cmmCdRowsForGrp, getCachedCmmCdRows } from "@/lib/queries/cmm-cd-cached";
import { verifyAdmin } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

type TitlePayload = {
  ttlNm: string;
  ttlKindEnm: string;
  ttlCtgrCd: string;
  ttlDesc: string | null;
  sortOrd: number | string;
  useYn: boolean | string;
  condRuleJson: string | null;
  rarityLevel?: number | string;
  ttlGroupCd?: string;
};

type TitleNormalized = {
  ttlNm: string;
  ttlKindEnm: "auto" | "awarded";
  ttlCtgrCd: string;
  ttlDesc: string | null;
  sortOrd: number;
  useYn: boolean;
  condRuleJson: unknown | null;
  rarityLevel: number;
  ttlGroupCd: number | null;
};

function parseNonNegativeInt(value: number | string, label: string): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`${label}는 0 이상의 정수여야 합니다`);
  }
  return n;
}

function parseUseYn(value: boolean | string): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error("사용 여부 값이 올바르지 않습니다");
}

async function normalizePayload(payload: TitlePayload): Promise<TitleNormalized> {
  const ttlNm = payload.ttlNm.trim();
  if (ttlNm.length === 0) {
    throw new Error("칭호명은 필수입니다");
  }

  const ttlKindEnm = payload.ttlKindEnm === "auto" || payload.ttlKindEnm === "awarded"
    ? payload.ttlKindEnm
    : null;
  if (!ttlKindEnm) {
    throw new Error("칭호 유형 값이 올바르지 않습니다");
  }

  const ttlCtgrCd = payload.ttlCtgrCd.trim();
  if (ttlCtgrCd.length === 0) {
    throw new Error("카테고리는 필수입니다");
  }

  const cmmRows = await getCachedCmmCdRows();
  const validCategoryCodes = new Set(
    cmmCdRowsForGrp(cmmRows, "TTL_CTGR_CD").map((row) => row.cd),
  );
  if (!validCategoryCodes.has(ttlCtgrCd)) {
    throw new Error("유효하지 않은 카테고리입니다");
  }

  const ttlDesc = payload.ttlDesc?.trim() ? payload.ttlDesc.trim() : null;
  const sortOrd = parseNonNegativeInt(payload.sortOrd, "정렬 순서");
  const useYn = parseUseYn(payload.useYn);

  let condRuleJson: unknown | null = null;
  if (payload.condRuleJson?.trim()) {
    try {
      condRuleJson = JSON.parse(payload.condRuleJson);
    } catch {
      throw new Error("자동 조건 JSON 형식이 올바르지 않습니다");
    }
  } else if (ttlKindEnm === "auto") {
    throw new Error("자동 유형은 자동 조건(JSON)이 필수입니다");
  }

  const rarityLevelRaw = typeof payload.rarityLevel === "string"
    ? Number(payload.rarityLevel)
    : (payload.rarityLevel ?? 1);
  const rarityLevel = Number.isInteger(rarityLevelRaw) && rarityLevelRaw >= 1 && rarityLevelRaw <= 10
    ? rarityLevelRaw
    : 1;

  const ttlGroupCd = payload.ttlGroupCd?.trim()
    ? (() => {
        const n = Number(payload.ttlGroupCd);
        return Number.isInteger(n) && n > 0 ? n : null;
      })()
    : null;

  return {
    ttlNm,
    ttlKindEnm,
    ttlCtgrCd,
    ttlDesc,
    sortOrd,
    useYn,
    condRuleJson,
    rarityLevel,
    ttlGroupCd,
  };
}

export async function createTitle(payload: TitlePayload) {
  const admin = await verifyAdmin();
  if (!admin) return { ok: false, message: "권한이 없습니다" };

  try {
    const normalized = await normalizePayload(payload);
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();

    const { error } = await db.from("ttl_mst").insert({
      team_id: teamId,
      ttl_kind_enm: normalized.ttlKindEnm,
      ttl_ctgr_cd: normalized.ttlCtgrCd,
      ttl_nm: normalized.ttlNm,
      ttl_desc: normalized.ttlDesc,
      cond_rule_json: normalized.condRuleJson as Json,
      sort_ord: normalized.sortOrd,
      use_yn: normalized.useYn,
      rarity_level: normalized.rarityLevel,
      ttl_group_cd: normalized.ttlGroupCd,
      crt_by: admin.id,
      upd_by: admin.id,
      vers: 0,
      del_yn: false,
    });

    if (error) return { ok: false, message: "칭호 등록에 실패했습니다" };
    return { ok: true, message: null };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "칭호 등록에 실패했습니다",
    };
  }
}

export async function updateTitle(ttlId: string, payload: TitlePayload) {
  const admin = await verifyAdmin();
  if (!admin) return { ok: false, message: "권한이 없습니다" };

  try {
    const normalized = await normalizePayload(payload);
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();

    const { data, error } = await db
      .from("ttl_mst")
      .update({
        ttl_kind_enm: normalized.ttlKindEnm,
        ttl_ctgr_cd: normalized.ttlCtgrCd,
        ttl_nm: normalized.ttlNm,
        ttl_desc: normalized.ttlDesc,
        cond_rule_json: normalized.condRuleJson as Json,
        sort_ord: normalized.sortOrd,
        use_yn: normalized.useYn,
        rarity_level: normalized.rarityLevel,
        ttl_group_cd: normalized.ttlGroupCd,
        upd_by: admin.id,
      })
      .eq("ttl_id", ttlId)
      .eq("team_id", teamId)
      .eq("vers", 0)
      .eq("del_yn", false)
      .select("ttl_id");

    if (error) return { ok: false, message: "칭호 수정에 실패했습니다" };
    if (!data || data.length === 0) return { ok: false, message: "수정할 칭호를 찾을 수 없습니다" };
    return { ok: true, message: null };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "칭호 수정에 실패했습니다",
    };
  }
}

export async function grantTitle(
  ttlId: string,
  teamMemId: string,
  rsn: string | null,
  isPrmy: boolean = false,
) {
  const admin = await verifyAdmin();
  if (!admin) return { ok: false, message: "권한이 없습니다" };

  const { teamId } = await getRequestTeamContext();
  const db = createAdminClient();

  // 이미 보유 여부 확인
  const { data: existing } = await db
    .from("mem_ttl_rel")
    .select("mem_ttl_id")
    .eq("ttl_id", ttlId)
    .eq("team_mem_id", teamMemId)
    .eq("del_yn", false)
    .limit(1);

  if (existing && existing.length > 0) {
    return { ok: false, message: "이미 보유 중인 칭호입니다" };
  }

  // 대표로 설정할 경우 기존 대표 칭호 먼저 해제
  if (isPrmy) {
    await db
      .from("mem_ttl_rel")
      .update({ is_prmy_yn: false })
      .eq("team_mem_id", teamMemId)
      .eq("is_prmy_yn", true)
      .eq("del_yn", false);
  }

  const { error } = await db.from("mem_ttl_rel").insert({
    team_id: teamId,
    ttl_id: ttlId,
    team_mem_id: teamMemId,
    grnt_by_mem_id: admin.id,
    grnt_rsn_txt: rsn?.trim() || null,
    is_prmy_yn: isPrmy,
    vers: 0,
    del_yn: false,
  });

  if (error) return { ok: false, message: "수여에 실패했습니다" };
  return { ok: true, message: null };
}

export async function revokeTitle(memTtlId: string) {
  const admin = await verifyAdmin();
  if (!admin) return { ok: false, message: "권한이 없습니다" };

  const { teamId } = await getRequestTeamContext();
  const db = createAdminClient();

  const { data, error } = await db
    .from("mem_ttl_rel")
    .update({ del_yn: true, upd_by: admin.id })
    .eq("mem_ttl_id", memTtlId)
    .eq("team_id", teamId)
    .eq("del_yn", false)
    .select("mem_ttl_id");

  if (error) return { ok: false, message: "회수에 실패했습니다" };
  if (!data?.length) return { ok: false, message: "수여 내역을 찾을 수 없습니다" };
  return { ok: true, message: null };
}

export async function toggleTitleUseYn(ttlId: string, useYn: boolean) {
  const admin = await verifyAdmin();
  if (!admin) return { ok: false, message: "권한이 없습니다" };

  const { teamId } = await getRequestTeamContext();
  const db = createAdminClient();

  const { data, error } = await db
    .from("ttl_mst")
    .update({ use_yn: useYn, upd_by: admin.id })
    .eq("ttl_id", ttlId)
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false)
    .select("ttl_id");

  if (error) return { ok: false, message: "저장에 실패했습니다" };
  if (!data?.length) return { ok: false, message: "대상 칭호를 찾을 수 없습니다" };
  return { ok: true, message: null };
}
