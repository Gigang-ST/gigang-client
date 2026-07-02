import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";

import { matchPayer, type MemberRef, type AliasRef } from "@/lib/dues/match-payer";
import { bucketOf } from "@/lib/dues/upload-bucketize";
import { duplicateNames } from "@/lib/dues/homonyms";

export type MemberOption = { memId: string; name: string; birthDt: string | null };

export type InboxTxn = {
  txnId: string;
  txnDt: string;
  txnTm: string | null;
  amt: number;
  rawName: string;
  memId: string | null;
  matchStatus: "matched" | "unmatched" | "ambiguous";
  feeItemCd: string | null;
  bucket: "autoDone" | "needsReview" | "excluded";
  candidates: { memId: string; name: string; score: number; birthDt: string | null }[];
};

/**
 * Inbox 화면용: 미확정(is_cfm_yn=false, del_yn=false) 거래를 팀 소속 회원·별칭 기준으로
 * 조회해 반환한다. matchPayer는 매 조회마다 다시 실행하지만, 그 결과 중 화면에 실제로
 * 쓰이는 것은 후보 목록(candidates)뿐이다 — matchStatus는 `r.match_st_cd ?? match.status`로
 * 저장된 값을 우선하고, bucket도 그 matchStatus로 계산하므로 업로드 시점에 확정된 분류를
 * 그대로 따른다. 즉 "그 사이 학습된 별칭"은 candidates(추천 후보) 갱신에만 반영되고,
 * 이미 배정된 버킷/매칭 상태 자체를 바꾸지는 않는다.
 */
export async function getInboxTxns(): Promise<{
  members: MemberOption[];
  txns: InboxTxn[];
}> {
  const { teamId } = await getRequestTeamContext();
  const db = createAdminClient();

  // 조회 실패를 빈 정상 상태로 삼키지 않는다 — 마이그레이션 누락·권한오류가
  // "빈 화면=정상"으로 오인되지 않도록 에러는 그대로 표면화(throw)한다.
  const { data: rels, error: relsErr } = await db
    .from("team_mem_rel")
    .select("mem_id")
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false);
  if (relsErr) throw new Error(`팀 회원 조회 실패: ${relsErr.message}`);
  const memIds = (rels ?? []).map((r) => r.mem_id);

  const { data: mems, error: memsErr } = memIds.length
    ? await db
        .from("mem_mst")
        .select("mem_id, mem_nm, birth_dt")
        .in("mem_id", memIds)
        .eq("vers", 0)
        .eq("del_yn", false)
    : { data: [] as { mem_id: string; mem_nm: string; birth_dt: string | null }[], error: null };
  if (memsErr) throw new Error(`회원 조회 실패: ${memsErr.message}`);
  const memberRefs: MemberRef[] = (mems ?? []).map((m) => ({ memId: m.mem_id, name: m.mem_nm }));
  const birthById = new Map<string, string | null>((mems ?? []).map((m) => [m.mem_id, m.birth_dt]));
  // 생년월일은 동명이인 구분에만 쓰이므로, 동명이인인 회원에게만 클라이언트로 내려보낸다
  // (불필요한 개인정보 전송 최소화). 동명이인이 아니면 birthDt는 null.
  const dupNames = duplicateNames(memberRefs);
  const birthFor = (memId: string, name: string): string | null =>
    dupNames.has(name) ? (birthById.get(memId) ?? null) : null;

  const { data: aliasRows, error: aliasErr } = await db
    .from("fee_payer_alias")
    .select("raw_name_norm, mem_id")
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false);
  if (aliasErr) throw new Error(`별칭 조회 실패: ${aliasErr.message}`);
  const aliasRefs: AliasRef[] = (aliasRows ?? []).map((a) => ({ rawNameNorm: a.raw_name_norm, memId: a.mem_id }));

  // fee_txn_hist에는 vers 컬럼이 없다 — del_yn만 필터한다.
  const { data: rows, error: rowsErr } = await db
    .from("fee_txn_hist")
    .select("txn_id, txn_dt, txn_tm, txn_amt, txn_io_enm, raw_name, mem_id, match_st_cd, fee_item_cd")
    .eq("team_id", teamId)
    .eq("is_cfm_yn", false)
    .eq("del_yn", false)
    .order("txn_dt", { ascending: true });
  if (rowsErr) throw new Error(`거래 조회 실패: ${rowsErr.message}`);

  const txns: InboxTxn[] = (rows ?? []).map((r) => {
    const match = matchPayer(r.raw_name, memberRefs, aliasRefs);
    const matchStatus = (r.match_st_cd ?? match.status) as InboxTxn["matchStatus"];
    const bucket = bucketOf({
      io: r.txn_io_enm as "deposit" | "withdrawal",
      itemCd: r.fee_item_cd ?? "other",
      matchStatus,
    });
    return {
      txnId: r.txn_id,
      txnDt: r.txn_dt,
      txnTm: r.txn_tm,
      amt: r.txn_amt,
      rawName: r.raw_name,
      memId: r.mem_id,
      matchStatus,
      feeItemCd: r.fee_item_cd,
      bucket,
      candidates: match.candidates.map((c) => ({ ...c, birthDt: birthFor(c.memId, c.name) })),
    };
  });

  return {
    members: memberRefs.map((m) => ({
      memId: m.memId,
      name: m.name,
      birthDt: birthFor(m.memId, m.name),
    })),
    txns,
  };
}

export type ProcessedTxn = {
  txnId: string;
  txnDt: string;
  amt: number;
  rawName: string;
  memName: string | null;
  feeItemCd: string | null;
  cfmAt: string;
  cfmByName: string | null;
};

/** 처리됨 목록 기본 조회 건수 — 오래된 건은 검색으로 못 찾는 대신 화면·전송량을 지킨다. */
export const PROCESSED_TXN_LIMIT = 200;

/**
 * 처리됨(확정 완료) 거래 조회 — 감사·정정용. 최근 확정순으로 최대 PROCESSED_TXN_LIMIT 건.
 * 확정 시각·확정자를 함께 내려 "언제 누가 어떻게 처리했는지"를 화면에서 확인할 수 있게 한다.
 */
export async function getProcessedTxns(): Promise<ProcessedTxn[]> {
  const { teamId } = await getRequestTeamContext();
  const db = createAdminClient();

  const { data: rows, error } = await db
    .from("fee_txn_hist")
    .select(
      "txn_id, txn_dt, txn_amt, raw_name, fee_item_cd, cfm_at, mem:mem_mst!fk_fee_txn_hist__mem_mst(mem_nm), cfm_by:mem_mst!fk_fee_txn_hist__cfm_mem_mst(mem_nm)",
    )
    .eq("team_id", teamId)
    .eq("is_cfm_yn", true)
    .eq("del_yn", false)
    .order("cfm_at", { ascending: false })
    .limit(PROCESSED_TXN_LIMIT);
  if (error) throw new Error(`처리된 거래 조회 실패: ${error.message}`);

  const nameOf = (raw: unknown): string | null => {
    const item = Array.isArray(raw) ? raw[0] : raw;
    return (item as { mem_nm: string } | null)?.mem_nm ?? null;
  };

  return (rows ?? []).map((r) => ({
    txnId: r.txn_id,
    txnDt: r.txn_dt,
    amt: r.txn_amt,
    rawName: r.raw_name,
    memName: nameOf(r.mem),
    feeItemCd: r.fee_item_cd,
    cfmAt: r.cfm_at as string,
    cfmByName: nameOf(r.cfm_by),
  }));
}

export type LedgerRow = {
  memId: string;
  name: string;
  balance: number;
  status: "미납" | "정상" | "예치";
  months: number;
};

/**
 * 회비 원장 화면용: 회원별 잔액 스냅샷(vers=0)을 이름과 함께 조회하고,
 * 잔액 부호에 따라 미납/정상/예치로 분류해 정책 월회비 기준 개월수를 계산한다.
 */
export async function getDuesLedger(): Promise<{
  rows: LedgerRow[];
  summary: { unpaid: number; ok: number; prepaid: number };
}> {
  const { teamId } = await getRequestTeamContext();
  const db = createAdminClient();

  const { data: policies, error: policiesErr } = await db
    .from("fee_policy_cfg")
    .select("monthly_fee_amt")
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false)
    .order("aply_stt_dt", { ascending: false })
    .limit(1);
  if (policiesErr) throw new Error(`회비 정책 조회 실패: ${policiesErr.message}`);
  const monthly = policies?.[0]?.monthly_fee_amt ?? 2000;

  const { data: snaps, error: snapsErr } = await db
    .from("fee_mem_bal_snap")
    .select("mem_id, bal_amt, mem_mst!fk_fee_mem_bal_snap__mem_mst(mem_nm)")
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false);
  if (snapsErr) throw new Error(`잔액 스냅샷 조회 실패: ${snapsErr.message}`);

  const rows: LedgerRow[] = (snaps ?? [])
    .map((s) => {
      const bal = s.bal_amt;
      const memNm = Array.isArray(s.mem_mst) ? s.mem_mst[0]?.mem_nm : (s.mem_mst as { mem_nm: string } | null)?.mem_nm;
      const status: LedgerRow["status"] = bal < 0 ? "미납" : bal > 0 ? "예치" : "정상";
      return {
        memId: s.mem_id,
        name: memNm ?? "(이름없음)",
        balance: bal,
        status,
        // 완납된 개월수(내림). 한 달 미만 잔액은 0 → 화면에서 "1개월 미만"으로 표시한다.
        months: Math.floor(Math.abs(bal) / monthly),
      };
    })
    .sort((a, b) => a.balance - b.balance);

  return {
    rows,
    summary: {
      unpaid: rows.filter((r) => r.status === "미납").length,
      ok: rows.filter((r) => r.status === "정상").length,
      prepaid: rows.filter((r) => r.status === "예치").length,
    },
  };
}
