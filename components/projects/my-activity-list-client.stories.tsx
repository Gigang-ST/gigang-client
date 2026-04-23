import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { MyActivityListClient, type ActivityRecord } from "@/components/projects/my-activity-list-client";

const meta = {
  title: "Projects/MyActivityList",
  component: MyActivityListClient,
  parameters: { layout: "centered" },
} satisfies Meta<typeof MyActivityListClient>;

export default meta;
type Story = StoryObj<typeof meta>;

const mockRecords: ActivityRecord[] = [
  {
    act_id: "act-001",
    act_dt: "2026-04-22",
    sprt_enm: "RUNNING",
    distance_km: 10.5,
    elevation_m: 0,
    base_mlg: 10.5,
    applied_mults: [],
    final_mlg: 10.5,
    review: "날씨 좋아서 기분 좋게 달렸다!",
  },
  {
    act_id: "act-002",
    act_dt: "2026-04-20",
    sprt_enm: "TRAIL_RUN",
    distance_km: 15.2,
    elevation_m: 800,
    base_mlg: 21.2,
    applied_mults: [{ mult_id: "m1", mult_nm: "대회 참가", mult_val: 1.5 }],
    final_mlg: 31.8,
    review: null,
  },
  {
    act_id: "act-003",
    act_dt: "2026-04-18",
    sprt_enm: "CYCLING",
    distance_km: 40.0,
    elevation_m: 300,
    base_mlg: 16.0,
    applied_mults: [],
    final_mlg: 16.0,
    review: "한강 라이딩",
  },
];

export const WithRecords: Story = {
  args: {
    initialRecords: mockRecords,
    evtId: "evt-001",
    memId: "member-001",
    month: "2026-04-01",
    totalCount: 12,
  },
  render: (args) => (
    <div className="w-[375px] p-4">
      <MyActivityListClient {...args} />
    </div>
  ),
};

export const Empty: Story = {
  args: {
    initialRecords: [],
    evtId: "evt-001",
    memId: "member-001",
    month: "2026-04-01",
    totalCount: 0,
  },
  render: (args) => (
    <div className="w-[375px] p-4">
      <MyActivityListClient {...args} />
    </div>
  ),
};
