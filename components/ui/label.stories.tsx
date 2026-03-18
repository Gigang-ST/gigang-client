import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

const meta = {
  title: "ui/Label",
  component: Label,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof Label>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: "멤버 이름",
  },
};

export const WithInput: Story = {
  render: () => (
    <div className="grid w-full max-w-sm items-center gap-1.5">
      <Label htmlFor="member-name">멤버 이름</Label>
      <Input id="member-name" type="text" placeholder="이름을 입력하세요" />
    </div>
  ),
};

export const Required: Story = {
  render: () => (
    <div className="grid w-full max-w-sm items-center gap-1.5">
      <Label htmlFor="race-record">
        대회 기록 <span className="text-destructive">*</span>
      </Label>
      <Input id="race-record" type="text" placeholder="예: 3:45:20" />
    </div>
  ),
};
