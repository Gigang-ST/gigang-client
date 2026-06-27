"use client";

import { useState, useTransition } from "react";

import { dayjs } from "@/lib/dayjs";

import { restoreTransaction } from "@/app/actions/dues/restore-transaction";

import { Caption, SectionLabel } from "@/components/common/typography";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type ExcludedTxn = {
  txn_id: string;
  txn_dt: string;
  txn_tm: string | null;
  txn_amt: number;
  txn_io_enm: string;
  raw_name: string;
  mem_nm: string | null;
};

export function ExcludedClient({ excludedTxns }: { excludedTxns: ExcludedTxn[] }) {
  const [rows, setRows] = useState(excludedTxns);
  const [isPending, startTransition] = useTransition();

  function handleRestore(txnId: string) {
    if (!confirm("이 거래를 복구하시겠습니까?\n거래내역에 다시 표시됩니다.")) return;
    startTransition(async () => {
      const res = await restoreTransaction(txnId);
      if (res.ok) {
        setRows((prev) => prev.filter((r) => r.txn_id !== txnId));
      } else {
        alert(res.message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 px-6 pb-6 pt-2">
      <SectionLabel>제외 내역 ({rows.length}건)</SectionLabel>
      <Caption className="text-muted-foreground">
        제외한 거래입니다. 복구하면 거래내역에 다시 나타납니다.
      </Caption>
      <div className="overflow-x-auto rounded-2xl border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              {["일시", "이름", "금액", "관리"].map((h) => (
                <TableHead key={h} className="text-center text-xs whitespace-nowrap">{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center">
                  <Caption className="text-muted-foreground">제외된 거래가 없습니다.</Caption>
                </TableCell>
              </TableRow>
            )}
            {rows.map((t) => {
              const isDeposit = t.txn_io_enm === "deposit";
              return (
                <TableRow key={t.txn_id}>
                  <TableCell className="text-center">
                    <div className="flex flex-col items-center leading-tight">
                      <Caption className="text-xs text-foreground whitespace-nowrap">{dayjs(t.txn_dt).format("YYYY.MM.DD")}</Caption>
                      {t.txn_tm && (
                        <Caption className="text-[10px] text-muted-foreground whitespace-nowrap">
                          {dayjs(`${t.txn_dt}T${t.txn_tm}`).format("HH:mm")}
                        </Caption>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <Caption className="text-xs text-foreground whitespace-nowrap">
                      {t.raw_name}{t.mem_nm && t.mem_nm !== t.raw_name ? ` (${t.mem_nm})` : ""}
                    </Caption>
                  </TableCell>
                  <TableCell className="text-center">
                    <Caption className={`text-xs font-semibold whitespace-nowrap ${isDeposit ? "text-[var(--success)]" : "text-destructive"}`}>
                      {isDeposit ? "+" : "-"}{t.txn_amt.toLocaleString()}원
                    </Caption>
                  </TableCell>
                  <TableCell className="text-center">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => handleRestore(t.txn_id)}
                      disabled={isPending}
                    >
                      복구
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
