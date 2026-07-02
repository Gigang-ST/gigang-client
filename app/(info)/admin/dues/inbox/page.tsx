import {
  getFeeItemOptions,
  getInboxTxns,
  getProcessedTxns,
  PROCESSED_TXN_LIMIT,
  type ProcessedTxn,
} from "@/lib/queries/dues";

import { InboxTable } from "./inbox-table";

export default async function DuesInboxPage() {
  // 처리됨(감사용 보조 뷰) 조회 실패가 핵심 저니(triage·확정)까지 깨뜨리지 않도록 격리한다.
  // 인박스 조회 실패는 기존대로 throw — 빈 화면이 정상으로 위장되면 안 된다.
  const inboxPromise = getInboxTxns();
  const feeItemsPromise = getFeeItemOptions();
  let processed: ProcessedTxn[] = [];
  let processedError = false;
  try {
    processed = await getProcessedTxns();
  } catch (e) {
    console.error("[DuesInboxPage] 처리된 거래 조회 실패:", e);
    processedError = true;
  }
  const [{ members, txns }, feeItems] = await Promise.all([inboxPromise, feeItemsPromise]);

  return (
    <InboxTable
      members={members}
      txns={txns}
      processed={processed}
      processedCapped={processed.length >= PROCESSED_TXN_LIMIT}
      processedError={processedError}
      feeItems={feeItems}
    />
  );
}
