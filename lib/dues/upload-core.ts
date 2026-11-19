import crypto from "crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { dayjs } from "@/lib/dayjs";

import { matchPayer, type MemberRef, type AliasRef } from "@/lib/dues/match-payer";
import { bucketOf } from "@/lib/dues/upload-bucketize";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import type { Database } from "@/lib/supabase/database.types";

import { getValidFeeItemCds } from "@/app/actions/dues/validate-fee-item";

/**
 * 거래내역 엑셀 적재 코어 — 서버 액션(`uploadXlsx`)과 운영 MCP(`upload_dues_xlsx`)가 공유한다.
 * 클라이언트·팀·실행자를 인자로 받는 주입식이라 세션 쿠키가 없어도 돈다(`next/*` 를 모른다).
 * 중복 방지(file_hash + 거래 unique 인덱스)·baseline 컷오프·자동 분류 규칙은 앱 업로드와 같은 한 벌이다.
 */

type Db = SupabaseClient<Database>;

export type ParsedRow = {
  txn_dt: string;
  txn_tm: string | null;
  txn_amt: number;
  txn_io_enm: "deposit" | "withdrawal";
  raw_name: string;
  raw_memo: string | null;
  txn_tp_txt: string;
  fee_item_cd: "due" | "expense" | "other";
};

function parseDatetime(raw: string): { date: string; time: string | null } {
  const m = raw.match(/^(\d{4})\.(\d{2})\.(\d{2})\s+(\d{2}:\d{2}:\d{2})$/);
  if (!m) return { date: raw.replace(/\./g, "-").slice(0, 10), time: null };
  return { date: `${m[1]}-${m[2]}-${m[3]}`, time: m[4] };
}

function parseAmount(raw: string): number {
  return Math.abs(parseInt(raw.replace(/,/g, ""), 10));
}

/** 입출금 구분·거래구분으로 기본 분류를 정한다 — 출금은 지출, 이자·타행자동이체는 기타, 나머지 입금은 회비. */
export function inferItemCd(io: "deposit" | "withdrawal", txnTp: string): "due" | "expense" | "other" {
  if (io === "withdrawal") return "expense";
  if (txnTp === "예금이자" || txnTp === "타행자동이체") return "other";
  return "due";
}

/** 파일 바이트의 sha256 — 같은 파일 재업로드 차단 키 */
export function hashBuffer(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/**
 * 카카오뱅크 거래내역 엑셀을 거래 행으로 풀어 낸다. 형식이 맞지 않으면 던진다.
 * 헤더는 10번째 줄 아래(range: 9)의 두 번째 줄이다 — 앱 업로드와 같은 규약.
 */
export async function parseKakaoXlsx(buffer: Buffer): Promise<ParsedRow[]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, range: 9 });
  const header = raw[1] as string[];
  const dtIdx = header.findIndex((h) => h?.includes("거래일시"));
  const ioIdx = header.findIndex((h) => h?.includes("구분"));
  const amtIdx = header.findIndex((h) => h?.includes("거래금액"));
  const tpIdx = header.findIndex((h) => h?.includes("거래구분"));
  const nameIdx = header.findIndex((h) => h?.includes("내용"));
  const memoIdx = header.findIndex((h) => h?.includes("메모"));

  return raw.slice(2).flatMap((r): ParsedRow[] => {
    const dtRaw = String(r[dtIdx] ?? "").trim();
    const ioRaw = String(r[ioIdx] ?? "").trim();
    const amtRaw = String(r[amtIdx] ?? "").trim();
    const tp = String(r[tpIdx] ?? "").trim();
    const name = String(r[nameIdx] ?? "").trim();
    const memo = String(r[memoIdx] ?? "").trim() || null;

    if (!dtRaw || !amtRaw || !name) return [];
    const { date, time } = parseDatetime(dtRaw);
    const amt = parseAmount(amtRaw);
    if (!amt) return [];
    const io: "deposit" | "withdrawal" = ioRaw === "입금" ? "deposit" : "withdrawal";
    return [
      {
        txn_dt: date,
        txn_tm: time,
        txn_amt: amt,
        txn_io_enm: io,
        raw_name: name,
        raw_memo: memo,
        txn_tp_txt: tp,
        fee_item_cd: inferItemCd(io, tp),
      },
    ];
  });
}

/** 거래 중복 판정 키 — DB 의 `uk_fee_txn_hist_dedup` 와 같은 구성. 시각이 비면 유니크가 안 걸리므로 키를 만들지 않는다. */
function dedupKey(r: { txn_dt: string; txn_tm: string | null; txn_amt: number; raw_name: string; txn_io_enm: string }) {
  if (!r.txn_tm) return null;
  return [r.txn_dt, r.txn_tm, r.txn_amt, r.raw_name, r.txn_io_enm].join("|");
}

export type IngestSummary = {
  total: number;
  autoDone: number;
  needsReview: number;
  excluded: number;
  skipped: number;
  skippedByCutoff: number;
};

export type IngestResult =
  | { ok: false; message: string }
  | { ok: true; message: null; summary: IngestSummary; dryRun: boolean; updId: string | null };

/**
 * 거래 행을 적재한다(또는 `dryRun` 이면 적재 없이 같은 규칙으로 요약만 계산한다).
 *
 * - 같은 파일(hash)이 이미 처리됐으면 거부한다.
 * - 회원 매칭 → 3버킷(자동·확인필요·제외) 분류 → 회원 baseline 이전의 과거 거래는 건너뜀 → 중복 거래는 건너뜀.
 * - 적재는 미확정(`is_cfm_yn=false`) 상태로만 한다. 확정은 별도 단계다.
 */
export async function ingestDuesRows(
  db: Db,
  input: {
    teamId: string;
    actorMemId: string;
    fileName: string;
    fileHash: string;
    rows: ParsedRow[];
    dryRun?: boolean;
  },
): Promise<IngestResult> {
  const { teamId, actorMemId, fileName, fileHash, rows } = input;
  const dryRun = input.dryRun ?? false;

  const { data: existing } = await db
    .from("fee_xlsx_upd_hist")
    .select("upd_id")
    .eq("team_id", teamId)
    .eq("file_hash", fileHash)
    .eq("vers", 0)
    .eq("del_yn", false)
    .neq("upd_st_cd", "rolled_back")
    .maybeSingle();

  if (existing) return { ok: false, message: "이미 처리된 파일입니다." };

  let updId: string | null = null;
  if (!dryRun) {
    const { data: upd, error: updErr } = await db
      .from("fee_xlsx_upd_hist")
      .insert({
        team_id: teamId,
        file_nm: fileName,
        file_hash: fileHash,
        upd_by_mem_id: actorMemId,
        upd_st_cd: "confirmed",
        vers: 0,
        del_yn: false,
      })
      .select("upd_id")
      .single();

    if (updErr || !upd) return { ok: false, message: "업로드 이력 저장 실패." };
    updId = upd.upd_id;
  }

  // 회원 매칭 후보는 현재 팀 소속(team_mem_rel)으로 제한한다.
  // mem_mst 에는 team_id 가 없으므로, 팀-회원 관계에서 mem_id 를 먼저 추린다.
  // (멀티팀 전환 시 다른 팀 회원에게 거래가 매칭되는 것을 방지)
  const { data: teamRels } = await db
    .from("team_mem_rel")
    .select("mem_id")
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false);
  const teamMemIds = (teamRels ?? []).map((r) => r.mem_id);

  const { data: members } = teamMemIds.length
    ? await db.from("mem_mst").select("mem_id, mem_nm").in("mem_id", teamMemIds).eq("vers", 0).eq("del_yn", false)
    : { data: [] as { mem_id: string; mem_nm: string }[] };

  const memberRefs: MemberRef[] = (members ?? []).map((m) => ({ memId: m.mem_id, name: m.mem_nm }));

  // 별칭 조회 실패를 빈 배열로 삼키지 않는다 — 삼키면 원래 자동매칭될 입금이 needsReview로
  // 잘못 적재된 채 업로드가 성공으로 끝나 운영자가 원인 모를 오triage를 보게 된다.
  const { data: aliasRows, error: aliasErr } = await db
    .from("fee_payer_alias")
    .select("raw_name_norm, mem_id")
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false);
  if (aliasErr) {
    return { ok: false, message: "별칭 조회에 실패했습니다. 다시 시도하세요." };
  }
  const aliasRefs: AliasRef[] = (aliasRows ?? []).map((a) => ({ rawNameNorm: a.raw_name_norm, memId: a.mem_id }));

  // 회원별 baseline(마지막 거래일) 맵 — 이미 마감된 시점 이전의 과거 거래가
  // 재유입되는 것을 막기 위함. snap.last_calc_at = 그 회원의 마지막 거래 기준 시점.
  const { data: snaps } = await db
    .from("fee_mem_bal_snap")
    .select("mem_id, last_calc_at")
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false);
  const baselineMap = new Map<string, string>();
  for (const s of snaps ?? []) {
    if (s.last_calc_at) baselineMap.set(s.mem_id, s.last_calc_at);
  }

  // 분류 유효성 집합 — 공통코드에 없는 분류는 'other'로 폴백 (업로드는 자동 분류라 중단보다 폴백이 안전)
  const validCds = await getValidFeeItemCds(db, teamId);

  // dry_run 은 적재를 안 하므로 중복(23505)을 DB 가 알려 주지 않는다 — 같은 유니크 키로 미리 대조한다.
  // 파일 안에서 서로 겹치는 행도 적재 순서대로 두 번째부터 중복으로 센다(실제 적재와 같은 결과).
  const seenKeys = new Set<string>();
  if (dryRun && rows.length > 0) {
    const dates = rows.map((r) => r.txn_dt).sort();
    const stored = await fetchAllRows(() =>
      db
        .from("fee_txn_hist")
        .select("txn_id, txn_dt, txn_tm, txn_amt, raw_name, txn_io_enm")
        .eq("team_id", teamId)
        .gte("txn_dt", dates[0])
        .lte("txn_dt", dates[dates.length - 1])
        .order("txn_id"),
    );
    for (const r of stored) {
      const k = dedupKey(r);
      if (k) seenKeys.add(k);
    }
  }

  let autoDone = 0,
    needsReview = 0,
    excluded = 0,
    skipped = 0,
    skippedByCutoff = 0;

  for (const row of rows) {
    // 분류와 무관하게 이름으로 회원 매칭을 시도한다.
    // (회비뿐 아니라 지출·환불 등도 회원에 연결되면 그 회원 거래내역에 보여주기 위함.
    //  단, 개인 잔액 정산에 반영되는 것은 여전히 회비(due)+매칭 건만이다.)
    const match = matchPayer(row.raw_name, memberRefs, aliasRefs);
    const matchStatus = match.status; // "matched" | "unmatched" | "ambiguous"
    const memId = match.memId;
    const bucket = bucketOf({ io: row.txn_io_enm, itemCd: row.fee_item_cd, matchStatus });
    if (bucket === "autoDone") autoDone++;
    else if (bucket === "needsReview") needsReview++;
    else excluded++;

    // baseline cutoff: 매칭된 거래가 그 회원의 마지막 거래일(baseline) 이전이면,
    // 이미 마감된 과거이므로 적재하지 않고 스킵한다. (입금·출금/분류 불문)
    //
    // 근거: last_calc_at(baseline)은 "이 시점까지 이 회원의 모든 거래가 처리됨"을 뜻한다.
    // baseline 이후로는 거래가 순서대로 다 들어오므로, baseline 이전에 새로 매칭되는 거래는
    // 정상 흐름상 존재할 수 없고 = 마이그레이션 누락분(이미 baseline에 녹아있는 과거)의 재유입이다.
    // 따라서 매칭된 거래만 baseline 비교 대상. 스킵 시 실제 버킷 카운트를 되돌린다.
    // (미매칭·동명이인은 누구 건지 몰라 baseline 비교 불가 → 그대로 적재)
    if (matchStatus === "matched" && memId) {
      const baseline = baselineMap.get(memId);
      if (baseline) {
        const txnAt = dayjs.tz(`${row.txn_dt}T${row.txn_tm ?? "00:00:00"}`, "Asia/Seoul");
        if (txnAt.isBefore(dayjs(baseline))) {
          if (bucket === "autoDone") autoDone--;
          else if (bucket === "needsReview") needsReview--;
          else excluded--;
          skippedByCutoff++;
          continue;
        }
      }
    }

    // 공통코드에 없는 분류면 'other'로 폴백
    const feeItemCd = validCds.has(row.fee_item_cd) ? row.fee_item_cd : "other";

    if (dryRun) {
      const k = dedupKey(row);
      if (k && seenKeys.has(k)) {
        if (bucket === "autoDone") autoDone--;
        else if (bucket === "needsReview") needsReview--;
        else excluded--;
        skipped++;
      } else if (k) {
        seenKeys.add(k);
      }
      continue;
    }

    const { error } = await db.from("fee_txn_hist").insert({
      team_id: teamId,
      upd_id: updId!,
      txn_dt: row.txn_dt,
      txn_tm: row.txn_tm,
      txn_amt: row.txn_amt,
      txn_io_enm: row.txn_io_enm,
      raw_name: row.raw_name,
      raw_memo: row.raw_memo,
      txn_tp_txt: row.txn_tp_txt,
      match_st_cd: matchStatus,
      mem_id: memId,
      fee_item_cd: feeItemCd,
      is_cfm_yn: false,
      del_yn: false,
    });

    if (error?.code === "23505") {
      // 이미 적재된 중복 거래 — 실제 저장 안 됐으므로 위에서 올린 버킷 카운트를 되돌린다.
      if (bucket === "autoDone") autoDone--;
      else if (bucket === "needsReview") needsReview--;
      else excluded--;
      skipped++;
    } else if (error) {
      // 원인 코드만 남긴다 — 이름·금액·메모는 로그에 싣지 않는다.
      console.error("[ingestDuesRows] 거래 INSERT 실패:", error.code, error.message);
      return { ok: false, message: `거래 저장 중 오류가 발생했습니다. (${error.code})` };
    }
  }

  return {
    ok: true,
    message: null,
    dryRun,
    updId,
    summary: { total: rows.length, autoDone, needsReview, excluded, skipped, skippedByCutoff },
  };
}
