import { getDuesLedger } from "@/lib/queries/dues";

import { LedgerClient } from "./ledger-client";

export default async function DuesLedgerPage() {
  const { rows, summary } = await getDuesLedger();
  return <LedgerClient rows={rows} summary={summary} />;
}
