import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { PersonalBestGrid } from "@/components/profile/personal-best-grid";

const meta = {
  title: "Profile/PersonalBestGrid",
  component: PersonalBestGrid,
  parameters: { layout: "centered" },
} satisfies Meta<typeof PersonalBestGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

const mockBestRecords = {
  FULL: { record_time_sec: 11640, race_name: "2025 서울 마라톤" },   // 3:14:00
  HALF: { record_time_sec: 5400, race_name: "2025 춘천 하프" },       // 1:30:00
  "10K": { record_time_sec: 2820, race_name: "2025 강남 10K" },       // 47:00
};

const mockUtmb = {
  utmb_profile_url: "https://utmb.world/en/runner/12345.gildong.hong",
  utmb_index: 275,
  recent_race_name: "UTMB 2024",
  recent_race_record: "28:30:00",
};

export const WithAllRecords: Story = {
  args: {
    bestRecords: mockBestRecords,
    utmbData: mockUtmb,
  },
  render: (args) => (
    <div className="w-[375px] p-4">
      <PersonalBestGrid {...args} />
    </div>
  ),
};

export const NoRecords: Story = {
  args: {
    bestRecords: {},
    utmbData: null,
  },
  render: (args) => (
    <div className="w-[375px] p-4">
      <PersonalBestGrid {...args} />
    </div>
  ),
};

export const PartialRecords: Story = {
  args: {
    bestRecords: {
      FULL: { record_time_sec: 13200, race_name: "2024 동아 마라톤" },
    },
    utmbData: null,
  },
  render: (args) => (
    <div className="w-[375px] p-4">
      <PersonalBestGrid {...args} />
    </div>
  ),
};
