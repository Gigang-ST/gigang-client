export type Competition = {
  id: string;
  short_id?: string | null;
  external_id: string;
  sport: string | null;
  title: string;
  start_date: string;
  end_date: string | null;
  location: string | null;
  event_types: string[] | null;
  source_url: string | null;
};

export type CompetitionRegistration = {
  id: string;
  competition_id: string;
  member_id: string;
  role: "participant" | "cheering" | "volunteer";
  event_type: string | null;
  created_at: string;
};

export type MemberStatus =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "needs-onboarding"; userId: string }
  /**
   * 로그인·가입은 됐으나 활동 불가(비활성/탈퇴). memberId 를 담아 하위 컴포넌트가
   * "보기는 열되 쓰기만 차단"할 수 있게 한다(비로그인과 구분). memberSt 로 문구 분기.
   */
  | { status: "inactive"; userId: string; memberId: string; memberSt: "inactive" | "left" }
  /** 로그인됐으나 mem_mst/team_mem_rel 조회가 실패(네트워크·RLS 등) */
  | { status: "member-fetch-error"; userId: string }
  | { status: "ready"; userId: string; memberId: string; fullName: string | null; email: string | null; admin: boolean };
