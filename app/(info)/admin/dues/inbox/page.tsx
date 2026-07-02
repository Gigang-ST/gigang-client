import { getInboxTxns } from "@/lib/queries/dues";

import { InboxTable } from "./inbox-table";

export default async function DuesInboxPage() {
  const { members, txns } = await getInboxTxns();
  return <InboxTable members={members} txns={txns} />;
}
