import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Separator } from "@/components/ui/separator";

const meta = {
  title: "UI/Separator",
  component: Separator,
  argTypes: {
    orientation: {
      control: "radio",
      options: ["horizontal", "vertical"],
    },
    decorative: {
      control: "boolean",
    },
  },
} satisfies Meta<typeof Separator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Horizontal: Story = {
  args: {
    orientation: "horizontal",
    decorative: true,
  },
  render: (args) => (
    <div className="w-64">
      <Separator {...args} />
    </div>
  ),
};

export const Vertical: Story = {
  args: {
    orientation: "vertical",
    decorative: true,
  },
  render: (args) => (
    <div className="flex h-20 items-center">
      <Separator {...args} />
    </div>
  ),
};

export const InContent: Story = {
  render: () => (
    <div className="w-72 space-y-1">
      <h4 className="text-sm font-medium leading-none">기강 스포츠 팀</h4>
      <p className="text-sm text-muted-foreground">
        러닝 · 자전거 · 수영 · 트레일러닝
      </p>
      <Separator className="my-4" />
      <div className="flex h-5 items-center space-x-4 text-sm">
        <span>대회</span>
        <Separator orientation="vertical" />
        <span>기록</span>
        <Separator orientation="vertical" />
        <span>프로필</span>
      </div>
    </div>
  ),
};
