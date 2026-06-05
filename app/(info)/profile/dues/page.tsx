import { redirect } from "next/navigation";

import dayjs from "dayjs";
import { getCurrentMember } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createClient } from "@/lib/supabase/server";

import { Body, Caption, SectionLabel } from "@/components/common/typography";
import { CardItem } from "@/components/ui/card";

export default async function MemberDuesPage() {
  const { user, member } = await getCurrentMember();

  if (!user) redirect("/auth/login?next=/profile/dues");
  if (!member) redirect("/onboarding?next=/profile/dues");

  const { teamId } = await getRequestTeamContext();
  const supabase = await createClient();

  const [{ data: snap }, { data: pays }, { data: exms }] = await Promise.all([
    supabase
      .from("fee_mem_bal_snap")
      .select("bal_amt, last_calc_dt")
      .eq("team_id", teamId)
      .eq("mem_id", member.id)
      .eq("vers", 0)
      .eq("del_yn", false)
      .maybeSingle(),
    supabase
      .from("fee_due_pay_hist")
      .select("pay_id, pay_amt, pay_dt, pay_st_cd")
      .eq("team_id", teamId)
      .eq("mem_id", member.id)
      .eq("pay_st_cd", "paid")
      .eq("vers", 0)
      .eq("del_yn", false)
      .order("pay_dt", { ascending: false })
      .limit(50),
    supabase
      .from("fee_due_exm_hist")
      .select("exm_hist_id, exm_amt, aply_ym, rsn_txt")
      .eq("team_id", teamId)
      .eq("mem_id", member.id)
      .eq("vers", 0)
      .eq("del_yn", false)
      .order("aply_ym", { ascending: false })
      .limit(50),
  ]);

  const balAmt = snap?.bal_amt ?? null;
  const isUnpaid = balAmt !== null && balAmt < 0;

  // 납부 + 면제를 날짜 기준으로 합쳐서 타임라인 구성
  type TimelineItem =
    | { kind: "pay"; date: string; amt: number; id: string }
    | { kind: "exm"; date: string; amt: number; rsn: string | null; id: string };

  const timeline: TimelineItem[] = [
    ...(pays ?? []).map((p) => ({
      kind: "pay" as const,
      date: p.pay_dt,
      amt: p.pay_amt,
      id: p.pay_id,
    })),
    ...(exms ?? []).map((e) => ({
      kind: "exm" as const,
      date: e.aply_ym + "-01",
      amt: e.exm_amt,
      rsn: e.rsn_txt,
      id: e.exm_hist_id,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="flex flex-col gap-6 px-6 pb-6 pt-2">
      {/* 잔액 카드 */}
      <CardItem className="flex flex-col gap-1 p-5">
        <SectionLabel>현재 잔액</SectionLabel>
        {balAmt === null ? (
          <Body className="text-muted-foreground">아직 정산 내역이 없습니다.</Body>
        ) : (
          <Body
            className={`text-2xl font-bold ${
              balAmt < 0 ? "text-destructive" : balAmt === 0 ? "text-foreground" : "text-primary"
            }`}
          >
            {balAmt > 0 && "+"}
            {balAmt.toLocaleString()}원
          </Body>
        )}
        {balAmt !== null && balAmt > 0 && (
          <Caption>예치금 보유 중</Caption>
        )}
        {balAmt === 0 && <Caption>납부 완료</Caption>}
        {snap?.last_calc_dt && (
          <Caption className="mt-1">
            {dayjs(snap.last_calc_dt).format("YYYY년 M월 D일")} 기준
          </Caption>
        )}
      </CardItem>

      {/* 미납 안내 */}
      {isUnpaid && (
        <CardItem variant="outlined" className="flex flex-col gap-2 p-4">
          <Body className="font-semibold text-destructive">납부 안내</Body>
          <Caption>카카오뱅크 3333-09-6788223</Caption>
          <Caption>입금자명: 본인 실명 (띄어쓰기 없이)</Caption>
          <Caption className="text-destructive">
            미납액: {Math.abs(balAmt!).toLocaleString()}원
          </Caption>
        </CardItem>
      )}

      {/* 납부·면제 타임라인 */}
      <div className="flex flex-col gap-3">
        <SectionLabel>납부·면제 내역</SectionLabel>
        {timeline.length === 0 ? (
          <Body className="text-muted-foreground">내역이 없습니다.</Body>
        ) : (
          <CardItem className="flex flex-col divide-y divide-border p-0 overflow-hidden">
            {timeline.map((item) => (
              <div key={item.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex flex-col gap-0.5">
                  <Caption className="text-foreground">
                    {item.kind === "pay"
                      ? dayjs(item.date).format("YYYY.MM.DD")
                      : item.date.slice(0, 7).replace("-", "년 ") + "월"}
                  </Caption>
                  {item.kind === "exm" && item.rsn && (
                    <Caption>{item.rsn}</Caption>
                  )}
                </div>
                <Body
                  className={`font-semibold ${
                    item.kind === "pay" ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {item.kind === "pay" ? "입금" : "면제"} +{item.amt.toLocaleString()}원
                </Body>
              </div>
            ))}
          </CardItem>
        )}
      </div>
    </div>
  );
}
