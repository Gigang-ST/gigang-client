"use server";

import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, createUntypedAdminClient } from "@/lib/supabase/admin";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { digitsOnly, formatPhone, isValidPhone } from "@/lib/phone-utils";
import { dayjs, todayKST } from "@/lib/dayjs";
import { evaluateAndGrantTitles } from "@/lib/titles/engine";
import { joinGatheringWithCapCheck } from "@/lib/gathering/join-gathering";
import {
  onboardingProfileSchema,
  type OnboardingProfileValues,
} from "@/lib/validations/member";

async function requireAuthUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { user };
}

function normEmail(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.replace(/\u3000/g, " ").trim().toLowerCase();
  return t.length ? t : null;
}

export type OnboardingPhoneResult =
  | { ok: true; kind: "new" }
  | { ok: true; kind: "pending" }
  | { ok: true; kind: "active"; memId: string }
  | { ok: false; message: string };

/** 온보딩 1단계: 전화번호로 mem_mst(정본) 존재·팀 상태 확인 */
export async function onboardingCheckPhone(
  phoneRaw: string,
): Promise<OnboardingPhoneResult> {
  const { user } = await requireAuthUser();
  if (!user) return { ok: false, message: "로그인이 필요합니다." };

  const digits = digitsOnly(formatPhone(phoneRaw.trim()));
  if (!isValidPhone(digits)) {
    return { ok: false, message: "010으로 시작하는 11자리 번호를 입력해 주세요." };
  }

  const admin = createAdminClient();
  // DB phone_no 표기(하이픈·+82 등)와 무관하게 백필과 동일한 migration_v2_norm_phone 으로 매칭
  const { data: memIds, error: rpcErr } = await admin.rpc(
    "mem_mst_mem_ids_by_norm_phone",
    { p_input: phoneRaw.trim() },
  );

  if (rpcErr) {
    return { ok: false, message: "기존 회원 확인에 실패했습니다." };
  }
  const ids = (memIds ?? []).filter(Boolean);
  if (ids.length > 1) {
    return {
      ok: false,
      message:
        "같은 번호로 등록된 회원이 여러 명이라 관리자 확인이 필요합니다.",
    };
  }
  const memId = ids[0];
  if (!memId) return { ok: true, kind: "new" };

  const { teamId } = await getRequestTeamContext();
  const { data: rel } = await admin
    .from("team_mem_rel")
    .select("mem_st_cd")
    .eq("mem_id", memId)
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false)
    .maybeSingle();

  const st = rel?.mem_st_cd ?? "pending";
  if (st === "pending") return { ok: true, kind: "pending" };
  return { ok: true, kind: "active", memId };
}

/** 기존 활동 회원: OAuth만 연결(mem_mst) */
export async function onboardingLinkExistingMember(args: {
  memId: string;
  provider: "kakao" | "google";
  initialAvatarUrl?: string | null;
}): Promise<{ ok: boolean; message?: string }> {
  const { user } = await requireAuthUser();
  if (!user) return { ok: false, message: "로그인이 필요합니다." };

  const admin = createAdminClient();
  const oauthMst =
    args.provider === "kakao"
      ? { oauth_kakao_id: user.id }
      : { oauth_google_id: user.id };

  const { error: e1 } = await admin
    .from("mem_mst")
    .update({
      ...oauthMst,
      ...(args.initialAvatarUrl ? { avatar_url: args.initialAvatarUrl } : {}),
    })
    .eq("mem_id", args.memId)
    .eq("vers", 0)
    .eq("del_yn", false);

  if (e1) return { ok: false, message: e1.message };

  return { ok: true };
}

/**
 * 신규 가입: mem_mst(mem_id = auth.uid()) + 요청 Host 기준 팀 team_mem_rel
 *   + mem_onbd_prf(온보딩 프로필·참석 서약) + (선택) 참석 약속 모임 신청
 *
 * 처리 순서(설계 §2.2): mem_mst INSERT → team_mem_rel INSERT →
 * mem_onbd_prf INSERT(비치명) → pledgeGthrId 있으면 참석 INSERT(비치명).
 * 회원가입은 이미 성공한 뒤라 mem_onbd_prf·참석 신청 실패는 가입 자체를 롤백하지 않는다.
 */
export async function onboardingCreateMember(args: {
  fullName: string;
  gender: "male" | "female";
  birthday: string;
  phoneDigits: string;
  email: string | null;
  bankName: string | null;
  bankAccountRaw: string;
  provider: "kakao" | "google";
  initialAvatarUrl?: string | null;
  onbdProfile: OnboardingProfileValues;
  pledgeGthrId: string | null;
}): Promise<
  | { ok: true; alreadyRegistered?: boolean; pledgeJoined?: boolean }
  | { ok: false; message: string }
> {
  const profileParsed = onboardingProfileSchema.safeParse(args.onbdProfile);
  if (!profileParsed.success) {
    return { ok: false, message: "온보딩 프로필 입력값이 올바르지 않습니다." };
  }
  const onbdProfile = profileParsed.data;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "로그인이 필요합니다." };

  const uid = user.id;
  /** mem_mst DELETE 정책이 없어 롤백은 service_role 만 안전하다. */
  const admin = createAdminClient();
  const acctDigits = digitsOnly(args.bankAccountRaw);
  const bankAcctNo = acctDigits.length ? acctDigits : null;

  // 본인 행 INSERT 는 authenticated + mem_mst_insert_own 로 처리(서비스 롤 키 미설정/오설정 시에도 동작)
  const { error: em } = await supabase.from("mem_mst").insert({
    mem_id: uid,
    mem_nm: args.fullName,
    gdr_enm: args.gender,
    birth_dt: args.birthday,
    phone_no: args.phoneDigits,
    email_addr: normEmail(args.email),
    bank_nm: args.bankName,
    bank_acct_no: bankAcctNo,
    avatar_url: args.initialAvatarUrl ?? null,
    oauth_kakao_id: args.provider === "kakao" ? uid : null,
    oauth_google_id: args.provider === "google" ? uid : null,
    vers: 0,
    del_yn: false,
  });

  if (em) {
    if (em.code === "23505") return { ok: true, alreadyRegistered: true };
    return { ok: false, message: em.message };
  }

  const { teamId } = await getRequestTeamContext();
  // team_mem_rel_insert_admin 은 owner/admin 전용 → 신규는 authenticated 정책(team_mem_rel_insert_self_onboarding) 사용
  const { error: eRel } = await supabase.from("team_mem_rel").insert({
    team_id: teamId,
    mem_id: uid,
    team_role_cd: "member",
    mem_st_cd: "active",
    join_dt: todayKST(),
    vers: 0,
    del_yn: false,
  });

  if (eRel) {
    if (eRel.code !== "23505") {
      await admin.from("mem_mst").delete().eq("mem_id", uid);
      return { ok: false, message: eRel.message };
    }
  }

  // 가입 직후 칭호 평가 (뉴비, 7월7일 등 가입 시점 기반) — 응답 완료 후 실행
  const { data: relRow } = await admin
    .from("team_mem_rel")
    .select("team_mem_id")
    .eq("mem_id", uid)
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false)
    .maybeSingle();

  if (relRow?.team_mem_id) {
    const { teamMemId } = { teamMemId: relRow.team_mem_id };
    after(() =>
      evaluateAndGrantTitles({ trigger: "attendance", teamId, teamMemId })
        .catch((e) => console.error("[title-engine] 온보딩 attendance 평가 실패", e))
    );
  }

  // mem_onbd_prf INSERT — 실패해도 가입은 성공 처리(비치명). 넛지 크론 대상에서만 빠진다.
  const untypedAdmin = createUntypedAdminClient();
  const { error: eOnbdPrf } = await untypedAdmin.from("mem_onbd_prf").insert({
    mem_id: uid,
    near_stn_nm: onbdProfile.nearStnNm,
    avg_run_dist_km: onbdProfile.avgRunDistKm,
    avg_pace_cd: onbdProfile.avgPaceCd,
    join_purp_cds: onbdProfile.joinPurpCds,
    join_purp_txt: onbdProfile.joinPurpTxt,
    join_src_cd: onbdProfile.joinSrcCd,
    join_src_txt: onbdProfile.joinSrcTxt,
    attd_pldg_at: dayjs().toISOString(),
    pldg_gthr_id: args.pledgeGthrId,
  });

  if (eOnbdPrf) {
    console.error("[onboarding] mem_onbd_prf INSERT 실패 — 가입은 계속 진행", uid, eOnbdPrf.message);
  }

  // 참석 약속 모임 신청 — toggleGatheringAttendance와 공유하는 joinGatheringWithCapCheck 사용
  // (모임 존재·team_id 일치·지난모임잠금·정원재확인·upsert). 방금 만든 회원이라 withMember 래퍼
  // (getCurrentMember 캐시)를 재사용할 수 없어 admin 클라이언트로 직접 처리.
  // 실패해도 가입 성공 + pledgeJoined:false (완료 화면에서 안내).
  let pledgeJoined = false;
  if (args.pledgeGthrId) {
    try {
      const result = await joinGatheringWithCapCheck(untypedAdmin, {
        gthrId: args.pledgeGthrId,
        memId: uid,
        teamId,
        isAdmin: false,
      });
      pledgeJoined = result.joined;
      if (!result.joined) {
        console.error("[onboarding] 참석 약속 모임 신청 실패", uid, result.reason);
      }
    } catch (e) {
      console.error("[onboarding] 참석 약속 모임 신청 처리 중 오류", uid, e);
    }
  }

  return { ok: true, pledgeJoined };
}
