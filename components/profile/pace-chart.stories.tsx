import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { PaceChart } from "@/components/profile/pace-chart";

const meta = {
  title: "Profile/PaceChart",
  component: PaceChart,
  parameters: {
    layout: "padded",
  },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-md">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PaceChart>;

export default meta;
type Story = StoryObj<typeof meta>;

const MOCK_RECORDS = [
  { event_type: "FULL", record_time_sec: 14400, race_name: "서울마라톤", race_date: "2025-03-16" },
  { event_type: "FULL", record_time_sec: 13800, race_name: "동아마라톤", race_date: "2025-10-12" },
  { event_type: "FULL", record_time_sec: 13500, race_name: "춘천마라톤", race_date: "2025-10-26" },
  { event_type: "HALF", record_time_sec: 6300, race_name: "서울하프", race_date: "2025-04-06" },
  { event_type: "HALF", record_time_sec: 6000, race_name: "대전하프", race_date: "2025-09-14" },
  { event_type: "HALF", record_time_sec: 5700, race_name: "부산하프", race_date: "2026-01-18" },
  { event_type: "10K", record_time_sec: 2700, race_name: "여의도10K", race_date: "2025-05-04" },
  { event_type: "10K", record_time_sec: 2580, race_name: "한강10K", race_date: "2025-08-17" },
  { event_type: "10K", record_time_sec: 2460, race_name: "잠실10K", race_date: "2026-02-22" },
];

export const Default: Story = {
  args: {
    records: MOCK_RECORDS,
  },
};

export const SingleEvent: Story = {
  args: {
    records: MOCK_RECORDS.filter((r) => r.event_type === "FULL"),
  },
};

export const Empty: Story = {
  args: {
    records: [],
  },
};
