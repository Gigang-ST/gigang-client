import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { UpcomingRaces } from "@/components/home/upcoming-races";

const meta = {
  title: "Home/UpcomingRaces",
  component: UpcomingRaces,
  parameters: { layout: "centered" },
} satisfies Meta<typeof UpcomingRaces>;

export default meta;
type Story = StoryObj<typeof meta>;

const mockRaces = [
  {
    id: "race-001",
    title: "2026 서울 국제 마라톤",
    start_date: "2026-05-10",
    location: "서울 잠실",
    sport: "road_run",
    event_types: ["FULL", "HALF", "10K"],
    label: "기강 공식",
  },
  {
    id: "race-002",
    title: "춘천 마라톤",
    start_date: "2026-06-21",
    location: "춘천",
    sport: "road_run",
    event_types: ["FULL", "HALF"],
  },
  {
    id: "race-003",
    title: "지리산 트레일런",
    start_date: "2026-07-05",
    location: "남원",
    sport: "trail_run",
    event_types: ["50K", "30K"],
  },
];

export const WithRaces: Story = {
  args: {
    teamId: "team-001",
    cmmCdRows: [],
    races: mockRaces,
    initialMemberStatus: { status: "signed-out" },
    initialRegistrationsByCompetitionId: {},
  },
  render: (args) => (
    <div className="w-[375px] p-4">
      <UpcomingRaces {...args} />
    </div>
  ),
};

export const Registered: Story = {
  args: {
    teamId: "team-001",
    cmmCdRows: [],
    races: mockRaces,
    initialMemberStatus: {
      status: "ready",
      userId: "user-001",
      memberId: "member-001",
      fullName: "홍길동",
      email: "runner@gigang.kr",
      admin: false,
    },
    initialRegistrationsByCompetitionId: {
      "race-001": {
        id: "reg-001",
        competition_id: "race-001",
        member_id: "member-001",
        role: "participant",
        event_type: "FULL",
        created_at: "2026-04-01T00:00:00Z",
      },
    },
  },
  render: (args) => (
    <div className="w-[375px] p-4">
      <UpcomingRaces {...args} />
    </div>
  ),
};

export const Empty: Story = {
  args: {
    teamId: "team-001",
    cmmCdRows: [],
    races: [],
    initialMemberStatus: { status: "signed-out" },
    initialRegistrationsByCompetitionId: {},
  },
  render: (args) => (
    <div className="w-[375px] p-4">
      <UpcomingRaces {...args} />
    </div>
  ),
};
