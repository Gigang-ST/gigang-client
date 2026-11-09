"use server";

import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decideOauthLink, OAUTH_LINK_BLOCKED_MESSAGE } from "@/lib/oauth-link";
import { createAdminClient, createAdminClientAs, createUntypedAdminClient } from "@/lib/supabase/admin";
import { resolvePhoneMatch, type PhoneMatch } from "@/lib/onboarding-phone-match";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { resolveLinkedMemId } from "@/lib/onboarding-existing-person";
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

/**
 * 이 로그인이 **이미 회원(mem_mst)에 연결돼 있으면** 그 mem_id. 연결된 사람은 연락처 단계(번호 확인·신규 가입·
 * 로그인 연결)를 거치면 안 된다 — 미리 채운 폼(onboardingJoinTeam)으로만 가입한다.
 * 화면은 이미 그렇게 보내지만, 탭을 두 개 띄웠거나 뒤로가기로 옛 화면에 남은 경우 연락처 단계가 남아 있다.
 * 그때 서버가 안 막으면 같은 로그인에 회원이 둘 붙어(새 mem_mst 또는 남의 mem_mst 에 OAuth) **로그인이 꼬인다.**
 */
async function linkedMemIdOf(authUserId: string): Promise<string | null> {
  return resolveLinkedMemId(createAdminClient(), authUserId);
}

const ALREADY_LINKED_MESSAGE = "이미 회원 정보가 연결된 계정이에요. 새로고침하면 가입 화면이 다시 열려요.";

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
   * 기존 `mem_id` 에 OAuth 를 붙이고(`onboardingLinkExistingMember`), 미리 채운 가입 폼을 거쳐
   * 본인이 가입을 누르면 소속 행을 새로 꽂는다(`onboardingJoinTeam`).
   *
   * ⚠️ **`mem_id` 를 돌려주지 않는다.** 이 액션은 로그인만 했으면 누구나 부를 수 있어
   * 번호를 아는 사람에게 남의 `mem_id` 를 넘기는 꼴이 되고, 그 값을 다시 쓰기 액션에
   * 넘기는 설계로 이어진다. 뒤따르는 액션들은 **번호를 받아 서버가 다시 해석한다.**
   */
  | { ok: true; kind: "rejoin" }
  | { ok: true; kind: "active" }
  | { ok: false; message: string };

/** 온보딩 1단계: 전화번호로 mem_mst(정본) 존재·팀 상태 확인 */
export async function onboardingCheckPhone(
  phoneRaw: string,
): Promise<OnboardingPhoneResult> {
  const { user } = await requireAuthUser();
  if (!user) return { ok: false, message: "로그인이 필요합니다." };
  if (await linkedMemIdOf(user.id)) return { ok: false, message: ALREADY_LINKED_MESSAGE };

  const digits = digitsOnly(formatPhone(phoneRaw.trim()));
  if (!isValidPhone(digits)) {
    return { ok: false, message: "010으로 시작하는 11자리 번호를 입력해 주세요." };
  }

  const match = await matchMemberByPhone(phoneRaw);
  if (!match.ok) return match;

  switch (match.value.kind) {
    case "new":
      return { ok: true, kind: "new" };
    case "ambiguous":
      return {
        ok: false,
        message: "같은 번호로 등록된 회원이 여러 명이라 관리자 확인이 필요합니다.",
      };
    // 소속 행이 없으면 **삭제된 회원**이다 — 재가입 경로로 보낸다.
    //
    // 예전엔 여기서 `pending` 을 돌려주고 폼이 "재가입 신청이 접수되었습니다" 화면을 세웠는데,
    // **그 신청을 저장하는 코드가 없었다**(#163 에서 재가입 승인 흐름을 걷어낼 때 저장 코드만
    // 지우고 이 분기와 안내 문구가 남았다). 본인은 접수된 줄 알고 기다리고, 관리자에겐 알림도
    // 목록도 가지 않는 헛도는 화면이었다. prd `pending` 회원은 0명이다.
    //
    // 승인을 붙이지 않고 **바로 재가입**시키는 이유: 삭제는 잔액이 0일 때만 허용되므로
    // (`deleteMember` 의 가드) 삭제된 사람은 주고받을 돈이 없는 사람이고, 승인으로 거를 것이
    // 없다. 게다가 삭제 회원은 `vers=0` 슬롯이 비어 **회원관리 목록에 뜨지 않아** 관리자에게
    // 알림을 보내 봤자 누를 화면이 없다(복구 기능도 없다).
    case "rejoin":
      return { ok: true, kind: "rejoin" };
    case "active":
      return { ok: true, kind: "active" };
  }
}

/**
 * 전화번호 → 이 팀 기준 온보딩 경로. **`mem_id` 를 만들어 내는 유일한 곳이다.**
 *
 * ⚠️ **`mem_id` 를 클라이언트에서 받지 않는다.** 서버 액션은 로그인만 했으면 누구나 임의
 * 인자로 부를 수 있는데, `mem_id` 를 그대로 믿고 `onboardingLinkExistingMember` 를 태우면
 * **남의 `mem_mst` 에 내 OAuth id 를 꽂을 수 있다** — 그리고 로그인은 `oauth_kakao_id` /
 * `oauth_google_id` 로도 회원을 찾으므로(`fetchMemMstWithTeamRel`) 그대로 **계정 탈취**가 된다.
 * 그래서 쓰기 액션들은 번호를 받아 여기서 다시 해석하고, 그 결과로만 움직인다.
 * (번호를 아는 사람만 연결할 수 있다는 건 온보딩이 원래 기대하는 수준이다.)
 *
 * 판정 자체(0건·1건·2건 이상)는 `resolvePhoneMatch` 가 맡는다 — 틀리면 계정 탈취가 되는
 * 분기라 DB 왕복에서 떼어 테스트로 못박는다.
 */
async function matchMemberByPhone(
  phoneRaw: string,
): Promise<{ ok: true; value: PhoneMatch } | { ok: false; message: string }> {
  const admin = createAdminClient();
  // DB phone_no 표기(하이픈·+82 등)와 무관하게 백필과 동일한 migration_v2_norm_phone 으로 매칭
  const { data: memIds, error: rpcErr } = await admin.rpc(
    "mem_mst_mem_ids_by_norm_phone",
    { p_input: phoneRaw.trim() },
  );
  if (rpcErr) return { ok: false, message: "기존 회원 확인에 실패했습니다." };

  const ids = (memIds ?? []) as (string | null)[];
  const narrowed = resolvePhoneMatch(ids, false);
  // 회원이 없거나 여럿이면 소속을 볼 것도 없다.
  if (narrowed.kind === "new" || narrowed.kind === "ambiguous") {
    return { ok: true, value: narrowed };
  }

  const { teamId } = await getRequestTeamContext();
  const { data: rel, error: relErr } = await admin
    .from("team_mem_rel")
    .select("mem_st_cd")
    .eq("mem_id", narrowed.memId)
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false)
    .maybeSingle();
  // 소속 조회가 실패하면 **멈춘다.** 여기서 눙치면 소속이 있는 사람을 "삭제된 회원"으로 보고
  // 재가입 경로(소속 INSERT)로 보내게 된다.
  if (relErr) return { ok: false, message: "기존 회원 확인에 실패했습니다." };

  return { ok: true, value: resolvePhoneMatch(ids, Boolean(rel)) };
}

/**
 * 이미 있는 사람의 이 팀 가입 — 다른 팀 회원이 처음 들어오거나, 이 팀에서 삭제됐던 회원이 다시 들어올 때.
 *
 * 예전엔 전화번호가 맞으면 **확인 없이 바로** 소속을 꽂았다(가입 목적·유입 경로·첫 모임도 안 받고).
 * 그러면 다른 팀 주소에서 로그인만 눌러 봐도 그 팀 회원이 됐다. 지금은 폼이 사람 정보를 미리
 * 채워 보여 주고, 팀 정보는 새로 받고, **본인이 마지막에 가입을 눌러야** 여기로 온다.
 *
 * 사람 정보(이름·성별·생년월일·이메일·러닝 프로필)는 **사람 것**이라 고치면 가입한 모든 팀에
 * 반영된다(폼이 그렇게 안내한다). 전화번호는 본인 확인 수단이라 여기서 바꾸지 않는다.
 *
 * 과거 기록·포인트·칭호는 `mem_id` 로 매달려 있어 **그대로 이어진다**(이슈 #571).
 * 회비 잔액만은 재가입이면 0원으로 봉인한다(`finishTeamJoin`). 삭제 가드가 잔액 0만 통과시키므로
 * (`deleteMember`) 승인 없이 들어와도 지워지는 돈이 없다.
 */
export async function onboardingJoinTeam(args: {
  fullName: string;
  gender: "male" | "female";
  birthday: string;
  email: string | null;
  onbdProfile: OnboardingProfileValues;
  pledgeGthrId: string | null;
}): Promise<
  | { ok: true; alreadyRegistered?: boolean; pledgeJoined?: boolean; pledgeWaiting?: boolean }
  | { ok: false; message: string }
> {
  const birthdayParsed = signupBirthdaySchema.safeParse(args.birthday);
  if (!birthdayParsed.success) {
    return { ok: false, message: birthdayParsed.error.issues[0]?.message ?? "생년월일을 확인해 주세요." };
  }
  const profileParsed = onboardingProfileSchema.safeParse(args.onbdProfile);
  if (!profileParsed.success) {
    return { ok: false, message: "온보딩 프로필 입력값이 올바르지 않습니다." };
  }
  const name = args.fullName.trim();
  if (!/^[가-힣]{2,5}$/.test(name)) {
    return { ok: false, message: "이름은 한글 2~5자로 입력해 주세요." };
  }

  const { user } = await requireAuthUser();
  if (!user) return { ok: false, message: "로그인이 필요합니다." };

  const admin = createAdminClient();
  const memId = await resolveLinkedMemId(admin, user.id);
  if (!memId) return { ok: false, message: "연결된 회원 정보를 찾지 못했습니다." };

  const { teamId } = await getRequestTeamContext();

  // 이미 이 팀 소속이면(재제출·뒤로가기) 멱등하게 성공으로 본다
  const { data: curRel, error: curRelErr } = await admin
    .from("team_mem_rel")
    .select("team_mem_id")
    .eq("mem_id", memId)
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false)
    .maybeSingle();
  if (curRelErr) return { ok: false, message: "가입 정보를 확인하지 못했습니다." };
  if (curRel) return { ok: true, alreadyRegistered: true };

  // 사람 정보 갱신 — 변경 이력(chg_hist)에 "본인이 어느 팀 주소에서" 바꿨는지 남긴다
  const { error: memErr } = await createAdminClientAs({ memId, teamId })
    .from("mem_mst")
    .update({
      mem_nm: name,
      gdr_enm: args.gender,
      birth_dt: args.birthday,
      ...(args.email !== null ? { email_addr: normEmail(args.email) } : {}),
    })
    .eq("mem_id", memId)
    .eq("vers", 0)
    .eq("del_yn", false);
  if (memErr) return { ok: false, message: "회원 정보를 저장하지 못했습니다." };

  const { error: eRel } = await admin.from("team_mem_rel").insert({
    team_id: teamId,
    mem_id: memId,
    team_role_cd: "member",
    mem_st_cd: "active",
    join_dt: todayKST(),
    vers: 0,
    del_yn: false,
  });
  // 23505 = 경합으로 그 사이 누가 꽂았다 — 목적은 이뤄졌으므로 이어서 마무리한다
  if (eRel && eRel.code !== "23505") return { ok: false, message: eRel.message };

  const { pledgeJoined, pledgeWaiting } = await finishTeamJoin({
    memId,
    teamId,
    onbdProfile: profileParsed.data,
    pledgeGthrId: args.pledgeGthrId,
  });
  return { ok: true, pledgeJoined, pledgeWaiting };
}

/**
 * 이 팀·이 회원에게 **과거 회비 스냅샷이 있는가**(재가입 봉인 여부 판정).
 *
 * ⚠️ `vers` 를 걸지 않고 `.maybeSingle()` 로 물으면 안 된다. 재계산이 스냅샷을 갱신할 때
 * 옛 `vers=0` 을 **`del_yn=false` 인 채** `vers>0` 으로 밀어 두므로(`sealBalanceAnchor` 주석),
 * 대부분의 회원이 여러 행을 갖는다 — prd 실측 288명 중 **242명이 2행 이상**(최대 31행).
 * 여러 행이면 `.maybeSingle()` 이 **에러를 반환하고 data 가 null** 이라, 조건이 조용히
 * 거짓이 되어 **봉인이 통째로 건너뛰어진다.** 존재 여부만 물으므로 `.limit(1)` 로 자른다.
 *
 * 조회가 실패하면 **봉인하는 쪽으로 기운다**(true). 안 하면 과거 잔액이 재가입 회원에게
 * 딸려오는데, 삭제 가드가 잔액 0만 통과시키므로 **과하게 봉인해도 잃을 돈이 없다.**
 */
async function hasPastBalanceSnapshot(
  admin: ReturnType<typeof createAdminClient>,
  teamId: string,
  memId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("fee_mem_bal_snap")
    .select("bal_snap_id")
    .eq("team_id", teamId)
    .eq("mem_id", memId)
    .eq("del_yn", false)
    .limit(1);
  if (error) {
    console.error("[onboarding] 과거 잔액 스냅샷 조회 실패 — 봉인 진행", memId, error.message);
    return true;
  }
  return (data?.length ?? 0) > 0;
}

/**
 * 기존 활동 회원: OAuth만 연결(mem_mst).
 *
 * ⚠️ **`memId` 가 아니라 번호를 받는다.** 이 함수는 admin 클라이언트로 `mem_mst` 의 OAuth id 를
 * 덮어쓰는데, 로그인이 `oauth_kakao_id`/`oauth_google_id` 로도 회원을 찾으므로
 * (`fetchMemMstWithTeamRel`) 남의 `mem_id` 를 넣을 수 있으면 **그 계정이 통째로 넘어간다.**
 * 서버 액션은 로그인만 했으면 누구나 임의 인자로 부를 수 있으니, 대상은 반드시 서버가
 * 번호로 다시 해석한다(§matchMemberByPhone).
 */
export async function onboardingLinkExistingMember(args: {
  phoneRaw: string;
  provider: "kakao" | "google";
  initialAvatarUrl?: string | null;
}): Promise<{ ok: boolean; message?: string }> {
  const { user } = await requireAuthUser();
  if (!user) return { ok: false, message: "로그인이 필요합니다." };

  const match = await matchMemberByPhone(args.phoneRaw);
  if (!match.ok) return match;
  if (match.value.kind !== "active" && match.value.kind !== "rejoin") {
    return { ok: false, message: "연결할 회원 정보를 찾지 못했습니다." };
  }
  const memId = match.value.memId;
  // 이 로그인이 이미 **다른** 회원에 연결돼 있으면 막는다(같은 사람이면 이미 연결된 것 — 아래가 바꿀 게 없다)
  const linkedMemId = await linkedMemIdOf(user.id);
  if (linkedMemId && linkedMemId !== memId) return { ok: false, message: ALREADY_LINKED_MESSAGE };

  // 로그인 연결 변경은 변경 이력에 남는다(값은 가려진다) — 본인이 어느 팀 주소에서 연결했는지 싣는다
  const { teamId } = await getRequestTeamContext();
  const admin = createAdminClientAs({ memId, teamId });

  // 연결 판정은 `decideOauthLink` 한 곳(§lib/oauth-link) — 전화번호만으로는 본인 확인이 안 되므로
  // **로그인이 하나도 없는 회원**(엑셀 시절 회원)에만 붙인다. 이미 다른 로그인이 붙은 회원이면 막고,
  // 원래 계정으로 로그인한 뒤 더보기 → 계정 연동에서 추가하게 안내한다.
  // 프로필 사진은 **비어 있을 때만** 채운다 — 사진은 사람 것이라 다른 팀 가입으로 바뀌면 안 된다.
  const { data: cur, error: curErr } = await admin
    .from("mem_mst")
    .select("mem_id, oauth_kakao_id, oauth_google_id, avatar_url")
    .eq("mem_id", memId)
    .eq("vers", 0)
    .eq("del_yn", false)
    .maybeSingle();
  if (curErr || !cur) return { ok: false, message: "연결할 회원 정보를 찾지 못했습니다." };

  const decision = decideOauthLink(cur, user.id, args.provider);
  if (decision.kind === "blocked") return { ok: false, message: OAUTH_LINK_BLOCKED_MESSAGE };

  const patch = {
    ...(decision.kind === "link" ? { [decision.column]: user.id } : {}),
    ...(args.initialAvatarUrl && !cur.avatar_url ? { avatar_url: args.initialAvatarUrl } : {}),
  };
  if (Object.keys(patch).length === 0) return { ok: true }; // 이미 연결돼 있고 사진도 있다 — 바꿀 게 없다

  const { error: e1 } = await admin
    .from("mem_mst")
    .update(patch)
    .eq("mem_id", memId)
    .eq("vers", 0)
    .eq("del_yn", false);

  if (e1) return { ok: false, message: e1.message };

  return { ok: true };
}

/**
 * 신규 가입: mem_mst(mem_id = auth.uid()) + 요청 Host 기준 팀 team_mem_rel
 *   + mem_onbd_prf(러닝 프로필) + team_mem_onbd_rel(팀별 가입 정보·참석 서약) + (선택) 참석 약속 모임 신청
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
  // 이미 연결된 사람은 새로 만들지 않는다 — 같은 로그인에 회원이 둘 붙는다. 첫 시도에서 mem_mst 만 들어가고
  // 응답이 끊긴 재시도도 여기 걸리는데, 새로고침하면 화면이 그 사람으로 알아보고 이어서 가입시킨다(onboardingJoinTeam).
  if (await linkedMemIdOf(uid)) return { ok: false, message: ALREADY_LINKED_MESSAGE };
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
      // 되돌리기는 **이번에 새로 저장한 사람 정보일 때만**. 이미 있던 사람(다른 팀 회원·앞선 시도)이면
      // 그 정보는 이번 가입이 만든 게 아니라 지우면 안 된다 — 남아 있어도 재시도가 소속부터 이어서 저장한다.
      if (!alreadyHadMember) await admin.from("mem_mst").delete().eq("mem_id", uid);
      return { ok: false, message: eRel.message };
    }
  }

  const { pledgeJoined, pledgeWaiting } = await finishTeamJoin({
    memId: uid,
    teamId,
    onbdProfile,
    pledgeGthrId: args.pledgeGthrId,
  });
  return { ok: true, pledgeJoined, pledgeWaiting };
}

/**
 * 소속 행을 넣은 **뒤** 할 일 — 신규 가입(`onboardingCreateMember`)과 다른 팀 가입·재가입
 * (`onboardingJoinTeam`)이 공유한다. 각자 들면 한쪽만 봉인·칭호·첫 모임 신청을 빠뜨린다.
 * 전부 비치명이다 — 가입(소속 행)은 이미 성립했다.
 */
async function finishTeamJoin({
  memId,
  teamId,
  onbdProfile,
  pledgeGthrId,
}: {
  memId: string;
  teamId: string;
  onbdProfile: OnboardingProfileValues;
  pledgeGthrId: string | null;
}): Promise<{ pledgeJoined: boolean; pledgeWaiting: boolean }> {
  const admin = createAdminClient();

  // 재가입 봉인: 과거에 이 팀에서 삭제된 이력(fee 스냅샷)이 남아 있으면, 그 과거 잔액이
  // 재가입 회원에게 딸려오지 않게 0원 앵커로 봉인한다. 재계산은 이 앵커 이후만 부과한다.
  // 신규 가입(과거 스냅샷 없음)은 건너뛴다. 비치명 — 실패해도 가입은 성립(로깅만).
  if (await hasPastBalanceSnapshot(admin, teamId, memId)) {
    const { error: sealErr } = await sealBalanceAnchor(admin, teamId, memId);
    if (sealErr) console.error("[onboarding] 재가입 잔액 봉인 실패", memId, sealErr);
  }

  // 가입 직후 칭호 평가 (뉴비, 7월7일 등 가입 시점 기반) — 응답 완료 후 실행
  const { data: relRow } = await admin
    .from("team_mem_rel")
    .select("team_mem_id")
    .eq("mem_id", memId)
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

  // 온보딩 프로필 UPSERT — 실패해도 가입은 성공 처리(비치명). 가입 정보만 비어 남는다.
  // 재제출(alreadyHadMember)로 이미 row가 있어도 멱등하게 갱신.
  // 두 군데로 나눠 쓴다: 가까운 역·거리·페이스는 **사람 것**(mem_onbd_prf, mem_id 하나),
  // 가입 목적·유입 경로·첫 모임 약속은 **이 팀에 들어온 이유**(team_mem_onbd_rel, 팀+사람).
  // 한 테이블에 두면 두 번째 팀 가입이 첫 팀의 가입 정보를 덮는다.
  const untypedAdmin = createUntypedAdminClient();
  const { error: eOnbdPrf } = await untypedAdmin.from("mem_onbd_prf").upsert(
    {
      mem_id: memId,
      near_stn_nm: onbdProfile.nearStnNm,
      avg_run_dist_km: onbdProfile.avgRunDistKm,
      avg_pace_cd: onbdProfile.avgPaceCd,
    },
    { onConflict: "mem_id" },
  );

  if (eOnbdPrf) {
    console.error("[onboarding] mem_onbd_prf UPSERT 실패 — 가입은 계속 진행", memId, eOnbdPrf.message);
  }

  const { error: eTeamOnbd } = await admin.from("team_mem_onbd_rel").upsert(
    {
      team_id: teamId,
      mem_id: memId,
      join_purp_cds: onbdProfile.joinPurpCds,
      join_purp_txt: onbdProfile.joinPurpTxt,
      join_src_cd: onbdProfile.joinSrcCd,
      join_src_txt: onbdProfile.joinSrcTxt,
      attd_pldg_at: dayjs().toISOString(),
      pldg_gthr_id: pledgeGthrId,
      upd_at: dayjs().toISOString(),
    },
    { onConflict: "team_id,mem_id" },
  );

  if (eTeamOnbd) {
    console.error("[onboarding] team_mem_onbd_rel UPSERT 실패 — 가입은 계속 진행", memId, eTeamOnbd.message);
  }

  // 참석 약속 모임 신청 — toggleGatheringAttendance와 공유하는 joinGatheringWithCapCheck 사용
  // (모임 존재·team_id 일치·지난모임잠금·정원재확인·upsert). 방금 만든 회원이라 withMember 래퍼
  // (getCurrentMember 캐시)를 재사용할 수 없어 admin 클라이언트로 직접 처리.
  // **만석이면 오류가 아니라 대기 등록이다.** 예전엔 여기서 실패해 가입 도중에
  // "모임 신청이 마감됐어요"만 남겼는데, 정원이 찬 정기런을 고른 뉴비가 정확히 그
  // 경우다. 실패해도 가입 자체는 성공 + pledgeJoined:false (완료 화면에서 안내).
  let pledgeJoined = false;
  let pledgeWaiting = false;
  if (pledgeGthrId) {
    try {
      const result = await joinGatheringWithCapCheck(untypedAdmin, {
        gthrId: pledgeGthrId,
        memId: memId,
        teamId,
        isAdmin: false,
      });
      pledgeJoined = result.joined;
      pledgeWaiting = result.waiting;
      if (!result.joined && !result.waiting) {
        console.error("[onboarding] 참석 약속 모임 신청 실패", memId, result.reason);
      }
    } catch (e) {
      console.error("[onboarding] 참석 약속 모임 신청 처리 중 오류", memId, e);
    }
  }

  return { pledgeJoined, pledgeWaiting };
}
