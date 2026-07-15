"use server";

import { revalidatePath } from "next/cache";

import { recalculateBalance } from "@/app/actions/dues/recalculate-balance";
import { withAdmin } from "@/lib/actions/auth";
import { dayjs } from "@/lib/dayjs";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";

export async function approveMember(memberId: string) {
  return withAdmin(async () => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();
    const { data: rel } = await db
      .from("team_mem_rel")
      .select("team_mem_id")
      .eq("mem_id", memberId)
      .eq("team_id", teamId)
      .eq("vers", 0)
      .eq("del_yn", false)
      .eq("mem_st_cd", "pending")
      .maybeSingle();
    if (!rel) return { ok: false, message: "승인할 수 있는 대상이 아닙니다" };
    const { error } = await db.rpc("apply_team_mem_rel_change", {
      p_team_mem_id: rel.team_mem_id,
      p_changes: { mem_st_cd: "active" },
      p_eff_at: dayjs().toISOString(),
    });
    if (error) return { ok: false, message: "승인에 실패했습니다" };
    return { ok: true, message: null };
  });
}

export async function rejectMember(memberId: string) {
  return withAdmin(async () => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();
    const { data: rel } = await db
      .from("team_mem_rel")
      .select("team_mem_id")
      .eq("mem_id", memberId)
      .eq("team_id", teamId)
      .eq("vers", 0)
      .eq("del_yn", false)
      .eq("mem_st_cd", "pending")
      .maybeSingle();
    if (!rel) return { ok: false, message: "거절할 수 있는 대상이 아닙니다" };
    const { error } = await db.rpc("apply_team_mem_rel_change", {
      p_team_mem_id: rel.team_mem_id,
      p_changes: { mem_st_cd: "inactive" },
      p_eff_at: dayjs().toISOString(),
    });
    if (error) return { ok: false, message: "거절에 실패했습니다" };
    return { ok: true, message: null };
  });
}

export async function toggleAdmin(memberId: string, isAdmin: boolean) {
  return withAdmin(async ({ member }) => {
    if (member.id === memberId) return { ok: false, message: "본인의 관리자 권한은 변경할 수 없습니다" };

    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();
    const { data: rel, error: relErr } = await db
      .from("team_mem_rel")
      .select("team_mem_id, team_role_cd")
      .eq("mem_id", memberId)
      .eq("team_id", teamId)
      .eq("vers", 0)
      .eq("del_yn", false)
      .maybeSingle();
    if (relErr || !rel) return { ok: false, message: "변경에 실패했습니다" };
    if (rel.team_role_cd === "owner") return { ok: false, message: "크루장 권한은 변경할 수 없습니다" };

    const newRole = isAdmin ? "admin" : "member";
    const { error } = await db.rpc("apply_team_mem_rel_change", {
      p_team_mem_id: rel.team_mem_id,
      p_changes: { team_role_cd: newRole },
      p_eff_at: dayjs().toISOString(),
    });
    if (error) return { ok: false, message: "변경에 실패했습니다" };
    return { ok: true, message: null };
  });
}

export async function deleteMember(memberId: string) {
  return withAdmin(async ({ member }) => {
    if (member.id === memberId) return { ok: false, message: "본인은 삭제할 수 없습니다" };

    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();

    const { data: rel } = await db
      .from("team_mem_rel")
      .select("team_mem_id, team_role_cd")
      .eq("mem_id", memberId)
      .eq("team_id", teamId)
      .eq("vers", 0)
      .eq("del_yn", false)
      .maybeSingle();
    if (!rel) return { ok: false, message: "삭제할 수 있는 대상이 아닙니다" };
    if (rel.team_role_cd === "owner") return { ok: false, message: "크루장은 삭제할 수 없습니다" };

    // 삭제 = vers 밀기(vers=0 슬롯 비움) → 재가입 가능. 상태 이력 보존.
    const { error } = await db.rpc("apply_team_mem_rel_delete", {
      p_team_mem_id: rel.team_mem_id,
      p_eff_at: dayjs().toISOString(),
    });
    if (error) return { ok: false, message: "삭제에 실패했습니다" };
    return { ok: true, message: null };
  });
}

export async function deactivateMember(memberId: string, reason?: string) {
  return withAdmin(async ({ member }) => {
    if (member.id === memberId) return { ok: false, message: "본인을 비활성화할 수 없습니다" };

    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();
    const { data: rel } = await db
      .from("team_mem_rel")
      .select("team_mem_id")
      .eq("mem_id", memberId)
      .eq("team_id", teamId)
      .eq("vers", 0)
      .eq("del_yn", false)
      .eq("mem_st_cd", "active")
      .neq("team_role_cd", "owner")
      .maybeSingle();
    if (!rel) return { ok: false, message: "비활성화할 수 있는 대상이 아닙니다" };
    const { error } = await db.rpc("apply_team_mem_rel_change", {
      p_team_mem_id: rel.team_mem_id,
      p_changes: { mem_st_cd: "inactive", inact_rsn_txt: reason ?? null },
      p_eff_at: dayjs().toISOString(),
    });
    if (error) return { ok: false, message: "비활성화에 실패했습니다" };
    return { ok: true, message: null };
  });
}

export async function leaveMemberFromDues(memberId: string, reason?: string) {
  return withAdmin(async ({ member }) => {
    if (member.id === memberId) return { ok: false, message: "본인은 탈퇴 처리할 수 없습니다" };

    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();
    const nowIso = dayjs().toISOString();
    const { data: rel } = await db
      .from("team_mem_rel")
      .select("team_mem_id")
      .eq("mem_id", memberId)
      .eq("team_id", teamId)
      .eq("vers", 0)
      .eq("del_yn", false)
      .eq("mem_st_cd", "active")
      .neq("team_role_cd", "owner")
      .maybeSingle();
    if (!rel) return { ok: false, message: "탈퇴 처리할 수 있는 대상이 아닙니다" };
    const { error } = await db.rpc("apply_team_mem_rel_change", {
      p_team_mem_id: rel.team_mem_id,
      p_changes: {
        mem_st_cd: "left",
        inact_rsn_txt: reason ?? "회비 미납으로 관리자 탈퇴 처리",
        leave_dt: dayjs().tz("Asia/Seoul").format("YYYY-MM-DD"),
      },
      p_eff_at: nowIso,
    });
    if (error) return { ok: false, message: "탈퇴 처리에 실패했습니다" };

    revalidatePath("/admin/dues");
    revalidatePath("/admin/members");
    return { ok: true, message: null };
  });
}

/**
 * 재활성화 — inactive/left 회원을 active로. 비활성 기간 회비 제외는 상태 이력(vers)으로
 * 재계산이 자동 처리. resetBalance=true 면 재활성 시점에 잔액을 0으로 초기화(기존 스냅샷
 * 무효화 + anchor_yn 개시잔액 생성), false(기본)면 기존 잔액(예치금·미납)을 보존한다.
 */
export async function reactivateMember(memberId: string, resetBalance = false) {
  return withAdmin(async () => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();
    const { data: rel } = await db
      .from("team_mem_rel")
      .select("team_mem_id")
      .eq("mem_id", memberId)
      .eq("team_id", teamId)
      .eq("vers", 0)
      .eq("del_yn", false)
      .in("mem_st_cd", ["inactive", "left"])
      .maybeSingle();
    if (!rel) return { ok: false, message: "활성화할 수 있는 대상이 아닙니다" };

    const nowIso = dayjs().toISOString();
    const { error } = await db.rpc("apply_team_mem_rel_change", {
      p_team_mem_id: rel.team_mem_id,
      p_changes: { mem_st_cd: "active", inact_rsn_txt: null },
      p_eff_at: nowIso,
    });
    if (error) return { ok: false, message: "활성화에 실패했습니다" };

    if (resetBalance) {
      // 잔액 초기화: 기존 스냅샷 무효화 후 0원 앵커(재활성월 초 기준) 생성.
      // 재계산은 anchor_yn 앵커를 잡아 재활성 다음 달부터만 부과 → 과거 잔액 봉인.
      await db.from("fee_mem_bal_snap").update({ del_yn: true })
        .eq("team_id", teamId).eq("mem_id", memberId).eq("del_yn", false);
      const monthStart = dayjs().tz("Asia/Seoul").startOf("month");
      await db.from("fee_mem_bal_snap").insert({
        team_id: teamId,
        mem_id: memberId,
        bal_amt: 0,
        last_calc_dt: monthStart.toISOString(),
        last_calc_at: nowIso,
        anchor_yn: true,
        vers: 0,
        del_yn: false,
      });
    }

    await recalculateBalance([memberId]);
    revalidatePath("/admin/members");
    revalidatePath("/admin/dues");
    return { ok: true, message: null };
  });
}

export async function batchDeactivateMembers(memberIds: string[], reason?: string) {
  if (!memberIds.length) return { ok: false, message: "대상이 없습니다" };
  return withAdmin(async ({ member }) => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();

    const { data: rels } = await db
      .from("team_mem_rel")
      .select("team_mem_id, mem_id, team_role_cd")
      .in("mem_id", memberIds)
      .eq("team_id", teamId)
      .eq("vers", 0)
      .eq("del_yn", false)
      .eq("mem_st_cd", "active");

    const safe = (rels ?? []).filter((r) => r.mem_id !== member.id && r.team_role_cd !== "owner");
    if (!safe.length) return { ok: false, message: "처리 가능한 대상이 없습니다" };

    const effAt = dayjs().toISOString();
    for (const r of safe) {
      const { error } = await db.rpc("apply_team_mem_rel_change", {
        p_team_mem_id: r.team_mem_id,
        p_changes: { mem_st_cd: "inactive", inact_rsn_txt: reason ?? null },
        p_eff_at: effAt,
      });
      if (error) return { ok: false, message: "일괄 비활성화에 실패했습니다" };
    }
    return { ok: true, message: null };
  });
}

export async function batchReactivateMembers(memberIds: string[]) {
  if (!memberIds.length) return { ok: false, message: "대상이 없습니다" };
  return withAdmin(async () => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();
    const { data: rels } = await db
      .from("team_mem_rel")
      .select("team_mem_id, mem_id")
      .in("mem_id", memberIds)
      .eq("team_id", teamId)
      .eq("vers", 0)
      .eq("del_yn", false)
      .in("mem_st_cd", ["inactive", "left"]);
    if (!rels?.length) return { ok: false, message: "활성화할 수 있는 대상이 없습니다" };

    const effAt = dayjs().toISOString();
    for (const r of rels) {
      const { error } = await db.rpc("apply_team_mem_rel_change", {
        p_team_mem_id: r.team_mem_id,
        p_changes: { mem_st_cd: "active", inact_rsn_txt: null },
        p_eff_at: effAt,
      });
      if (error) return { ok: false, message: "일괄 활성화에 실패했습니다" };
    }
    // 일괄은 잔액 보존(초기화 없음) — 비활성 기간 제외만 재계산에 반영.
    await recalculateBalance(rels.map((r) => r.mem_id));
    revalidatePath("/admin/members");
    revalidatePath("/admin/dues");
    return { ok: true, message: null };
  });
}
