import { getUtmbLastRefreshedAt } from "@/app/actions/admin/get-utmb-last-refreshed-at";
import { UtmbRefreshClient } from "@/components/admin/utmb-refresh-client";

export default async function UtmbRefreshPage() {
  const meta = await getUtmbLastRefreshedAt();
  return <UtmbRefreshClient meta={meta} />;
}
