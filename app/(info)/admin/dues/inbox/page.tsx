import {
  getActiveProjects,
  getFeeItemOptions,
  getInboxTxns,
  getProcessedTxns,
  type ProcessedPage,
} from "@/lib/queries/dues";
import { parseProcessedFilter } from "@/lib/dues/processed-filter";

import { InboxTable } from "./inbox-table";

export default async function DuesInboxPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const processedFilter = parseProcessedFilter(await searchParams);
  // 처리됨(감사용 보조 뷰) 조회 실패가 핵심 저니(triage·확정)까지 깨뜨리지 않도록 격리한다.
  // 인박스 조회 실패는 기존대로 throw — 빈 화면이 정상으로 위장되면 안 된다.
  const inboxPromise = getInboxTxns();
  const feeItemsPromise = getFeeItemOptions();
  const projectsPromise = getActiveProjects();
  let processed: ProcessedPage = { rows: [], total: 0 };
  let processedError = false;
  try {
    processed = await getProcessedTxns(processedFilter);
  } catch (e) {
    console.error("[DuesInboxPage] 처리된 거래 조회 실패:", e);
    processedError = true;
  }
  const [{ members, txns }, feeItems, projects] = await Promise.all([
    inboxPromise,
    feeItemsPromise,
    projectsPromise,
  ]);

  return (
    <InboxTable
      members={members}
      txns={txns}
      processed={processed.rows}
      processedTotal={processed.total}
      processedFilter={processedFilter}
      processedError={processedError}
      feeItems={feeItems}
      projects={projects}
    />
  );
}
