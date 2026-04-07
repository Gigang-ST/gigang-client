"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { digitsOnly, formatPhone, isValidPhone } from "@/lib/phone-utils";
import { todayKST } from "@/lib/dayjs";

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
  | { ok: true; kind: "inactive"; memId: string }
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
  const { data: list, error: listErr } = await admin
    .from("mem_mst")
    .select("mem_id")
    .eq("vers", 0)
    .eq("del_yn", false)
    .eq("phone_no", digits)
    .limit(2);

  if (listErr) {
    return { ok: false, message: "기존 회원 확인에 실패했습니다." };
  }
  if (list && list.length > 1) {
    return {
      ok: false,
      message:
        "같은 번호로 등록된 회원이 여러 명이라 관리자 확인이 필요합니다.",
    };
  }
  const mst = list?.[0];
  if (!mst) return { ok: true, kind: "new" };

  const { teamId } = await getRequestTeamContext();
  const { data: rel } = await admin
    .from("team_mem_rel")
    .select("mem_st_cd")
    .eq("mem_id", mst.mem_id)
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false)
    .maybeSingle();

  const st = rel?.mem_st_cd ?? "pending";
  if (st === "inactive") return { ok: true, kind: "inactive", memId: mst.mem_id };
  if (st === "pending") return { ok: true, kind: "pending" };
  return { ok: true, kind: "active", memId: mst.mem_id };
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

/** 비활성 재가입 요청: 팀 상태를 pending 으로, OAuth 연결 */
export async function onboardingRejoinFromInactive(args: {
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

  const { error: e0 } = await admin
    .from("mem_mst")
    .update({
      ...oauthMst,
      ...(args.initialAvatarUrl ? { avatar_url: args.initialAvatarUrl } : {}),
    })
    .eq("mem_id", args.memId)
    .eq("vers", 0)
    .eq("del_yn", false);

  if (e0) return { ok: false, message: e0.message };

  const { teamId } = await getRequestTeamContext();
  const { error: e1 } = await admin
    .from("team_mem_rel")
    .update({ mem_st_cd: "pending" })
    .eq("mem_id", args.memId)
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false);

  if (e1) return { ok: false, message: e1.message };

  return { ok: true };
}

/** 신규 가입: mem_mst 신규 mem_id 발급 + 요청 Host 기준 팀 team_mem_rel */
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
}): Promise<
  { ok: true; alreadyRegistered?: boolean } | { ok: false; message: string }
> {
  const { user } = await requireAuthUser();
  if (!user) return { ok: false, message: "로그인이 필요합니다." };

  const uid = user.id;
  const memId = crypto.randomUUID();
  const admin = createAdminClient();
  const acctDigits = digitsOnly(args.bankAccountRaw);
  const bankAcctNo = acctDigits.length ? acctDigits : null;

  const { error: em } = await admin.from("mem_mst").insert({
    mem_id: memId,
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
  const { error: eRel } = await admin.from("team_mem_rel").insert({
    team_id: teamId,
    mem_id: memId,
    team_role_cd: "member",
    mem_st_cd: "active",
    join_dt: todayKST(),
    vers: 0,
    del_yn: false,
  });

  if (eRel) {
    if (eRel.code !== "23505") {
      await admin.from("mem_mst").delete().eq("mem_id", memId);
      return { ok: false, message: eRel.message };
    }
  }

  return { ok: true };
}
