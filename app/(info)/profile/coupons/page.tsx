import { notFound, redirect } from "next/navigation";

import { toCouponView, type CouponRow } from "@/lib/coupon/core";
import { COUPON_STATUS_LABEL } from "@/lib/coupon/status";
import { getCurrentMember } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { getTeamCfg } from "@/lib/team-cfg/read";

import { Body, Caption } from "@/components/common/typography";
import { EmptyState } from "@/components/common/empty-state";

/** 내 쿠폰 — 송년회 등에서 받은 실물 쿠폰의 웹 기록(#712). 실물을 잃어버려도 여기서 확인한다. */
export default async function MyCouponsPage() {
  const { user, member, supabase } = await getCurrentMember();
  if (!user) redirect("/auth/login?next=/profile/coupons");
  if (!member) redirect("/onboarding?next=/profile/coupons");

  const { teamId } = await getRequestTeamContext();
  // 쿠폰은 회비 화면 묶음 — 회비를 안 쓰는 팀은 이 화면이 없다
  if (!(await getTeamCfg(teamId, "feature.dues"))) notFound();

  const { data, error } = await supabase
    .from("cpn_mst")
    .select("cpn_id, mem_id, cpn_tp_cd, cpn_txt, cpn_amt, exp_dt, used_yn, used_dt, used_memo_txt, crt_at")
    .eq("team_id", teamId)
    .eq("mem_id", member.id)
    .eq("vers", 0)
    .eq("del_yn", false)
    .order("crt_at", { ascending: false })
    .limit(100);
  if (error) console.error("[coupons] 내 쿠폰 조회 실패", error.message);

  const coupons = ((data ?? []) as CouponRow[]).map((r) => toCouponView(r));
  // 쓸 수 있는 것을 위로, 그다음 사용함·만료
  const rank = { active: 0, used: 1, expired: 2 } as const;
  coupons.sort((a, b) => rank[a.status] - rank[b.status]);

  return (
    <div className="flex flex-col gap-4 px-6 pb-6 pt-2">
      {coupons.length === 0 ? (
        <EmptyState variant="card" message="받은 쿠폰이 없어요." />
      ) : (
        <ul className="flex flex-col gap-3">
          {coupons.map((c) => (
            <li
              key={c.cpn_id}
              className={`flex flex-col gap-1 rounded-2xl border border-border p-4 ${c.status === "active" ? "" : "opacity-60"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <Caption>{c.type_label}</Caption>
                <Caption className={c.status === "active" ? "text-primary" : undefined}>{COUPON_STATUS_LABEL[c.status]}</Caption>
              </div>
              <Body className="font-semibold">{c.cpn_txt}</Body>
              {c.cpn_amt != null ? <Caption className="text-foreground">{c.cpn_amt.toLocaleString()}원</Caption> : null}
              <Caption>{c.exp_dt ? `${c.exp_dt}까지` : "기한 없음"}</Caption>
              {c.used_yn ? (
                <Caption>
                  {c.used_dt} 사용{c.used_memo_txt ? ` · ${c.used_memo_txt}` : ""}
                </Caption>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
