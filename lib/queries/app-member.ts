import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { GIGANG_TEAM_ID } from "@/lib/constants/gigang-team";

/** 앱 전역에서 쓰는 회원 프로필(레거시 `member` 행과 동일 역할, id = mem_mst.mem_id). */
export type AppMemberProfile = {
  id: string;
  full_name: string;
  gender: Database["public"]["Enums"]["gender"];
  birthday: string;
  phone: string;
  email: string | null;
  avatar_url: string | null;
  bank_name: string | null;
  bank_account: string | null;
  joined_at: string;
  status: string;
  admin: boolean;
};

type MemMstRow = Database["public"]["Tables"]["mem_mst"]["Row"];
type TeamMemRelRow = Database["public"]["Tables"]["team_mem_rel"]["Row"];

/**
 * 로그인 사용자(auth uid)에 대응하는 mem_mst 정본 + 기강 team_mem_rel 정본을 조회한다.
 * 레거시는 kakao/google 컬럼에 auth uid를 넣어 연동했으므로 OR 조건을 유지한다.
 */
export async function fetchMemMstWithGigangRel(
  supabase: SupabaseClient<Database>,
  authUserId: string,
): Promise<{ mst: MemMstRow; rel: TeamMemRelRow | null } | null> {
  const orFilter = `oauth_kakao_id.eq.${authUserId},oauth_google_id.eq.${authUserId},mem_id.eq.${authUserId}`;

  const { data: mst, error: errM } = await supabase
    .from("mem_mst")
    .select("*")
    .eq("vers", 0)
    .eq("del_yn", false)
    .or(orFilter)
    .maybeSingle();

  if (errM) throw errM;
  if (!mst) return null;

  const { data: rel, error: errR } = await supabase
    .from("team_mem_rel")
    .select("*")
    .eq("mem_id", mst.mem_id)
    .eq("team_id", GIGANG_TEAM_ID)
    .eq("vers", 0)
    .eq("del_yn", false)
    .maybeSingle();

  if (errR) throw errR;
  return { mst, rel: rel ?? null };
}

export function mapMstRelToAppMemberProfile(
  mst: MemMstRow,
  rel: TeamMemRelRow | null,
): AppMemberProfile {
  const gender = mst.gdr_enm ?? "male";
  const admin =
    rel?.team_role_cd === "admin" || rel?.team_role_cd === "owner";

  return {
    id: mst.mem_id,
    full_name: mst.mem_nm,
    gender,
    birthday: mst.birth_dt ?? "",
    phone: mst.phone_no ?? "",
    email: mst.email_addr,
    avatar_url: mst.avatar_url,
    bank_name: mst.bank_nm,
    bank_account: mst.bank_acct_no,
    joined_at: rel?.join_dt ?? "",
    status: rel?.mem_st_cd ?? "pending",
    admin,
  };
}
