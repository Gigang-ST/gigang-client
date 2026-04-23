import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { RaceRecordSection } from "@/components/profile/race-record-section";

const meta = {
  title: "Profile/RaceRecordSection",
  component: RaceRecordSection,
  parameters: { layout: "centered" },
} satisfies Meta<typeof RaceRecordSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    memberId: "member-001",
    teamId: "team-001",
    cmmCdRows: [],
    competitionRegisterMemberStatus: undefined,
  },
  render: (args) => (
    <div className="w-[375px] p-4">
      <RaceRecordSection {...args} />
    </div>
  ),
};
