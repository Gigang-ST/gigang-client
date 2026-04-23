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
  args: { isAdmin: false },
  render: (args) => (
    <div className="w-[375px]">
      <SettingsClient {...args} />
    </div>
  ),
};

export const Admin: Story = {
  args: { isAdmin: true },
  render: (args) => (
    <div className="w-[375px]">
      <SettingsClient {...args} />
    </div>
  ),
};
