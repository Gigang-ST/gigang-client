"use server";

import { revalidatePath } from "next/cache";

import { withMember } from "@/lib/actions/auth";
import {
  runningProfileEditSchema,
  type RunningProfileEditValues,
} from "@/lib/validations/member";
import { createUntypedAdminClient } from "@/lib/supabase/admin";

/**
 * `/profile/edit` "러닝 프로필" 섹션 저장 — 역·거리·페이스·가입 목적만 다룬다.
 * 설계 §6.3: attd_pldg_at·pldg_gthr_id·join_src_cd·join_src_txt는 온보딩 서버 액션 전용이라
 * 이 액션에서는 절대 건드리지 않는다(UPDATE 컬럼을 명시해 upsert의 암묵적 덮어쓰기를 피함).
 *
 * mem_onbd_prf row가 없는 기존 회원(개편 전 가입자)은 이 액션이 최초 INSERT를 만든다 —
 * 이 경우 온보딩 전용 컬럼은 전부 기본값(null/기타 기본값)으로 남는다.
 */
export async function updateRunningProfile(
  input: RunningProfileEditValues,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const parsed = runningProfileEditSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "입력값이 올바르지 않습니다." };
  }
  const values = parsed.data;

  return withMember(async ({ member }) => {
    const admin = createUntypedAdminClient();

    const { data: existing } = await admin
      .from("mem_onbd_prf")
      .select("mem_id")
      .eq("mem_id", member.id)
      .maybeSingle();

    const payload = {
      near_stn_nm: values.nearStnNm,
      avg_run_dist_km: values.avgRunDistKm,
      avg_pace_cd: values.avgPaceCd,
      join_purp_cds: values.joinPurpCds,
      join_purp_txt: values.joinPurpTxt,
    };

    const { error } = existing
      ? await admin.from("mem_onbd_prf").update(payload).eq("mem_id", member.id)
      : await admin.from("mem_onbd_prf").insert({ mem_id: member.id, ...payload });

    if (error) {
      console.error("[profile] 러닝 프로필 저장 실패", member.id, error.message);
      return { ok: false, message: "러닝 프로필 저장에 실패했습니다." };
    }

    revalidatePath("/profile/edit");
    return { ok: true };
  });
}
