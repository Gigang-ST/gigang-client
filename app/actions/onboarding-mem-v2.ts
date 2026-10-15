"use server";

import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, createUntypedAdminClient } from "@/lib/supabase/admin";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { digitsOnly, formatPhone, isValidPhone } from "@/lib/phone-utils";
import { dayjs, todayKST } from "@/lib/dayjs";
import { sealBalanceAnchor } from "@/lib/dues/seal-anchor";
import { evaluateAndGrantTitles } from "@/lib/titles/engine";
import { joinGatheringWithCapCheck } from "@/lib/gathering/join-gathering";
import {
  onboardingProfileSchema,
  signupBirthdaySchema,
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
  /**
   * 번호로 찾은 회원(`mem_mst`)은 있는데 **이 팀에 현재 소속이 없다** — 관리자가 "삭제"해
   * `vers=0` 슬롯이 비었거나(대부분), 다른 팀에서 온 계정. 둘 다 할 일이 같다:
   * 기존 `mem_id` 에 OAuth 를 붙이고 소속 행을 새로 꽂는다(`onboardingRejoinDeletedMember`).
   */
  | { ok: true; kind: "rejoin"; memId: string }
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

  // 소속 행이 없으면 **삭제된 회원**이다 — 재가입 경로로 보낸다.
  //
  // 예전엔 여기서 `pending` 을 돌려주고 폼이 "재가입 신청이 접수되었습니다" 화면을 세웠는데,
  // **그 신청을 저장하는 코드가 없었다**(#163 에서 재가입 승인 흐름을 걷어낼 때 저장 코드만
  // 지우고 이 분기와 안내 문구가 남았다). 본인은 접수된 줄 알고 기다리고, 관리자에겐 알림도
  // 목록도 가지 않는 헛도는 화면이었다. prd `pending` 회원은 0명이다.
  //
  // 승인을 붙이지 않고 **바로 재가입**시키는 이유: 삭제는 미납이 0일 때만 허용되므로
  // (`deleteMember` 의 미납 가드) 삭제된 사람은 빚 없이 깨끗이 나간 사람이고, 승인으로
  // 거를 것이 없다. 게다가 삭제 회원은 `vers=0` 슬롯이 비어 **회원관리 목록에 뜨지 않아**
  // 관리자에게 알림을 보내 봤자 누를 화면이 없다(복구 기능도 없다).
  if (!rel) return { ok: true, kind: "rejoin", memId };
  return { ok: true, kind: "active", memId };
}

/**
 * 삭제된 회원의 재가입 — 기존 `mem_id` 에 OAuth 를 붙이고 소속 행을 새로 꽂는다.
 *
 * **신규 가입 경로를 재사용할 수 없다.** `onboardingCreateMember` 는 `mem_id = auth.uid()` 로
 * `mem_mst` 를 INSERT 하는데, 재가입자는 이미 옛 `mem_id` 로 된 `mem_mst` 가 있다. 다른 OAuth
 * 계정으로 들어오면 uid 가 달라 같은 번호의 회원이 둘이 되고, 그 다음 번호 조회는
 * "같은 번호로 등록된 회원이 여러 명"으로 막힌다.
 *
 * **admin 클라이언트를 쓴다.** 온보딩 자가 INSERT 정책(`team_mem_rel_insert_self_onboarding`)은
 * `mem_id = auth.uid()` 를 요구하는데, 여기서 꽂는 건 **옛 mem_id** 라 그 정책을 통과하지 못한다.
 *
 * 과거 기록·포인트·칭호는 `mem_id` 로 매달려 있어 **그대로 이어진다**(의도된 동작 — 이슈 #571).
 * 회비 잔액만은 0원으로 봉인한다(아래).
 */
export async function onboardingRejoinDeletedMember(args: {
  memId: string;
  provider: "kakao" | "google";
  initialAvatarUrl?: string | null;
}): Promise<{ ok: boolean; message?: string }> {
  const { user } = await requireAuthUser();
  if (!user) return { ok: false, message: "로그인이 필요합니다." };

  const admin = createAdminClient();
  const { teamId } = await getRequestTeamContext();

  // 이미 소속이 있으면 아무것도 하지 않는다(멱등) — 재제출·뒤로가기로 두 번 불려도
  // 두 번째 INSERT 가 UNIQUE(team_id, mem_id, vers) 에 걸려 에러 화면을 띄우지 않게.
  const { data: existing } = await admin
    .from("team_mem_rel")
    .select("team_mem_id")
    .eq("mem_id", args.memId)
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false)
    .maybeSingle();
  if (existing) return { ok: true };

  const link = await onboardingLinkExistingMember(args);
  if (!link.ok) return link;

  const { error: eRel } = await admin.from("team_mem_rel").insert({
    team_id: teamId,
    mem_id: args.memId,
    team_role_cd: "member",
    mem_st_cd: "active",
    join_dt: todayKST(),
    vers: 0,
    del_yn: false,
  });
  // 23505 = 경합으로 그 사이 누가 꽂았다 — 목적은 이뤄졌으므로 성공으로 본다.
  if (eRel && eRel.code !== "23505") return { ok: false, message: eRel.message };

  // 재가입 잔액 봉인 — 과거 스냅샷이 남아 있으면 0원 앵커로 끊는다. 미납자는 애초에
  // 삭제되지 않으므로(`deleteMember` 가드) 여기서 지워지는 빚은 없다. 비치명.
  const { data: pastSnap } = await admin
    .from("fee_mem_bal_snap")
    .select("bal_snap_id")
    .eq("team_id", teamId)
    .eq("mem_id", args.memId)
    .eq("del_yn", false)
    .maybeSingle();
  if (pastSnap) {
    const { error: sealErr } = await sealBalanceAnchor(admin, teamId, args.memId);
    if (sealErr) console.error("[onboarding] 재가입 잔액 봉인 실패", args.memId, sealErr);
  }

  // 가입 시점 기반 칭호 재평가(뉴비 등) — 신규 가입과 같은 처리. 응답 완료 후 실행.
  const { data: relRow } = await admin
    .from("team_mem_rel")
    .select("team_mem_id")
    .eq("mem_id", args.memId)
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false)
    .maybeSingle();
  if (relRow?.team_mem_id) {
    const teamMemId = relRow.team_mem_id;
    after(() =>
      evaluateAndGrantTitles({ trigger: "attendance", teamId, teamMemId }).catch((e) =>
        console.error("[title-engine] 재가입 attendance 평가 실패", e),
      ),
    );
  }

  return { ok: true };
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
  | {
      ok: true;
      alreadyRegistered?: boolean;
      pledgeJoined?: boolean;
      /** 정원이 차서 대기열로 들어간 경우 — 실패가 아니다(설계 §6 #19). */
      pledgeWaiting?: boolean;
    }
  | { ok: false; message: string }
> {
  // 폼의 달력 범위(min/max)는 선택기만 좁힐 뿐이라 여기서 한 번 더 막는다.
  const birthdayParsed = signupBirthdaySchema.safeParse(args.birthday);
  if (!birthdayParsed.success) {
    return { ok: false, message: birthdayParsed.error.issues[0]?.message ?? "생년월일을 확인해 주세요." };
  }

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

  // mem_mst가 이미 있으면(23505) 조기 return하지 않고 계속 진행한다 — 1차 제출에서
  // mem_mst만 성공하고 응답이 유실돼 유저가 재제출하는 경우, 여기서 멈추면 mem_onbd_prf·
  // 참석 약속이 영영 누락된다. 아래 단계(team_mem_rel·mem_onbd_prf·참석)는 모두 멱등
  // (23505 무시 / upsert)이라 이어서 실행해 프로필·pledge를 마저 기록한다.
  const alreadyHadMember = em?.code === "23505";
  if (em && !alreadyHadMember) {
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

  // 재가입 봉인: 과거에 이 팀에서 삭제된 이력(fee 스냅샷)이 남아 있으면, 그 과거 잔액이
  // 재가입 회원에게 딸려오지 않게 0원 앵커로 봉인한다. 재계산은 이 앵커 이후만 부과한다.
  // 신규 가입(과거 스냅샷 없음)은 건너뛴다. 비치명 — 실패해도 가입은 성립(로깅만).
  const { data: pastSnap } = await admin
    .from("fee_mem_bal_snap")
    .select("bal_snap_id")
    .eq("team_id", teamId)
    .eq("mem_id", uid)
    .eq("del_yn", false)
    .maybeSingle();
  if (pastSnap) {
    const { error: sealErr } = await sealBalanceAnchor(admin, teamId, uid);
    if (sealErr) console.error("[onboarding] 재가입 잔액 봉인 실패", uid, sealErr);
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

  // mem_onbd_prf UPSERT — 실패해도 가입은 성공 처리(비치명). 넛지 크론 대상에서만 빠진다.
  // upsert(onConflict: mem_id): 재제출(alreadyHadMember)로 이미 row가 있어도 멱등하게 갱신.
  const untypedAdmin = createUntypedAdminClient();
  const { error: eOnbdPrf } = await untypedAdmin.from("mem_onbd_prf").upsert(
    {
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
    },
    { onConflict: "mem_id" },
  );

  if (eOnbdPrf) {
    console.error("[onboarding] mem_onbd_prf UPSERT 실패 — 가입은 계속 진행", uid, eOnbdPrf.message);
  }

  // 참석 약속 모임 신청 — toggleGatheringAttendance와 공유하는 joinGatheringWithCapCheck 사용
  // (모임 존재·team_id 일치·지난모임잠금·정원재확인·upsert). 방금 만든 회원이라 withMember 래퍼
  // (getCurrentMember 캐시)를 재사용할 수 없어 admin 클라이언트로 직접 처리.
  // **만석이면 오류가 아니라 대기 등록이다.** 예전엔 여기서 실패해 가입 도중에
  // "모임 신청이 마감됐어요"만 남겼는데, 정원이 찬 정기런을 고른 뉴비가 정확히 그
  // 경우다. 실패해도 가입 자체는 성공 + pledgeJoined:false (완료 화면에서 안내).
  let pledgeJoined = false;
  let pledgeWaiting = false;
  if (args.pledgeGthrId) {
    try {
      const result = await joinGatheringWithCapCheck(untypedAdmin, {
        gthrId: args.pledgeGthrId,
        memId: uid,
        teamId,
        isAdmin: false,
      });
      pledgeJoined = result.joined;
      pledgeWaiting = result.waiting;
      if (!result.joined && !result.waiting) {
        console.error("[onboarding] 참석 약속 모임 신청 실패", uid, result.reason);
      }
    } catch (e) {
      console.error("[onboarding] 참석 약속 모임 신청 처리 중 오류", uid, e);
    }
  }

  return { ok: true, pledgeJoined, pledgeWaiting };
}
