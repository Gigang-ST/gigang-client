import Link from "next/link";
import { FileSpreadsheet, Users, Settings, ReceiptText, BadgeCheck } from "lucide-react";

import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createClient } from "@/lib/supabase/server";
import dayjs from "dayjs";

import { Body, Caption, SectionLabel } from "@/components/common/typography";
import { CardItem } from "@/components/ui/card";
import { StatCard } from "@/components/common/stat-card";

export default async function DuesAdminDashboardPage() {
  const { teamId } = await getRequestTeamContext();
  const supabase = await createClient();

  const [
    { count: paidCount },
    { count: pendingTxnCount },
    { data: lastUpload },
    { data: confirmedTxns },
    { data: feeItemCds },
    { data: unpaidSnaps },
  ] = await Promise.all([
    // 이번 달 납부 완료 인원
    supabase
      .from("fee_due_pay_hist")
      .select("pay_id", { count: "exact", head: true })
      .eq("team_id", teamId)
      .eq("pay_st_cd", "paid")
      .eq("vers", 0)
      .eq("del_yn", false)
      .gte("pay_dt", dayjs().startOf("month").format("YYYY-MM-DD"))
      .lte("pay_dt", dayjs().endOf("month").format("YYYY-MM-DD")),
    // 미처리 거래 (미확정)
    supabase
      .from("fee_txn_hist")
      .select("txn_id", { count: "exact", head: true })
      .eq("team_id", teamId)
      .eq("is_cfm_yn", false)
      .eq("del_yn", false),
    // 마지막 업로드
    supabase
      .from("fee_xlsx_upd_hist")
      .select("file_nm, crt_at")
      .eq("team_id", teamId)
      .eq("vers", 0)
      .eq("del_yn", false)
      .order("crt_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // 확정된 입금 전체 (항목별 합산용)
    supabase
      .from("fee_txn_hist")
      .select("txn_amt, txn_io_enm, fee_item_cd")
      .eq("team_id", teamId)
      .eq("is_cfm_yn", true)
      .eq("del_yn", false),
    // FEE_ITEM_CD 공통코드 목록 (그룹 조인)
    supabase
      .from("cmm_cd_mst")
      .select("cd, cd_nm, cmm_cd_grp_mst!inner(cd_grp_cd)")
      .eq("cmm_cd_grp_mst.cd_grp_cd", "FEE_ITEM_CD")
      .eq("vers", 0)
      .eq("del_yn", false)
      .order("sort_ord", { ascending: true }),
    // 미납 회원 mem_id 목록 (fee_mem_bal_snap → team_mem_rel 직접 FK 없으므로 2단계)
    supabase
      .from("fee_mem_bal_snap")
      .select("mem_id")
      .eq("team_id", teamId)
      .eq("vers", 0)
      .eq("del_yn", false)
      .lt("bal_amt", 0),
  ]);

  // 미납 회원 중 active 상태인 인원만 카운트
  const unpaidMemIds = (unpaidSnaps ?? []).map((s) => s.mem_id);
  let unpaidCount = 0;
  if (unpaidMemIds.length > 0) {
    const { count } = await supabase
      .from("team_mem_rel")
      .select("mem_id", { count: "exact", head: true })
      .eq("team_id", teamId)
      .in("mem_id", unpaidMemIds)
      .eq("mem_st_cd", "active")
      .eq("vers", 0)
      .eq("del_yn", false);
    unpaidCount = count ?? 0;
  }

  // 항목별 합산 (공통코드 기준 동적)
  const txns = confirmedTxns ?? [];
  const itemCds = (feeItemCds ?? []).map((c) => c.cd);

  const itemTotals = itemCds.map((cd) => {
    const cdRow = (feeItemCds ?? []).find((c) => c.cd === cd);
    const total = txns.filter((t) => t.fee_item_cd === cd).reduce((s, t) => s + t.txn_amt, 0);
    return { cd, label: cdRow?.cd_nm ?? cd, total, isExpense: cd === "expense" };
  });

  const totalIn = itemTotals.filter((i) => !i.isExpense).reduce((s, i) => s + i.total, 0);
  const expenseTotal = itemTotals.find((i) => i.isExpense)?.total ?? 0;
  const balance = totalIn - expenseTotal;

  const menus = [
    { href: "/admin/dues/transactions", icon: FileSpreadsheet, label: "거래 내역", desc: "xlsx 업로드 및 확정 처리" },
    { href: "/admin/dues/members", label: "회원별 현황", icon: Users, desc: "잔액·면제 현황 및 정산 실행" },
    { href: "/admin/dues/exemptions", label: "면제 관리", icon: BadgeCheck, desc: "회원별 회비 면제 규칙 등록·수정·삭제" },
    { href: "/admin/dues/policy", label: "회비 정책", icon: Settings, desc: "월 회비 금액 설정 / 거래 분류 항목 관리" },
    { href: "/admin/dues/expenses", label: "지출 내역", icon: ReceiptText, desc: "지출 거래 조회" },
  ];

  return (
    <div className="flex flex-col gap-6 px-6 pb-6 pt-2">
      {/* 납부 현황 */}
      <div className="flex flex-col gap-2">
        <SectionLabel>납부 현황</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          <Link href="/admin/dues/transactions?filter=confirmed">
            <StatCard value={paidCount ?? 0} label="이번 달 납부 →" />
          </Link>
          <Link href="/admin/dues/members?filter=unpaid">
            <StatCard value={unpaidCount ?? 0} label="미납 회원 →" valueClassName={(unpaidCount ?? 0) > 0 ? "text-destructive" : undefined} />
          </Link>
          <Link href="/admin/dues/transactions">
            <StatCard value={pendingTxnCount ?? 0} label="미처리 거래 →" valueClassName={(pendingTxnCount ?? 0) > 0 ? "text-warning" : undefined} />
          </Link>
        </div>
      </div>

      {/* 항목별 입금 */}
      <div className="flex flex-col gap-2">
        <SectionLabel>항목별 입금 (확정 기준)</SectionLabel>
        <CardItem className="flex flex-col divide-y divide-border p-0 overflow-hidden">
          {itemTotals.filter((i) => !i.isExpense).map((item) => (
            <div key={item.cd} className="flex items-center justify-between px-4 py-3">
              <Caption className="text-foreground">{item.label}</Caption>
              <Body className="font-semibold">+{item.total.toLocaleString()}원</Body>
            </div>
          ))}
          {itemTotals.filter((i) => i.isExpense).map((item) => (
            <div key={item.cd} className="flex items-center justify-between px-4 py-3 bg-muted/40">
              <Caption className="text-foreground font-semibold">{item.label}</Caption>
              <Body className="font-semibold text-destructive">-{item.total.toLocaleString()}원</Body>
            </div>
          ))}
          <div className="flex items-center justify-between px-4 py-3">
            <Caption className="text-foreground font-semibold">잔액</Caption>
            <Body className={`font-bold ${balance >= 0 ? "text-primary" : "text-destructive"}`}>
              {balance >= 0 ? "+" : ""}{balance.toLocaleString()}원
            </Body>
          </div>
        </CardItem>
      </div>

      {/* 마지막 업로드 */}
      {lastUpload && (
        <CardItem className="flex flex-col gap-1 p-4">
          <SectionLabel>마지막 업로드</SectionLabel>
          <Body className="text-sm">{lastUpload.file_nm}</Body>
          <Caption>{dayjs(lastUpload.crt_at).format("YYYY.MM.DD HH:mm")}</Caption>
        </CardItem>
      )}

      {/* 메뉴 */}
      <div className="flex flex-col gap-2">
        <SectionLabel>관리 메뉴</SectionLabel>
        <div className="flex flex-col gap-2">
          {menus.map((m) => (
            <Link key={m.href} href={m.href}>
              <CardItem className="flex items-center gap-4 p-4">
                <m.icon className="size-5 text-muted-foreground shrink-0" />
                <div className="flex flex-col gap-0.5">
                  <Body className="font-semibold">{m.label}</Body>
                  <Caption>{m.desc}</Caption>
                </div>
              </CardItem>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
