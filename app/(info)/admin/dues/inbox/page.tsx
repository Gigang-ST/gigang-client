import { getInboxTxns } from "@/lib/queries/dues";

import { InboxClient } from "./inbox-client";

export default async function DuesInboxPage() {
  const { members, txns } = await getInboxTxns();
  return <InboxClient members={members} txns={txns} />;
}
