import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createClient } from "@/lib/supabase/server";
import dayjs from "dayjs";

import { Body, Caption, SectionLabel } from "@/components/common/typography";
import { CardItem } from "@/components/ui/card";
import { EmptyState } from "@/components/common/empty-state";

export default async function DuesExpensesPage() {
  const { teamId } = await getRequestTeamContext();
  const supabase = await createClient();

  const { data: expenses } = await supabase
    .from("fee_txn_hist")
    .select("txn_id, txn_dt, txn_amt, raw_name, adm_memo_txt, is_cfm_yn")
    .eq("team_id", teamId)
    .eq("fee_item_cd", "expense")
    .eq("del_yn", false)
    .order("txn_dt", { ascending: false })
    .limit(100);

  const total = (expenses ?? []).reduce((sum, e) => sum + e.txn_amt, 0);

  return (
    <div className="flex flex-col gap-6 px-6 pb-6 pt-2">
      {/* 합계 */}
      <CardItem className="flex flex-col gap-1 p-4">
        <SectionLabel>총 지출</SectionLabel>
        <Body className="text-2xl font-bold">{total.toLocaleString()}원</Body>
        <Caption>{expenses?.length ?? 0}건</Caption>
      </CardItem>

      {/* 목록 */}
      <div className="flex flex-col gap-2">
        <SectionLabel>지출 내역</SectionLabel>
        {(expenses ?? []).length === 0 ? (
          <EmptyState message="지출 내역이 없습니다." />
        ) : (
          <CardItem className="flex flex-col divide-y divide-border p-0 overflow-hidden">
            {(expenses ?? []).map((e) => (
              <div key={e.txn_id} className="flex items-center justify-between px-4 py-3">
                <div className="flex flex-col gap-0.5">
                  <Body>{e.adm_memo_txt ?? e.raw_name}</Body>
                  <Caption>{dayjs(e.txn_dt).format("YYYY.MM.DD")}</Caption>
                </div>
                <Body className="font-semibold text-muted-foreground">
                  -{e.txn_amt.toLocaleString()}원
                </Body>
              </div>
            ))}
          </CardItem>
        )}
      </div>
    </div>
  );
}
