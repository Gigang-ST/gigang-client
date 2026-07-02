"use client";

import { dayjs } from "@/lib/dayjs";
import type { ProcessedTxn } from "@/lib/queries/dues";

import { Body, Caption, Micro } from "@/components/common/typography";
import { Button } from "@/components/ui/button";

/** 처리됨 행의 분류 라벨 — 인박스 3분류 외에 업로드 자동분류(지출·물품)도 나올 수 있다. */
const PROCESSED_ITEM_LABEL: Record<string, string> = {
  due: "회비",
  event_fee: "프로젝트",
  expense: "지출",
  goods: "물품",
  other: "제외",
};

/**
 * 처리됨(확정 완료) 거래 행 목록 — 감사·정정용.
 * 언제 누가 확정했는지 보여주고, 건별 확정취소(인박스 복귀 + 잔액 복구)를 제공한다.
 */
export function ProcessedRows({
  txns,
  busyId,
  onCancel,
}: {
  txns: ProcessedTxn[];
  busyId: string | null;
  onCancel: (txn: ProcessedTxn) => void;
}) {
  return (
    <>
      {txns.map((t) => (
        <tr key={t.txnId} className="border-b border-border align-top">
          <td className="px-2 py-2" />
          <td className="px-2 py-2">
            <Micro>{dayjs(t.txnDt).format("YY.MM.DD")}</Micro>
          </td>
          <td className="px-2 py-2">
            <Caption className="text-foreground">{t.rawName}</Caption>
          </td>
          <td className="px-2 py-2 text-right">
            <Body className="font-semibold">{t.amt.toLocaleString()}원</Body>
          </td>
          <td className="px-2 py-2">
            <Caption className="text-foreground">{t.memName ?? "—"}</Caption>
          </td>
          <td className="px-2 py-2">
            <Caption className="text-foreground">
              {t.feeItemCd ? (PROCESSED_ITEM_LABEL[t.feeItemCd] ?? t.feeItemCd) : "—"}
            </Caption>
          </td>
          <td className="px-2 py-2">
            <div className="flex items-center gap-2">
              <Micro>
                {dayjs(t.cfmAt).format("MM.DD HH:mm")} 확정
                {t.cfmByName ? ` · ${t.cfmByName}` : ""}
              </Micro>
              <Button
                type="button"
                size="xs"
                variant="outline"
                disabled={busyId !== null}
                onClick={() => onCancel(t)}
              >
                {busyId === t.txnId ? "취소 중…" : "취소"}
              </Button>
            </div>
          </td>
        </tr>
      ))}
    </>
  );
}
