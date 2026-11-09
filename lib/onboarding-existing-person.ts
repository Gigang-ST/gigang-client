import "server-only";

import { formatPhone } from "@/lib/phone-utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { AVG_PACE_CODES } from "@/lib/validations/member";

type AdminDb = ReturnType<typeof createAdminClient>;

/**
 * 로그인한 계정에 연결된 회원(`mem_mst`) — 신규 가입이 아니라 **이미 있는 사람**인지 가른다.
 * 대상은 클라이언트가 아니라 **로그인 세션으로만** 정한다(남의 `mem_id` 를 넘길 수 없게 —
 * 온보딩의 `matchMemberByPhone` 과 같은 이유). 둘 이상 걸리면 누구인지 정할 수 없어 null.
 */
export async function resolveLinkedMemId(admin: AdminDb, authUserId: string): Promise<string | null> {
  const { data, error } = await admin
    .from("mem_mst")
    .select("mem_id")
    .eq("vers", 0)
    .eq("del_yn", false)
    .or(`mem_id.eq.${authUserId},oauth_kakao_id.eq.${authUserId},oauth_google_id.eq.${authUserId}`)
    .limit(2);
  if (error || !data || data.length !== 1) return null;
  return data[0].mem_id;
}

/** 다른 팀 가입·재가입 폼에 미리 채울 **사람 것** — 팀 정보(가입 목적·유입 경로·첫 모임)는 싣지 않는다 */
export type OnboardingExistingPerson = {
  fullName: string;
  gender: "male" | "female" | "";
  birthday: string;
  phone: string;
  email: string | null;
  nearStnNm: string | null;
  avgRunDistKm: number | null;
  avgPaceCd: (typeof AVG_PACE_CODES)[number] | null;
};

/**
 * 온보딩에 들어온 로그인 계정이 이미 있는 사람이면 그 사람 정보를 돌려준다(없으면 null).
 * 이 팀 소속이 없을 때만 온보딩에 오므로(있으면 페이지가 돌려보낸다) 여기선 소속을 다시 보지 않는다.
 * 본인 계정에 연결된 정보만 읽는다 — 전화번호만으로는 남의 정보를 미리 채우지 않는다.
 */
export async function getOnboardingExistingPerson(authUserId: string): Promise<OnboardingExistingPerson | null> {
  const admin = createAdminClient();
  const memId = await resolveLinkedMemId(admin, authUserId);
  if (!memId) return null;

  const [{ data: mem }, { data: prf }] = await Promise.all([
    admin
      .from("mem_mst")
      .select("mem_nm, gdr_enm, birth_dt, phone_no, email_addr")
      .eq("mem_id", memId)
      .eq("vers", 0)
      .eq("del_yn", false)
      .maybeSingle(),
    admin
      .from("mem_onbd_prf")
      .select("near_stn_nm, avg_run_dist_km, avg_pace_cd")
      .eq("mem_id", memId)
      .maybeSingle(),
  ]);
  if (!mem) return null;

  const pace = prf?.avg_pace_cd as string | null | undefined;
  return {
    fullName: mem.mem_nm ?? "",
    gender: mem.gdr_enm === "male" || mem.gdr_enm === "female" ? mem.gdr_enm : "",
    birthday: mem.birth_dt ?? "",
    phone: mem.phone_no ? formatPhone(mem.phone_no) : "",
    email: mem.email_addr ?? null,
    nearStnNm: prf?.near_stn_nm ?? null,
    avgRunDistKm: prf?.avg_run_dist_km != null ? Number(prf.avg_run_dist_km) : null,
    avgPaceCd: pace && (AVG_PACE_CODES as readonly string[]).includes(pace)
      ? (pace as (typeof AVG_PACE_CODES)[number])
      : null,
  };
}
