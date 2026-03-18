import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const meta = {
  title: "UI/Input",
  component: Input,
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithLabel: Story = {
  render: () => (
    <div className="grid w-full max-w-sm items-center gap-1.5">
      <Label htmlFor="name">이름</Label>
      <Input id="name" placeholder="팀원 이름을 입력하세요" />
    </div>
  ),
};

export const WithPlaceholder: Story = {
  args: {
    placeholder: "대회명을 검색하세요",
  },
};

export const Disabled: Story = {
  args: {
    placeholder: "수정 불가",
    disabled: true,
    value: "2026 서울 마라톤",
  },
};

export const FileInput: Story = {
  render: () => (
    <div className="grid w-full max-w-sm items-center gap-1.5">
      <Label htmlFor="record">기록 파일</Label>
      <Input id="record" type="file" />
    </div>
  ),
};

export const WithError: Story = {
  render: () => (
    <div className="grid w-full max-w-sm items-center gap-1.5">
      <Label htmlFor="email">이메일</Label>
      <Input
        id="email"
        placeholder="example@gigang.team"
        aria-invalid="true"
        className="border-destructive focus-visible:ring-destructive"
      />
      <p className="text-sm font-medium text-destructive">
        올바른 이메일 형식이 아닙니다.
      </p>
    </div>
  ),
};
