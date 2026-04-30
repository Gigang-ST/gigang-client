"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { cmmCdRowsForGrp, getCachedCmmCdRows } from "@/lib/queries/cmm-cd-cached";
import { verifyAdmin } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";

type TitlePayload = {
  ttlNm: string;
  ttlKindEnm: string;
  ttlCtgrCd: string;
  ttlDesc: string | null;
  ttlRank: number | string;
  basePt: number | string;
  sortOrd: number | string;
  useYn: boolean | string;
  condRuleJson: string | null;
};

type TitleNormalized = {
  ttlNm: string;
  ttlKindEnm: "auto" | "awarded";
  ttlCtgrCd: string;
  ttlDesc: string | null;
  ttlRank: number;
  basePt: number;
  sortOrd: number;
  useYn: boolean;
  condRuleJson: unknown | null;
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
  const ttlRank = parseNonNegativeInt(payload.ttlRank, "등급");
  const basePt = parseNonNegativeInt(payload.basePt, "기본 점수");
  const sortOrd = parseNonNegativeInt(payload.sortOrd, "정렬 순서");
  const useYn = parseUseYn(payload.useYn);

  let condRuleJson: unknown | null = null;
  if (payload.condRuleJson?.trim()) {
    try {
      condRuleJson = JSON.parse(payload.condRuleJson);
    } catch {
      throw new Error("자동 조건 JSON 형식이 올바르지 않습니다");
    }
  }

  return {
    ttlNm,
    ttlKindEnm,
    ttlCtgrCd,
    ttlDesc,
    ttlRank,
    basePt,
    sortOrd,
    useYn,
    condRuleJson,
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
      ttl_rank: normalized.ttlRank,
      cond_rule_json: normalized.condRuleJson,
      base_pt: normalized.basePt,
      sort_ord: normalized.sortOrd,
      use_yn: normalized.useYn,
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

    const { error } = await db
      .from("ttl_mst")
      .update({
        ttl_kind_enm: normalized.ttlKindEnm,
        ttl_ctgr_cd: normalized.ttlCtgrCd,
        ttl_nm: normalized.ttlNm,
        ttl_desc: normalized.ttlDesc,
        ttl_rank: normalized.ttlRank,
        cond_rule_json: normalized.condRuleJson,
        base_pt: normalized.basePt,
        sort_ord: normalized.sortOrd,
        use_yn: normalized.useYn,
        upd_by: admin.id,
      })
      .eq("ttl_id", ttlId)
      .eq("team_id", teamId)
      .eq("vers", 0)
      .eq("del_yn", false);

    if (error) return { ok: false, message: "칭호 수정에 실패했습니다" };
    return { ok: true, message: null };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "칭호 수정에 실패했습니다",
    };
  }
}
