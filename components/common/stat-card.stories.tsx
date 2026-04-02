import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { StatCard } from "@/components/common/stat-card";

const meta = {
  title: "Common/StatCard",
  component: StatCard,
} satisfies Meta<typeof StatCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    value: 42,
    label: "활동 멤버",
  },
};

export const WithCustomStyle: Story = {
  args: {
    value: 5,
    label: "예정 대회 중 3개 참가",
    valueClassName: "text-primary",
  },
};

export const Grid: Story = {
  args: { value: 42, label: "활동 멤버" },
  render: () => (
    <div className="grid w-80 grid-cols-2 gap-3">
      <StatCard value={42} label="활동 멤버" />
      <StatCard value={5} label="예정 대회 중 3개 참가" />
      <StatCard value="3:28:15" label="마라톤 평균" />
      <StatCard value={12} label="이번 달 참가" />
    </div>
  ),
};
