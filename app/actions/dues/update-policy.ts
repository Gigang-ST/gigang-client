"use server";

import { verifyAdmin } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";

export async function updatePolicy({
  aplySttDt,
  aplyEndDt,
  monthlyFeeAmt,
}: {
  aplySttDt: string;
  aplyEndDt: string;
  monthlyFeeAmt: number;
}) {
  const adminUser = await verifyAdmin();
  if (!adminUser) return { ok: false as const, message: "권한이 없습니다." };

  const { teamId } = await getRequestTeamContext();
  const db = createAdminClient();

  if (aplySttDt > aplyEndDt) {
    return { ok: false as const, message: "시작일이 종료일보다 늦을 수 없습니다." };
  }
  if (monthlyFeeAmt <= 0) {
    return { ok: false as const, message: "월 회비는 0보다 커야 합니다." };
  }

  // 기간 중복 확인
  const { data: overlap } = await db
    .from("fee_policy_cfg")
    .select("fee_policy_id")
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false)
    .lte("aply_stt_dt", aplyEndDt)
    .gte("aply_end_dt", aplySttDt)
    .maybeSingle();

  if (overlap) return { ok: false as const, message: "기간이 겹치는 정책이 이미 존재합니다." };

  const { error } = await db.from("fee_policy_cfg").insert({
    team_id: teamId,
    aply_stt_dt: aplySttDt,
    aply_end_dt: aplyEndDt,
    monthly_fee_amt: monthlyFeeAmt,
    vers: 0,
    del_yn: false,
  });

  if (error) return { ok: false as const, message: "정책 저장에 실패했습니다." };
  return { ok: true as const, message: null };
}
