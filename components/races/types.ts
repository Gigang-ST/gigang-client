export type Competition = {
  id: string;
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
  | { status: "ready"; userId: string; memberId: string; fullName: string | null; email: string | null; admin: boolean };
