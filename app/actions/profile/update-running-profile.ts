"use server";

import { revalidatePath } from "next/cache";

import { withMember } from "@/lib/actions/auth";
import {
  runningProfileEditSchema,
  type RunningProfileEditValues,
} from "@/lib/validations/member";
import { createUntypedAdminClient } from "@/lib/supabase/admin";

/**
 * `/profile/edit` 러닝 프로필 저장 — mem_onbd_prf에서 카드 "소개"에 쓰이는 값만 다룬다.
 *
 * `updateNearStation`과 같은 upsert(onConflict: mem_id) 패턴 — PostgREST upsert는 제공된
 * 컬럼만 UPDATE하므로 유입 경로·참석 약속(`attd_pldg_at`) 같은 온보딩 전용 컬럼은 그대로 남는다.
 * 참석 약속은 넛지 크론이 참조하니 이 액션이 절대 건드리면 안 된다.
 *
 * mem_onbd_prf row가 없는 개편 전 가입자는 upsert가 INSERT로 처리한다.
 */
export async function updateRunningProfile(
  input: RunningProfileEditValues,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const parsed = runningProfileEditSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "입력값이 올바르지 않습니다." };
  }

  return withMember(async ({ member }) => {
    const admin = createUntypedAdminClient();

    const { error } = await admin.from("mem_onbd_prf").upsert(
      {
        mem_id: member.id,
        avg_run_dist_km: parsed.data.avgRunDistKm,
        avg_pace_cd: parsed.data.avgPaceCd,
        join_purp_cds: parsed.data.joinPurpCds,
        // 빈 문자열은 null로 — 카드가 "값 있음"으로 오판해 빈 인용구를 그리지 않게.
        join_purp_txt: parsed.data.joinPurpTxt?.trim() || null,
      },
      { onConflict: "mem_id" },
    );

    if (error) {
      console.error("[profile] 러닝 프로필 저장 실패", member.id, error.message);
      return { ok: false, message: "러닝 프로필 저장에 실패했습니다." };
    }

    revalidatePath("/profile/edit");
    revalidatePath("/profile");
    return { ok: true };
  });
}
