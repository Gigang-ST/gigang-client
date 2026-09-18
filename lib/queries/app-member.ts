import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/** 앱 전역에서 쓰는 회원 프로필(레거시 `member` 행과 동일 역할, id = mem_mst.mem_id). */
export type AppMemberProfile = {
  id: string;
  /** team_mem_rel.team_mem_id — 칭호 부여 등 팀 스코프 FK 참조에 사용 */
  team_mem_id: string;
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
  /** 선택한 배지 이펙트 코드 (effect_mst.effect_cd) */
  selected_badge_effect: string | null;
  /** 선택한 카드 프레임 코드 (effect_mst.effect_cd) */
  selected_frame_cd: string | null;
  /** 한마디(자기소개) — 프로필 카드에 인용체로 노출. 최대 60자 */
  intro_txt: string | null;
  /**
   * 비활성/탈퇴 사유 — 관리자가 상태를 바꾸며 남긴 메모(`team_mem_rel.inact_rsn_txt`).
   * 재활성화가 null 로 지우므로 정상 흐름에선 inactive/left 일 때만 차 있지만,
   * 컬럼 하나로 두 상태를 겸하므로 읽는 쪽은 **`status`와 함께** 해석한다(비활성 사유/탈퇴 사유).
   */
  inact_rsn_txt: string | null;
};

type MemMstRow = Database["public"]["Tables"]["mem_mst"]["Row"];
type TeamMemRelRow = Database["public"]["Tables"]["team_mem_rel"]["Row"];

/**
 * 로그인 사용자(auth uid)에 대응하는 mem_mst 정본 + 요청 팀 `team_mem_rel` 정본을 조회한다.
 * 레거시는 kakao/google 컬럼에 auth uid를 넣어 연동했으므로 OR 조건을 유지한다.
 * 해당 팀 `team_mem_rel`(vers=0·미삭제)이 없으면 null — mem_mst만 있는 상태는 미가입·온보딩 대상으로 본다.
 *
 * **왕복 1회다.** 예전엔 `mem_mst`를 먼저 읽고 그 `mem_id`로 `team_mem_rel`을 다시 읽어
 * **두 번 순차로** 왕복했다. 레거시 연동 탓에 auth uid와 `mem_id`가 다를 수 있어 병렬화도
 * 불가능했다 — 두 번째 조회가 첫 번째 결과를 기다려야 했다.
 *
 * 이 함수는 `getCurrentMember()` 안에 있어 **모든 인증 페이지·서버 액션·API 라우트의 관문**이라,
 * 호출 수가 어떤 쿼리보다 많다(prd 실측 146.6일 · mem_mst 75,345회 / team_mem_rel 66,586회).
 * 인덱스는 이미 완벽했고(`BitmapOr` 3인덱스 · 버퍼 4개) **문제는 왕복이 2회라는 것 하나**였다.
 * PostgREST 임베딩으로 조인하면 SQL 한 방으로 끝나 왕복이 절반이 된다(§coding-standards의
 * `!inner` 패턴 — 이 저장소에 이미 10곳 넘게 쓴다).
 *
 * 안전성은 데이터로 확인했다(2026-09-18 prd 전수):
 * - 한 auth uid가 **서로 다른** `mem_mst` 행에 걸리는 경우 0건 → `maybeSingle()` 안전
 * - 한 멤버가 같은 팀에 `team_mem_rel`을 여러 개 갖는 경우 0건
 *   (`uk_team_mem_rel_team_mem_vers` UNIQUE가 보장) → 아래 `[0]` 안전
 * - 2단계 방식과 조인 방식의 결과가 265명 전수에서 **완전 일치**
 */
export async function fetchMemMstWithTeamRel(
  supabase: SupabaseClient<Database>,
  authUserId: string,
  teamId: string,
): Promise<{ mst: MemMstRow; rel: TeamMemRelRow } | null> {
  const orFilter = `oauth_kakao_id.eq.${authUserId},oauth_google_id.eq.${authUserId},mem_id.eq.${authUserId}`;

  // `!inner` — 해당 팀 소속이 없으면 행 자체가 안 온다(예전 `if (!rel) return null`과 같은 결과).
  // 임베딩 쪽 필터는 `team_mem_rel.` 접두사로 건다. 바깥 `vers`/`del_yn`은 mem_mst 것이다.
  const { data, error } = await supabase
    .from("mem_mst")
    .select("*, team_mem_rel!inner(*)")
    .eq("vers", 0)
    .eq("del_yn", false)
    .or(orFilter)
    .eq("team_mem_rel.team_id", teamId)
    .eq("team_mem_rel.vers", 0)
    .eq("team_mem_rel.del_yn", false)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  // 임베디드 결과는 1:N이라 **배열로 온다.** 위 유니크 제약상 최대 1건이지만, 혹시 비어 있으면
  // (`!inner`가 보장하므로 정상 경로에선 안 생긴다) 미가입으로 본다 — 예전 동작과 같다.
  const { team_mem_rel: rels, ...mst } = data;
  const rel = (Array.isArray(rels) ? rels[0] : rels) as TeamMemRelRow | undefined;
  if (!rel) return null;

  return { mst: mst as MemMstRow, rel };
}

export function mapMstRelToAppMemberProfile(
  mst: MemMstRow,
  rel: TeamMemRelRow,
): AppMemberProfile {
  const gender = mst.gdr_enm ?? "male";
  const admin =
    rel.team_role_cd === "admin" || rel.team_role_cd === "owner";

  return {
    id: mst.mem_id,
    team_mem_id: rel.team_mem_id,
    full_name: mst.mem_nm,
    gender,
    birthday: mst.birth_dt ?? "",
    phone: mst.phone_no ?? "",
    email: mst.email_addr,
    avatar_url: mst.avatar_url,
    bank_name: mst.bank_nm,
    bank_account: mst.bank_acct_no,
    joined_at: rel.join_dt ?? "",
    status: rel.mem_st_cd,
    admin,
    selected_badge_effect: rel.selected_badge_effect ?? null,
    selected_frame_cd: rel.selected_frame_cd ?? null,
    intro_txt: rel.intro_txt ?? null,
    inact_rsn_txt: rel.inact_rsn_txt ?? null,
  };
}
