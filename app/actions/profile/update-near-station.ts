"use server";

import { revalidatePath } from "next/cache";

import { withMember } from "@/lib/actions/auth";
import { nearStationEditSchema, type NearStationEditValues } from "@/lib/validations/member";
import { createUntypedAdminClient } from "@/lib/supabase/admin";

/**
 * `/profile/edit` 가까운 역 저장 — mem_onbd_prf에서 near_stn_nm만 다룬다.
 * 나머지 온보딩 컬럼(가입 목적·유입 경로·참석 약속 등)은 온보딩 서버 액션 전용 —
 * payload에 넣지 않으므로 upsert의 UPDATE도 해당 컬럼을 건드리지 않는다
 * (PostgREST upsert는 제공된 컬럼만 UPDATE).
 *
 * mem_onbd_prf row가 없는 기존 회원(개편 전 가입자)은 upsert가 INSERT로 처리한다 —
 * 이 경우 온보딩 전용 컬럼은 전부 기본값(null 등)으로 남는다.
 *
 * SELECT-then-INSERT/UPDATE 대신 단일 upsert(onConflict: mem_id) — 1쿼리로 줄고,
 * 동시 저장 시 둘 다 INSERT를 타 PK 충돌하던 TOCTOU 레이스를 제거한다.
 */
export async function updateNearStation(
  input: NearStationEditValues,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const parsed = nearStationEditSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "입력값이 올바르지 않습니다." };
  }

  return withMember(async ({ member }) => {
    const admin = createUntypedAdminClient();

    const { error } = await admin.from("mem_onbd_prf").upsert(
      {
        mem_id: member.id,
        near_stn_nm: parsed.data.nearStnNm,
      },
      { onConflict: "mem_id" },
    );

    if (error) {
      console.error("[profile] 가까운 역 저장 실패", member.id, error.message);
      return { ok: false, message: "가까운 역 저장에 실패했습니다." };
    }

    revalidatePath("/profile/edit");
    return { ok: true };
  });
}
