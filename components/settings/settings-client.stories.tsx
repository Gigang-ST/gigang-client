import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { SettingsClient } from "@/components/settings/settings-client";

const meta = {
  title: "Settings/SettingsClient",
  component: SettingsClient,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof SettingsClient>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { isAdmin: false, weekStart: 0 },
  render: (args) => (
    <div className="w-[375px]">
      <SettingsClient {...args} />
    </div>
  ),
};

export const Admin: Story = {
  args: { isAdmin: true, weekStart: 0 },
  render: (args) => (
    <div className="w-[375px]">
      <SettingsClient {...args} />
    </div>
  ),
};

/** 월요일 시작을 고른 상태 — DISPLAY 섹션의 세그먼트가 오른쪽에 켜져 있어야 한다. */
export const WeekStartMonday: Story = {
  args: { isAdmin: false, weekStart: 1 },
  render: (args) => (
    <div className="w-[375px]">
      <SettingsClient {...args} />
    </div>
  ),
};
