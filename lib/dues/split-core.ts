import { dayjs } from "@/lib/dayjs";

import { filterMemIdsInTeam } from "@/lib/actions/team-scope";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

import { getValidFeeItemCds } from "@/app/actions/dues/validate-fee-item";
import { normalizeSplitLine, splitLinesIssue, type SplitLine } from "@/lib/dues/split-lines";

type Db = SupabaseClient<Database>;

/**
 * 거래 한 건을 금액으로 나눠 줄마다 다른 분류·대상으로 확정한다(#754).
 *
 * 구조: 원거래(부모)는 `del_yn=true` + `split_yn=true` 로 숨기고(재업로드 중복방지 지문은 그대로 남는다),
 * 줄마다 확정된 자식 행을 `split_parent_id` 로 묶어 넣는다. 잔액 재계산·프로젝트 모금액 같은 기존 집계는
 * 자식 행을 일반 확정 거래처럼 센다. 회비(due)+회원 줄만 납부원장을 만든다 — 확정과 같은 규칙.
 *
 * 쓰기가 여럿이라 한 단계라도 실패하면 이미 한 것을 되돌려 "반쯤 나뉜" 상태를 남기지 않는다.
 * 잔액 재계산은 호출자가 한다(반환한 memIds 대상).
 */
export async function splitConfirmCore(
  db: Db,
  {
    teamId,
    actorMemId,
    txnId,
    lines,
    dryRun = false,
  }: {
    teamId: string;
    actorMemId: string;
    txnId: string;
    lines: SplitLine[];
    /** true 면 검증만 하고 아무것도 쓰지 않는다. */
    dryRun?: boolean;
  },
) {
  const { data: txn, error: selErr } = await db
    .from("fee_txn_hist")
    .select(
      "txn_id, txn_dt, txn_tm, txn_amt, txn_bal_amt, txn_io_enm, raw_name, raw_memo, txn_tp_txt, is_cfm_yn, split_yn, split_parent_id, upd_id",
    )
    .eq("team_id", teamId)
    .eq("txn_id", txnId)
    .eq("del_yn", false)
    .maybeSingle();
  if (selErr) return { ok: false as const, message: "거래 조회에 실패했습니다." };
  if (!txn) return { ok: false as const, message: "거래를 찾을 수 없습니다." };
  if (txn.is_cfm_yn) return { ok: false as const, message: "이미 확정된 거래입니다. 확정 취소 후 나눠 주세요." };
  if (txn.split_parent_id || txn.split_yn) return { ok: false as const, message: "이미 나눈 거래입니다." };

  const normalized = lines.map(normalizeSplitLine);
  const issue = splitLinesIssue(txn.txn_io_enm, txn.txn_amt, normalized);
  if (issue) return { ok: false as const, message: issue };

  // 분류가 이 팀에서 쓸 수 있는 코드인지
  const validCds = await getValidFeeItemCds(db, teamId);
  if (normalized.some((l) => !validCds.has(l.feeItemCd))) {
    return { ok: false as const, message: "유효하지 않은 분류가 있습니다." };
  }

  // 회원은 이 팀 회원이어야 한다 — 하나라도 아니면 전체 거부(확정과 같은 경계)
  const memIds = [...new Set(normalized.map((l) => l.memId).filter((v): v is string => Boolean(v)))];
  if (memIds.length > 0) {
    const inTeam = new Set(await filterMemIdsInTeam(db, teamId, memIds));
    if (memIds.some((id) => !inTeam.has(id))) {
      return { ok: false as const, message: "이 팀 회원이 아닌 사람이 지정된 줄이 있습니다." };
    }
  }

  // 귀속 프로젝트는 이 팀 것이어야 한다
  const prjIds = [...new Set(normalized.map((l) => l.prjId).filter((v): v is string => Boolean(v)))];
  if (prjIds.length > 0) {
    const { data: prjs, error: prjErr } = await db
      .from("fee_prj_mst")
      .select("prj_id")
      .eq("team_id", teamId)
      .eq("del_yn", false)
      .in("prj_id", prjIds);
    if (prjErr || (prjs ?? []).length !== prjIds.length) {
      return { ok: false as const, message: "존재하지 않는 프로젝트가 지정된 줄이 있습니다." };
    }
  }

  const affectedMemIds = memIds;
  if (dryRun) return { ok: true as const, message: null, memIds: affectedMemIds, childTxnIds: [] as string[] };

  // 1) 부모를 먼저 선점한다 — 다른 관리자가 동시에 확정·나누기·삭제했다면 0행이라 여기서 멈춘다.
  const nowIso = dayjs().toISOString();
  const { data: claimed, error: claimErr } = await db
    .from("fee_txn_hist")
    .update({ del_yn: true, split_yn: true })
    .eq("team_id", teamId)
    .eq("txn_id", txnId)
    .eq("is_cfm_yn", false)
    .eq("del_yn", false)
    .eq("split_yn", false)
    .select("txn_id");
  if (claimErr) return { ok: false as const, message: "나누기 처리에 실패했습니다." };
  if (!claimed || claimed.length === 0) {
    return { ok: false as const, message: "다른 곳에서 먼저 처리된 거래입니다. 새로고침 후 다시 확인하세요." };
  }

  const childIds: string[] = [];
  const rollback = async () => {
    if (childIds.length) {
      await db.from("fee_due_pay_hist").delete().eq("team_id", teamId).in("src_txn_id", childIds);
      await db.from("fee_txn_hist").delete().eq("team_id", teamId).in("txn_id", childIds);
    }
    await db.from("fee_txn_hist").update({ del_yn: false, split_yn: false }).eq("team_id", teamId).eq("txn_id", txnId);
  };

  // 2) 줄마다 확정된 자식 행
  const { data: children, error: insErr } = await db
    .from("fee_txn_hist")
    .insert(
      normalized.map((l) => ({
        team_id: teamId,
        upd_id: txn.upd_id,
        txn_dt: txn.txn_dt,
        txn_tm: txn.txn_tm,
        txn_amt: l.amt,
        txn_bal_amt: txn.txn_bal_amt,
        txn_io_enm: txn.txn_io_enm,
        raw_name: txn.raw_name,
        raw_memo: txn.raw_memo,
        txn_tp_txt: txn.txn_tp_txt,
        match_st_cd: l.memId ? "matched" : "unmatched",
        mem_id: l.memId,
        fee_item_cd: l.feeItemCd,
        project_id: l.prjId,
        is_cfm_yn: true,
        cfm_by_mem_id: actorMemId,
        cfm_at: nowIso,
        del_yn: false,
        split_parent_id: txnId,
      })),
    )
    .select("txn_id, txn_amt, fee_item_cd, mem_id, txn_dt");
  if (insErr || !children || children.length !== normalized.length) {
    // 일부만 들어갔을 수 있으니 부모 기준으로 자식을 찾아 지운다
    const { data: partial } = await db.from("fee_txn_hist").select("txn_id").eq("team_id", teamId).eq("split_parent_id", txnId);
    childIds.push(...(partial ?? []).map((r) => r.txn_id));
    await rollback();
    return { ok: false as const, message: "나눈 줄 저장에 실패했습니다. 변경분은 되돌렸습니다." };
  }
  childIds.push(...children.map((c) => c.txn_id));

  // 3) 회비 + 회원 줄만 납부원장 생성(개인잔액 반영) — 확정과 같은 규칙
  const payRows = children
    .filter((c) => c.fee_item_cd === "due" && c.mem_id)
    .map((c) => ({
      team_id: teamId,
      mem_id: c.mem_id!,
      src_txn_id: c.txn_id,
      pay_amt: c.txn_amt,
      pay_dt: c.txn_dt,
      pay_st_cd: "paid",
      vers: 0,
      del_yn: false,
    }));
  if (payRows.length > 0) {
    const { error: payErr } = await db.from("fee_due_pay_hist").insert(payRows);
    if (payErr) {
      await rollback();
      return { ok: false as const, message: "납부 원장 저장에 실패했습니다. 나누기를 취소했습니다." };
    }
  }

  return { ok: true as const, message: null, memIds: affectedMemIds, childTxnIds: childIds };
}
