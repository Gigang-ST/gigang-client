import { type SupabaseClient } from "@supabase/supabase-js";

import { type Database } from "@/lib/supabase/database.types";

import type { TitleDescVisibility } from "@/components/common/title-badge";

/** 종목 코드 — comp_mst.comp_sprt_cd. DESIGN.md의 `sport-*` 토큰과 1:1 대응 */
export type SportCd =
  | "road_run"
  | "trail_run"
  | "ultra"
  | "triathlon"
  | "cycling";

export type MemberCardTitle = {
  ttl_nm: string;
  ttl_desc: string | null;
  desc_visibility: TitleDescVisibility;
  rarity_level: number;
  ttl_ctgr_cd: string;
};

/**
 * 최근 90일 활동 1건 — 대회는 기록(초), 모임은 참석 인원이 채워진다.
 * 딥링크는 걸지 않는다(목록 표시 전용이라 id를 내려받지 않음).
 */
export type MemberCardActivity = {
  kind: "race" | "gathering";
  /** 활동일 YYYY-MM-DD (KST) */
  actv_dt: string;
  title: string;
  /** 대회만 — 기록(초) */
  rec_time_sec: number | null;
  /** 모임만 — 참석 인원(본인 포함) */
  attd_cnt: number | null;
};

export type MemberCardRecord = {
  sport: SportCd | string;
  evt: string;
  rec_time_sec: number;
  race_nm: string | null;
  race_dt: string | null;
};

/**
 * `get_public_member_card` RPC 응답.
 *
 * 프라이버시: 공개 허용목록만 담는다 — 성별·생일·연락처·거주지·회비는 RPC가 애초에 내려주지 않는다.
 * `stats.activity_score`는 **"활동지수"로만** 노출한다(기강 포인트 히든 운영 원칙).
 */
export type MemberCardData = {
  mem_nm: string;
  avatar_url: string | null;
  badge_effect: string;
  frame_cd: string;
  intro_txt: string | null;
  join_dt: string | null;
  /** 등번호 = 팀 합류 순번(탈퇴자 포함 고정) */
  back_no: number | null;
  utmb_index: number | null;
  /** 다음 출전 예정 대회 1건 — RECORDS 아래 정보행. `short_id`로 대회 상세를 연다 */
  upcoming_race: {
    comp_id: string;
    short_id: string | null;
    comp_nm: string;
    stt_dt: string;
  } | null;
  /** 온보딩에서 받은 소개 정보 — 전부 미입력이면 null */
  running_profile: {
    avg_pace_cd: string | null;
    avg_run_dist_km: number | null;
    /** 가까운 역 — 기록 없는 신규 가입자 카드를 채우는 주 정보 */
    near_stn_nm: string | null;
    /** 가입 목적 코드 — 짧은 라벨 칩으로 표시 */
    join_purp_cds: string[];
    /** 본인이 직접 쓴 목적 한마디 — 있으면 칩 대신 이걸 보여준다 */
    join_purp_txt: string | null;
  } | null;
  /** 마지막 활동일(모임 참석·대회 기록 중 최근) — 활동 컨디션 판정용 */
  last_actv_dt: string | null;
  /** 최근 90일 활동 이력 — 최근활동 섹션에서 펼쳐본다(최신순) */
  recent_actv: MemberCardActivity[];
  primary_title: {
    ttl_nm: string;
    ttl_desc: string | null;
    desc_visibility: TitleDescVisibility;
  } | null;
  titles: MemberCardTitle[];
  best_records: MemberCardRecord[];
  stats: {
    gthr_attd_cnt: number;
    comp_reg_cnt: number;
    /** 포인트 원장 합산 — UI에 숫자로 노출하지 않는다(활동 컨디션 판정 보조용) */
    activity_score: number;
    /** 최근 90일 활동 건수(모임 참석 + 대회 기록) — 컨디션 표정의 주 지표 */
    recent_actv_cnt: number;
  };
};

/**
 * 멤버 프로필 카드 1건 조회.
 *
 * `null` 반환 = 카드 없음(해당 팀 소속 아님·탈퇴·비활성·삭제). 호출부는 "함께 달렸던 멤버예요"
 * 폴백을 보여준다 — left/inactive 사유는 구분해서 노출하지 않는다.
 * RPC가 `SECURITY DEFINER`라 비로그인(anon)도 조회할 수 있다(랭킹 공개 정책과 동일).
 *
 * @throws RPC 호출 자체가 실패하면 에러를 그대로 던진다(호출부가 재시도 UI를 띄운다).
 */
export async function getPublicMemberCard(
  supabase: SupabaseClient<Database>,
  memId: string,
  teamId: string,
): Promise<MemberCardData | null> {
  const { data, error } = await supabase.rpc("get_public_member_card", {
    p_mem_id: memId,
    p_team_id: teamId,
  });

  if (error) throw error;
  return (data as MemberCardData | null) ?? null;
}
