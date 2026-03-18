import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

const meta = {
  title: "ui/Switch",
  component: Switch,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof Switch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Small: Story = {
  args: {
    size: "sm",
  },
};

export const WithLabel: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Switch id="notification" />
      <Label htmlFor="notification">대회 알림 받기</Label>
    </div>
  ),
};

export const Disabled: Story = {
  args: {
    disabled: true,
    checked: true,
  },
};
