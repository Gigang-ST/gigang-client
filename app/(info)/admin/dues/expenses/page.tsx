import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createClient } from "@/lib/supabase/server";

import { dayjs } from "@/lib/dayjs";

import { Body, Caption, SectionLabel } from "@/components/common/typography";
import { Badge } from "@/components/ui/badge";
import { CardItem } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function DuesExpensesPage() {
  const { teamId } = await getRequestTeamContext();
  const supabase = await createClient();

  // 지출 = 출금 거래 전부 (분류 불문). 통장에서 나간 돈은 어떤 이유든 지출로 본다.
  const [{ data: expenses, error: expErr }, { data: feeItemCds, error: cdErr }] = await Promise.all([
    supabase
      .from("fee_txn_hist")
      .select("txn_id, txn_dt, txn_tm, txn_amt, raw_name, adm_memo_txt, fee_item_cd, is_cfm_yn")
      .eq("team_id", teamId)
      .eq("txn_io_enm", "withdrawal")
      .eq("del_yn", false)
      .order("txn_dt", { ascending: false })
      .limit(200),
    supabase
      .from("cmm_cd_mst")
      .select("cd, cd_nm, cmm_cd_grp_mst!inner(cd_grp_cd)")
      .eq("cmm_cd_grp_mst.cd_grp_cd", "FEE_ITEM_CD")
      .eq("vers", 0)
      .eq("del_yn", false),
  ]);

  // 조회 실패를 "0원 / 지출 없음"으로 숨기면 운영자가 잘못 판단한다.
  if (expErr) throw new Error(`지출 조회 실패: ${expErr.message}`);
  if (cdErr) throw new Error(`분류 코드 조회 실패: ${cdErr.message}`);

  const rows = expenses ?? [];
  const labelOf = (cd: string | null) =>
    (feeItemCds ?? []).find((c) => c.cd === cd)?.cd_nm ?? cd ?? "-";

  // 확정된 출금만 합산 (미확정은 아직 미정)
  const confirmedTotal = rows.filter((e) => e.is_cfm_yn).reduce((sum, e) => sum + e.txn_amt, 0);

  return (
    <div className="flex flex-col gap-6 px-6 pb-6 pt-2">
      {/* 합계 */}
      <CardItem className="flex flex-col gap-1 p-4">
        <SectionLabel>총 지출 (확정 기준)</SectionLabel>
        <Body className="text-2xl font-bold text-destructive">-{confirmedTotal.toLocaleString()}원</Body>
        <Caption>출금 {rows.length}건 (확정 {rows.filter((e) => e.is_cfm_yn).length}건)</Caption>
      </CardItem>

      {/* 목록 */}
      <div className="flex flex-col gap-2">
        <SectionLabel>지출 내역</SectionLabel>
        <div className="overflow-x-auto rounded-2xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                {["일시", "이름", "분류", "금액", "확정"].map((h) => (
                  <TableHead key={h} className="text-center text-xs whitespace-nowrap">{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center">
                    <Caption className="text-muted-foreground">지출 내역이 없습니다.</Caption>
                  </TableCell>
                </TableRow>
              )}
              {rows.map((e) => (
                <TableRow key={e.txn_id} className={e.is_cfm_yn ? "" : "opacity-60"}>
                  <TableCell className="text-center">
                    <div className="flex flex-col items-center leading-tight">
                      <Caption className="text-xs text-foreground whitespace-nowrap">{dayjs(e.txn_dt).format("YY.MM.DD")}</Caption>
                      {e.txn_tm && (
                        <Caption className="text-[10px] text-muted-foreground whitespace-nowrap">
                          {dayjs(`${e.txn_dt}T${e.txn_tm}`).format("HH:mm")}
                        </Caption>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <Caption className="text-xs text-foreground whitespace-nowrap">{e.adm_memo_txt ?? e.raw_name}</Caption>
                  </TableCell>
                  <TableCell className="text-center">
                    <Caption className="text-xs text-foreground whitespace-nowrap">{labelOf(e.fee_item_cd)}</Caption>
                  </TableCell>
                  <TableCell className="text-center">
                    <Caption className="text-xs font-semibold text-destructive whitespace-nowrap">
                      -{e.txn_amt.toLocaleString()}원
                    </Caption>
                  </TableCell>
                  <TableCell className="text-center">
                    {e.is_cfm_yn ? (
                      <Badge variant="default" className="text-xs">확정</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">미확정</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
