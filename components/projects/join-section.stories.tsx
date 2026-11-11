import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { JoinSection } from "@/components/projects/join-section";

const meta = {
  title: "Projects/JoinSection",
  component: JoinSection,
  parameters: { layout: "centered" },
} satisfies Meta<typeof JoinSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NotJoined: Story = {
  args: {
    evtId: "evt-001",
    evtStartMonth: "2026-05-01",
    evtEndMonth: "2026-09-01",
    // 계좌는 팀 설정에서 온다 — 스토리는 예시 값
    account: { bank: "예시은행", number: "123-45-678", holder: "예시 운영진" },
    existingPrt: null,
  },
  render: (args) => (
    <div className="w-[375px] p-4">
      <JoinSection {...args} />
    </div>
  ),
};

export const PendingApproval: Story = {
  args: {
    evtId: "evt-001",
    evtStartMonth: "2026-05-01",
    evtEndMonth: "2026-09-01",
    // 계좌는 팀 설정에서 온다 — 스토리는 예시 값
    account: { bank: "예시은행", number: "123-45-678", holder: "예시 운영진" },
    existingPrt: { aprv_yn: false },
  },
  render: (args) => (
    <div className="w-[375px] p-4">
      <JoinSection {...args} />
    </div>
  ),
};
