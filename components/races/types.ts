export type Competition = {
  id: string;
  short_id?: string | null;
  /**
   * 만든 사람(`comp_mst.crt_by`). 상세에서 "내가 만든 대회인가"(수정 버튼 노출) 판정에 쓴다.
   *
   * `null`이면 외부 수집분이거나 컬럼 도입 이전 등록분이라 관리자만 고칠 수 있고,
   * `undefined`면 **이 목록이 값을 안 실어 보낸 것**이다 — 그 화면에선 작성자 본인도
   * 버튼을 못 본다. 상세를 여는 경로를 새로 만들면 이 값도 같이 실어야 한다.
   */
  crt_by?: string | null;
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
