"use server";

import { dayjs } from "@/lib/dayjs";

import { withAdmin } from "@/lib/actions/auth";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";

import { getValidFeeItemCds } from "@/app/actions/dues/validate-fee-item";

type AddManualTxnInput = {
  txnDt: string; // YYYY-MM-DD
  txnIo: "deposit" | "withdrawal";
  amount: number; // 양수
  rawName: string;
  feeItemCd: string;
  memId?: string | null;
  memo?: string | null;
};

const MANUAL_FILE_HASH = "manual-entry-batch";

/**
 * 수동 등록용 가상 업로드 회차를 lazily 확보한다.
 * fee_txn_hist.upd_id 가 NOT NULL 이므로 수동 거래도 회차에 묶어야 한다.
 * 팀별로 단 하나의 "수동등록" 회차를 재사용한다.
 */
async function getOrCreateManualBatch(
  db: ReturnType<typeof createAdminClient>,
  teamId: string,
  memberId: string,
): Promise<string | null> {
  const { data: existing } = await db
    .from("fee_xlsx_upd_hist")
    .select("upd_id")
    .eq("team_id", teamId)
    .eq("file_hash", MANUAL_FILE_HASH)
    .eq("del_yn", false)
    .maybeSingle();

  if (existing) return existing.upd_id;

  const { data: created, error } = await db
    .from("fee_xlsx_upd_hist")
    .insert({
      team_id: teamId,
      file_nm: "수동 등록",
      file_hash: MANUAL_FILE_HASH,
      upd_by_mem_id: memberId,
      upd_st_cd: "confirmed",
      vers: 0,
      del_yn: false,
    })
    .select("upd_id")
    .single();

  if (created) return created.upd_id;

  // 동시 호출로 유니크 위반(23505) 발생 시 — 다른 요청이 먼저 만든 회차를 재조회
  if (error?.code === "23505") {
    const { data: raced } = await db
      .from("fee_xlsx_upd_hist")
      .select("upd_id")
      .eq("team_id", teamId)
      .eq("file_hash", MANUAL_FILE_HASH)
      .eq("del_yn", false)
      .maybeSingle();
    return raced?.upd_id ?? null;
  }

  return null;
}

/**
 * 거래내역 직접 추가 (수동).
 * - 잔액을 일부러 맞추기 위한 보정 거래 등록용.
 * - 회원(memId)을 지정하면 matched, 없으면 unmatched 로 등록.
 * - 회비(due) + matched 인 경우에만 확정 시 회원 잔액에 반영됨.
 * - txn_tm 은 현재 KST 시각으로 채워 중복방지 인덱스 충돌을 피한다.
 */
export async function addManualTransaction(input: AddManualTxnInput) {
  return withAdmin(async ({ member }) => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();

    const rawName = input.rawName.trim();
    if (!rawName) return { ok: false as const, message: "이름(적요)을 입력해 주세요." };
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      return { ok: false as const, message: "금액은 0보다 큰 숫자여야 합니다." };
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.txnDt)) {
      return { ok: false as const, message: "거래일자 형식이 올바르지 않습니다." };
    }
    if (!input.feeItemCd) return { ok: false as const, message: "분류를 선택해 주세요." };

    // 분류 유효성: 공통코드(FEE_ITEM_CD)에 존재하는 cd 인지 검증
    const validCds = await getValidFeeItemCds(db);
    if (!validCds.has(input.feeItemCd)) {
      return { ok: false as const, message: "존재하지 않는 분류입니다. 분류 항목을 확인해 주세요." };
    }

    const updId = await getOrCreateManualBatch(db, teamId, member.id);
    if (!updId) return { ok: false as const, message: "수동 등록 배치 생성에 실패했습니다." };

    // 회원 지정 시 matched, 미지정 시 unmatched
    const memId = input.memId?.trim() || null;
    const matchStatus = memId ? "matched" : "unmatched";

    const now = dayjs().tz("Asia/Seoul");

    const { data: inserted, error } = await db
      .from("fee_txn_hist")
      .insert({
        team_id: teamId,
        upd_id: updId,
        txn_dt: input.txnDt,
        txn_tm: now.format("HH:mm:ss"),
        txn_amt: input.amount,
        txn_io_enm: input.txnIo,
        raw_name: rawName,
        raw_memo: null,
        adm_memo_txt: input.memo?.trim() || "수동 등록",
        txn_tp_txt: "수동등록",
        match_st_cd: matchStatus,
        mem_id: memId,
        fee_item_cd: input.feeItemCd,
        is_cfm_yn: false,
        del_yn: false,
      })
      .select("txn_id, txn_dt, txn_tm, txn_amt, txn_io_enm, raw_name, raw_memo, adm_memo_txt, txn_tp_txt, match_st_cd, mem_id, fee_item_cd, is_cfm_yn, cfm_at")
      .single();

    if (error || !inserted) {
      if (error?.code === "23505") {
        return { ok: false as const, message: "동일한 날짜·금액·이름의 거래가 이미 존재합니다." };
      }
      return { ok: false as const, message: `거래 추가에 실패했습니다. (${error?.code ?? "unknown"})` };
    }

    // 회원명을 곁들여 반환 — 클라이언트가 새로고침 없이 목록에 바로 추가하기 위함
    let memNm: string | null = null;
    if (inserted.mem_id) {
      const { data: m } = await db.from("mem_mst").select("mem_nm").eq("mem_id", inserted.mem_id).maybeSingle();
      memNm = m?.mem_nm ?? null;
    }

    return {
      ok: true as const,
      message: null,
      txn: { ...inserted, mem_mst: memNm ? { mem_nm: memNm } : null, is_stale: false },
    };
  });
}
