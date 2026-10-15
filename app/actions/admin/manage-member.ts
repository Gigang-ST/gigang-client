"use server";

import { revalidatePath } from "next/cache";

import { recalculateBalance } from "@/app/actions/dues/recalculate-balance";
import { withAdmin } from "@/lib/actions/auth";
import { dayjs } from "@/lib/dayjs";
import { sealBalanceAnchor } from "@/lib/dues/seal-anchor";
import { insertNoti } from "@/lib/notifications/insert-noti";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";
import { koreanNameSchema } from "@/lib/validations/member";

/**
 * 회비 잔액(원) 조회 — 없으면 0. **음수가 미납, 양수가 예치금.**
 *
 * "삭제" 한 회원이 재가입하면 잔액을 0원 앵커로 봉인하므로(`sealBalanceAnchor` —
 * 함수 주석이 "예치금·미납을 청산"이라고 적고 있다), 잔액이 0이 아닌 사람을 삭제하면
 * **그 돈이 양쪽 방향 모두 조용히 사라진다.** 그걸 막는 가드가 쓰는 조회다.
 */
async function getBalanceAmount(
  db: ReturnType<typeof createAdminClient>,
  teamId: string,
  memId: string,
): Promise<number> {
  const { data } = await db
    .from("fee_mem_bal_snap")
    .select("bal_amt")
    .eq("team_id", teamId)
    .eq("mem_id", memId)
    .eq("vers", 0)
    .eq("del_yn", false)
    .maybeSingle();
  return data?.bal_amt ?? 0;
}

/**
 * 재활성화 완료를 **본인에게** 알린다. 비치명 — 실패해도 재활성화 자체는 성립.
 *
 * 상태 변경 중 유일하게 본인에게 통보하는 지점이다. 비활성·탈퇴는 본인이 참여를 시도할 때
 * 차단 화면이 사유를 말해 주지만(`InactiveGateDialog`·프로필탭), 재활성화는 **본인이
 * 요청해 놓고 기다리는 소식**이라 통보가 없으면 앱을 다시 열어 뭔가 해봐야 풀린 걸 안다.
 * `reactivate_req`(관리자행 요청)와 짝을 이뤄 고리를 닫는다.
 *
 * 단건·일괄 두 경로가 **같이** 불러야 한다 — 한쪽만 걸면 일괄 재활성화된 사람은 통보를
 * 못 받는데, 그 차이를 본인은 알 길이 없다.
 */
async function notifyReactivated(teamId: string, memIds: string[]) {
  await Promise.all(
    memIds.map((memId) =>
      insertNoti({
        teamId,
        memId,
        notiTypeEnm: "reactivated",
        notiNm: "다시 활동할 수 있어요",
        notiCont: "운영진이 활동을 재개해 주셨어요. 모임·대회에 다시 참여할 수 있어요.",
      }).catch((e) => console.error("[reactivated] 알림 발송 실패", memId, e)),
    ),
  );
}

/**
 * `pending` 상태를 만드는 코드는 더 이상 없다 — 가입 승인 흐름은 #163 에서 걷어냈고,
 * 그 뒤 남아 있던 approveMember·rejectMember 와 /admin/approvals 화면도 2026-10 에 지웠다
 * (prd `pending` 회원 0명, 화면으로 가는 링크 0개). 삭제된 회원의 재가입은 승인 없이
 * 본인이 끝낸다(`onboardingRejoinDeletedMember`).
 */

export async function updateMemberName(memberId: string, name: string) {
  return withAdmin(async () => {
    const parsed = koreanNameSchema.safeParse(name);
    if (!parsed.success) {
      return {
        ok: false as const,
        message: parsed.error.issues[0]?.message ?? "이름을 확인해 주세요",
      };
    }
    const newName = parsed.data;

    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();

    const { data: rel } = await db
      .from("team_mem_rel")
      .select("team_mem_id")
      .eq("mem_id", memberId)
      .eq("team_id", teamId)
      .eq("vers", 0)
      .eq("del_yn", false)
      .maybeSingle();
    if (!rel) return { ok: false as const, message: "변경할 수 있는 대상이 아닙니다" };

    const { error } = await db
      .from("mem_mst")
      .update({ mem_nm: newName })
      .eq("mem_id", memberId)
      .eq("vers", 0)
      .eq("del_yn", false);
    if (error) return { ok: false as const, message: "이름 변경에 실패했습니다" };

    revalidatePath("/admin/members");
    // 회비 인박스가 이름으로 입금자를 맞추므로 함께 턴다(매칭 결과가 즉시 새 이름 기준이 되게).
    revalidatePath("/admin/dues");
    return { ok: true as const, message: null, name: newName };
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

    // 잔액이 0이 아니면 삭제할 수 없다 — **회비는 탈퇴로 사라지지 않는다**(이슈 #571).
    //
    // 삭제는 vers=0 슬롯을 비우고, 그 사람이 같은 번호로 재가입하면 과거 잔액을 0원으로
    // 봉인한다(`sealBalanceAnchor`). 그래서 잔액을 남긴 채 삭제하면 그 돈이 증발한다.
    //
    // **양쪽을 다 막는다.** 처음엔 미납(음수)만 막았는데, 봉인은 부호를 가리지 않아
    // 예치금(양수)도 똑같이 0으로 민다(prd 실측 34명·257,500원 보유, 최대 98,000원).
    // 8천원 안 내서 정리된 사람이 다시 들어올 때 8천원이 남아야 한다면, 9만 8천원 맡기고
    // 나간 사람이 다시 들어올 때 그 돈도 남아야 한다 — 한쪽만 지키면 규칙이 아니라 편의다.
    //   - 미납이면 → 탈퇴(`left`)로 남긴다(상태 전환 시트의 "탈퇴 처리").
    //   - 예치금이면 → 환급·정산해 0으로 만든 뒤 삭제한다.
    //
    // 이 가드가 "삭제된 사람 = 주고받을 돈이 없는 사람"을 보장하고, 그래야 삭제 회원의
    // **무승인 자동 재가입**(`onboardingRejoinDeletedMember`)이 안전해진다. 둘은 한 쌍이라
    // 따로 떼지 않는다 — 가드를 풀면 재가입이 돈을 지우는 경로가 된다.
    const balance = await getBalanceAmount(db, teamId, memberId);
    if (balance < 0) {
      return {
        ok: false,
        message: `미납 회비 ${(-balance).toLocaleString()}원이 남아 있어 삭제할 수 없습니다. 탈퇴 처리로 남겨 주세요.`,
      };
    }
    if (balance > 0) {
      return {
        ok: false,
        message: `예치금 ${balance.toLocaleString()}원이 남아 있어 삭제할 수 없습니다. 환급·정산으로 잔액을 0원으로 맞춘 뒤 삭제해 주세요.`,
      };
    }

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

    // 비활성 처리 즉시 재계산 — 상태 이력만 바꾸면 이미 부과된 비활성월 회비가 잔액에 남는다.
    await recalculateBalance([memberId]);
    revalidatePath("/admin/members");
    revalidatePath("/admin/dues");
    return { ok: true, message: null };
  });
}

export async function leaveMemberFromDues(memberId: string, reason?: string) {
  return withAdmin(async ({ member }) => {
    if (member.id === memberId) return { ok: false, message: "본인은 탈퇴 처리할 수 없습니다" };

    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();
    const nowIso = dayjs().toISOString();
    // 상태 전환 시트가 active·inactive 회원 모두 "탈퇴 처리"를 노출하므로 둘 다 대상.
    // (이미 left면 재처리 무의미 → 제외.)
    const { data: rel } = await db
      .from("team_mem_rel")
      .select("team_mem_id")
      .eq("mem_id", memberId)
      .eq("team_id", teamId)
      .eq("vers", 0)
      .eq("del_yn", false)
      .in("mem_st_cd", ["active", "inactive"])
      .neq("team_role_cd", "owner")
      .maybeSingle();
    if (!rel) return { ok: false, message: "탈퇴 처리할 수 있는 대상이 아닙니다" };
    const { error } = await db.rpc("apply_team_mem_rel_change", {
      p_team_mem_id: rel.team_mem_id,
      p_changes: {
        mem_st_cd: "left",
        inact_rsn_txt: reason || "관리자 탈퇴 처리",
        leave_dt: dayjs().tz("Asia/Seoul").format("YYYY-MM-DD"),
      },
      p_eff_at: nowIso,
    });
    if (error) return { ok: false, message: "탈퇴 처리에 실패했습니다" };

    // 탈퇴 처리 즉시 재계산 — 탈퇴월 이후 부과가 잔액에 남지 않게 상태 이력 반영.
    await recalculateBalance([memberId]);
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
    // left→active 재활성 시 leave_dt 도 비운다 — 남아 있으면 활성 관계에 탈퇴일이 붙어 모순.
    const { error } = await db.rpc("apply_team_mem_rel_change", {
      p_team_mem_id: rel.team_mem_id,
      p_changes: { mem_st_cd: "active", inact_rsn_txt: null, leave_dt: null },
      p_eff_at: nowIso,
    });
    if (error) return { ok: false, message: "활성화에 실패했습니다" };

    if (resetBalance) {
      // 잔액 초기화: 0원 앵커로 봉인(과거 예치금·미납 청산). 재계산이 anchor_yn 앵커를
      // 잡아 재활성 다음 달부터만 부과. 봉인 실패는 잔액 오염으로 이어지므로 표면화.
      const { error: sealErr } = await sealBalanceAnchor(db, teamId, memberId);
      if (sealErr) return { ok: false, message: sealErr };
    }

    await recalculateBalance([memberId]);
    await notifyReactivated(teamId, [memberId]);
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
    // 비활성 처리한 회원들 잔액 재계산 — 비활성월 이후 부과 제외 반영.
    await recalculateBalance(safe.map((r) => r.mem_id));
    revalidatePath("/admin/members");
    revalidatePath("/admin/dues");
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
        p_changes: { mem_st_cd: "active", inact_rsn_txt: null, leave_dt: null },
        p_eff_at: effAt,
      });
      if (error) return { ok: false, message: "일괄 활성화에 실패했습니다" };
    }
    // 일괄은 잔액 보존(초기화 없음) — 비활성 기간 제외만 재계산에 반영.
    await recalculateBalance(rels.map((r) => r.mem_id));
    await notifyReactivated(teamId, rels.map((r) => r.mem_id));
    revalidatePath("/admin/members");
    revalidatePath("/admin/dues");
    return { ok: true, message: null };
  });
}
