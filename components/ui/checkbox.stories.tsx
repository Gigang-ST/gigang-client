import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

const meta = {
  title: "ui/Checkbox",
  component: Checkbox,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithLabel: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Checkbox id="agree" />
      <Label htmlFor="agree">팀 규칙에 동의합니다</Label>
    </div>
  ),
};

export const Checked: Story = {
  args: {
    defaultChecked: true,
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
    defaultChecked: true,
  },
};

export const Group: Story = {
  render: () => (
    <div className="grid gap-3">
      <p className="text-sm font-medium">참가 종목 선택</p>
      {[
        { id: "running", label: "러닝" },
        { id: "cycling", label: "자전거" },
        { id: "swimming", label: "수영" },
        { id: "trail", label: "트레일러닝" },
      ].map((item) => (
        <div key={item.id} className="flex items-center gap-2">
          <Checkbox id={item.id} />
          <Label htmlFor={item.id}>{item.label}</Label>
        </div>
      ))}
    </div>
  ),
};
