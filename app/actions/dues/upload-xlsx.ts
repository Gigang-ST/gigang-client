"use server";

import crypto from "crypto";

import { verifyAdmin } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";

type ParsedRow = {
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
  // "2026.02.26 11:15:31"
  const m = raw.match(/^(\d{4})\.(\d{2})\.(\d{2})\s+(\d{2}:\d{2}:\d{2})$/);
  if (!m) return { date: raw.replace(/\./g, "-").slice(0, 10), time: null };
  return { date: `${m[1]}-${m[2]}-${m[3]}`, time: m[4] };
}

function parseAmount(raw: string): number {
  return Math.abs(parseInt(raw.replace(/,/g, ""), 10));
}

function inferItemCd(io: "deposit" | "withdrawal", txnTp: string): "due" | "expense" | "other" {
  if (io === "withdrawal") return "expense";
  if (txnTp === "예금이자" || txnTp === "타행자동이체") return "other";
  return "due";
}

export async function uploadXlsx(formData: FormData) {
  const adminUser = await verifyAdmin();
  if (!adminUser) return { ok: false as const, message: "권한이 없습니다." };

  const { teamId } = await getRequestTeamContext();
  const db = createAdminClient();

  const file = formData.get("file") as File | null;
  if (!file) return { ok: false as const, message: "파일이 없습니다." };

  const buffer = Buffer.from(await file.arrayBuffer());
  const fileHash = crypto.createHash("sha256").update(buffer).digest("hex");

  // 중복 파일 체크 (del_yn=false + rolled_back 제외 — 롤백 후 재업로드 허용)
  const { data: existing } = await db
    .from("fee_xlsx_upd_hist")
    .select("upd_id")
    .eq("team_id", teamId)
    .eq("file_hash", fileHash)
    .eq("vers", 0)
    .eq("del_yn", false)
    .neq("upd_st_cd", "rolled_back")
    .maybeSingle();

  if (existing) return { ok: false as const, message: "이미 처리된 파일입니다." };

  // xlsx 파싱 (동적 import — 빌드 시 서버에서만 로드)
  let rows: ParsedRow[];
  try {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    // 9행: 빈행, 10행: 헤더, 11행~: 데이터 (0-indexed range:9 → raw[0]=빈행, raw[1]=헤더)
    const raw: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, range: 9 });
    const header = raw[1] as string[];
    const dtIdx = header.findIndex((h) => h?.includes("거래일시"));
    const ioIdx = header.findIndex((h) => h?.includes("구분"));
    const amtIdx = header.findIndex((h) => h?.includes("거래금액"));
    const tpIdx = header.findIndex((h) => h?.includes("거래구분"));
    const nameIdx = header.findIndex((h) => h?.includes("내용"));
    const memoIdx = header.findIndex((h) => h?.includes("메모"));

    rows = raw.slice(2).flatMap((r): ParsedRow[] => {
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
      return [{
        txn_dt: date,
        txn_tm: time,
        txn_amt: amt,
        txn_io_enm: io,
        raw_name: name,
        raw_memo: memo,
        txn_tp_txt: tp,
        fee_item_cd: inferItemCd(io, tp),
      }];
    });
  } catch {
    return { ok: false as const, message: "파일 파싱에 실패했습니다. 파일 형식을 확인하세요." };
  }

  // 업로드 이력 생성
  const { data: upd, error: updErr } = await db
    .from("fee_xlsx_upd_hist")
    .insert({
      team_id: teamId,
      file_nm: file.name,
      file_hash: fileHash,
      upd_by_mem_id: adminUser.id,
      upd_st_cd: "confirmed",
      vers: 0,
      del_yn: false,
    })
    .select("upd_id")
    .single();

  if (updErr || !upd) return { ok: false as const, message: "업로드 이력 저장 실패." };

  // 회원 목록 (매칭용)
  const { data: members } = await db
    .from("mem_mst")
    .select("mem_id, mem_nm")
    .eq("vers", 0)
    .eq("del_yn", false);

  const nameMap = new Map<string, string[]>();
  for (const m of members ?? []) {
    const key = m.mem_nm.replace(/\s/g, "");
    const list = nameMap.get(key) ?? [];
    list.push(m.mem_id);
    nameMap.set(key, list);
  }

  // 거래 INSERT
  let matched = 0, unmatched = 0, ambiguous = 0, skipped = 0;

  for (const row of rows) {
    const normName = row.raw_name.replace(/\s/g, "");
    let matchStatus: "matched" | "unmatched" | "ambiguous" = "unmatched";
    let memId: string | null = null;

    if (row.fee_item_cd === "due") {
      const candidates = nameMap.get(normName) ?? [];
      if (candidates.length === 1) {
        matchStatus = "matched";
        memId = candidates[0];
        matched++;
      } else if (candidates.length > 1) {
        matchStatus = "ambiguous";
        ambiguous++;
      } else {
        unmatched++;
      }
    }

    const { error } = await db.from("fee_txn_hist").insert({
      team_id: teamId,
      upd_id: upd.upd_id,
      txn_dt: row.txn_dt,
      txn_tm: row.txn_tm,
      txn_amt: row.txn_amt,
      txn_io_enm: row.txn_io_enm,
      raw_name: row.raw_name,
      raw_memo: row.raw_memo,
      txn_tp_txt: row.txn_tp_txt,
      match_st_cd: matchStatus,
      mem_id: memId,
      fee_item_cd: row.fee_item_cd,
      is_cfm_yn: false,
      del_yn: false,
    });

    if (error?.code === "23505") {
      skipped++;
    } else if (error) {
      console.error("[uploadXlsx] 거래 INSERT 실패:", error.code, error.message, {
        txn_dt: row.txn_dt,
        txn_tm: row.txn_tm,
        txn_amt: row.txn_amt,
        fee_item_cd: row.fee_item_cd,
      });
      return { ok: false as const, message: `거래 저장 중 오류가 발생했습니다. (${error.code})` };
    }
  }

  return {
    ok: true as const,
    message: null,
    summary: { total: rows.length, matched, unmatched, ambiguous, skipped },
  };
}
