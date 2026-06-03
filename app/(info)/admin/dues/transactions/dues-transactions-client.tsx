"use client";

import { useState, useTransition } from "react";
import dayjs from "dayjs";

import { confirmTransaction } from "@/app/actions/dues/confirm-transaction";
import { matchTransaction } from "@/app/actions/dues/match-transaction";
import { updateFeeItem } from "@/app/actions/dues/update-fee-item";
import { uploadXlsx } from "@/app/actions/dues/upload-xlsx";
import { rollbackXlsx } from "@/app/actions/dues/rollback-xlsx";

import { Body, Caption, SectionLabel } from "@/components/common/typography";
import { CardItem } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

type Txn = {
  txn_id: string;
  txn_dt: string;
  txn_amt: number;
  txn_io_enm: string;
  raw_name: string;
  raw_memo: string | null;
  adm_memo_txt: string | null;
  txn_tp_txt: string;
  match_st_cd: string;
  mem_id: string | null;
  fee_item_cd: string | null;
  is_cfm_yn: boolean;
  mem_mst: { mem_nm: string } | { mem_nm: string }[] | null;
};

type Upload = { upd_id: string; file_nm: string; crt_at: string; upd_st_cd: string };
type Member = { mem_id: string; mem_nm: string };

const FEE_ITEM_LABELS: Record<string, string> = {
  due: "회비",
  expense: "지출",
  event_fee: "행사비",
  goods: "물품",
  other: "기타",
};

const MATCH_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  matched: { label: "매칭", variant: "default" },
  unmatched: { label: "미매칭", variant: "destructive" },
  ambiguous: { label: "동명이인", variant: "secondary" },
};

function getMemNm(memMst: Txn["mem_mst"]): string | null {
  if (!memMst) return null;
  if (Array.isArray(memMst)) return memMst[0]?.mem_nm ?? null;
  return memMst.mem_nm;
}

export function DuesTransactionsClient({
  teamId,
  txns: initialTxns,
  uploads,
  members,
}: {
  teamId: string;
  txns: Txn[];
  uploads: Upload[];
  members: Member[];
}) {
  const [txns, setTxns] = useState(initialTxns);
  const [filter, setFilter] = useState<"all" | "unconfirmed" | "unmatched">("unconfirmed");
  const [isPending, startTransition] = useTransition();
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const filtered = txns.filter((t) => {
    if (filter === "unconfirmed") return !t.is_cfm_yn;
    if (filter === "unmatched") return t.match_st_cd !== "matched";
    return true;
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadMsg(null);
    const fd = new FormData();
    fd.append("file", file);
    startTransition(async () => {
      const res = await uploadXlsx(fd);
      if (res.ok) {
        setUploadMsg(`업로드 완료 — 총 ${res.summary.total}건, 매칭 ${res.summary.matched}건, 미매칭 ${res.summary.unmatched}건, 동명이인 ${res.summary.ambiguous}건, 중복 skip ${res.summary.skipped}건`);
        // 페이지 새로고침으로 데이터 반영
        window.location.reload();
      } else {
        setUploadMsg(res.message);
      }
      setUploading(false);
    });
    e.target.value = "";
  }

  function handleConfirm(txnId: string) {
    startTransition(async () => {
      const res = await confirmTransaction(txnId);
      if (res.ok) {
        setTxns((prev) => prev.map((t) => t.txn_id === txnId ? { ...t, is_cfm_yn: true } : t));
      } else {
        alert(res.message);
      }
    });
  }

  function handleMatch(txnId: string, memId: string) {
    startTransition(async () => {
      const res = await matchTransaction(txnId, memId);
      if (res.ok) {
        const mem = members.find((m) => m.mem_id === memId);
        setTxns((prev) => prev.map((t) =>
          t.txn_id === txnId
            ? { ...t, match_st_cd: "matched", mem_id: memId, mem_mst: mem ? { mem_nm: mem.mem_nm } : t.mem_mst }
            : t
        ));
      } else {
        alert(res.message);
      }
    });
  }

  function handleFeeItem(txnId: string, val: string) {
    startTransition(async () => {
      const res = await updateFeeItem(txnId, val as "due" | "expense" | "event_fee" | "goods" | "other");
      if (res.ok) {
        setTxns((prev) => prev.map((t) => t.txn_id === txnId ? { ...t, fee_item_cd: val } : t));
      } else {
        alert(res.message);
      }
    });
  }

  function handleRollback(updId: string) {
    if (!confirm("이 업로드를 롤백하시겠습니까? 미확정 거래가 삭제됩니다.")) return;
    startTransition(async () => {
      const res = await rollbackXlsx(updId);
      if (res.ok) {
        window.location.reload();
      } else {
        alert(res.message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-6 px-6 pb-6 pt-2">
      {/* xlsx 업로드 */}
      <div className="flex flex-col gap-3">
        <SectionLabel>엑셀 업로드</SectionLabel>
        <label className="cursor-pointer">
          <CardItem variant="dashed" className="flex items-center justify-center p-4 gap-2">
            {uploading ? <LoadingSpinner /> : <Body className="text-muted-foreground">파일 선택 또는 드래그앤드롭</Body>}
          </CardItem>
          <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} disabled={uploading} />
        </label>
        {uploadMsg && <Caption className={uploadMsg.includes("완료") ? "text-primary" : "text-destructive"}>{uploadMsg}</Caption>}
      </div>

      {/* 업로드 이력 */}
      {uploads.length > 0 && (
        <div className="flex flex-col gap-2">
          <SectionLabel>업로드 이력</SectionLabel>
          {uploads.map((u) => (
            <CardItem key={u.upd_id} className="flex items-center justify-between p-3">
              <div className="flex flex-col gap-0.5">
                <Body className="text-sm">{u.file_nm}</Body>
                <Caption>{dayjs(u.crt_at).format("YYYY.MM.DD HH:mm")}</Caption>
              </div>
              {u.upd_st_cd !== "rolled_back" && (
                <Button variant="ghost" size="sm" onClick={() => handleRollback(u.upd_id)} disabled={isPending}>
                  롤백
                </Button>
              )}
              {u.upd_st_cd === "rolled_back" && <Badge variant="secondary">롤백됨</Badge>}
            </CardItem>
          ))}
        </div>
      )}

      {/* 필터 */}
      <div className="flex gap-2">
        {(["unconfirmed", "unmatched", "all"] as const).map((f) => (
          <Button key={f} variant={filter === f ? "default" : "outline"} size="sm" onClick={() => setFilter(f)}>
            {f === "unconfirmed" ? "미확정" : f === "unmatched" ? "미매칭" : "전체"}
          </Button>
        ))}
      </div>

      {/* 거래 목록 */}
      <div className="flex flex-col gap-2">
        <SectionLabel>거래 내역 ({filtered.length}건)</SectionLabel>
        {filtered.length === 0 && <Caption className="text-muted-foreground">해당 내역이 없습니다.</Caption>}
        {filtered.map((t) => {
          const badge = MATCH_BADGE[t.match_st_cd] ?? { label: t.match_st_cd, variant: "secondary" as const };
          const memNm = getMemNm(t.mem_mst);
          return (
            <CardItem key={t.txn_id} className={`flex flex-col gap-2 p-4 ${t.is_cfm_yn ? "opacity-60" : ""}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Body className="font-semibold">{t.raw_name}</Body>
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                  {t.is_cfm_yn && <Badge variant="secondary">확정</Badge>}
                </div>
                <Body className={`font-semibold ${t.txn_io_enm === "deposit" ? "text-primary" : "text-muted-foreground"}`}>
                  {t.txn_io_enm === "deposit" ? "+" : "-"}{t.txn_amt.toLocaleString()}원
                </Body>
              </div>
              <div className="flex items-center gap-2">
                <Caption>{dayjs(t.txn_dt).format("YYYY.MM.DD")}</Caption>
                <Caption>·</Caption>
                <Caption>{t.txn_tp_txt}</Caption>
                {memNm && <><Caption>·</Caption><Caption className="text-foreground">{memNm}</Caption></>}
              </div>

              {!t.is_cfm_yn && (
                <div className="flex flex-col gap-2 pt-1 border-t border-border">
                  {/* 카테고리 변경 */}
                  <div className="flex items-center gap-2">
                    <Caption>분류:</Caption>
                    <Select value={t.fee_item_cd ?? "due"} onValueChange={(v) => handleFeeItem(t.txn_id, v)} disabled={isPending}>
                      <SelectTrigger className="h-7 w-24 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(FEE_ITEM_LABELS).map(([val, label]) => (
                          <SelectItem key={val} value={val}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* 미매칭/동명이인 — 회원 지정 */}
                  {(t.match_st_cd === "unmatched" || t.match_st_cd === "ambiguous") && (
                    <div className="flex items-center gap-2">
                      <Caption>회원 지정:</Caption>
                      <Select onValueChange={(v) => handleMatch(t.txn_id, v)} disabled={isPending}>
                        <SelectTrigger className="h-7 w-32 text-xs">
                          <SelectValue placeholder="선택" />
                        </SelectTrigger>
                        <SelectContent>
                          {members.map((m) => (
                            <SelectItem key={m.mem_id} value={m.mem_id}>{m.mem_nm}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* 확정 버튼 */}
                  {t.match_st_cd === "matched" && (
                    <Button size="sm" onClick={() => handleConfirm(t.txn_id)} disabled={isPending}>
                      확정
                    </Button>
                  )}
                </div>
              )}
            </CardItem>
          );
        })}
      </div>
    </div>
  );
}
