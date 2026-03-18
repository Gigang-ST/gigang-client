import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

const meta = {
  title: "ui/Textarea",
  component: Textarea,
} satisfies Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithLabel: Story = {
  render: () => (
    <div className="grid w-full max-w-sm items-center gap-1.5">
      <Label htmlFor="memo">대회 후기</Label>
      <Textarea id="memo" placeholder="대회 참가 후기를 작성해주세요" />
    </div>
  ),
};

export const WithPlaceholder: Story = {
  args: {
    placeholder: "훈련 일지를 기록해주세요",
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
    value: "2026 춘천 마라톤 완주 후기입니다. 날씨가 좋아서 컨디션이 좋았습니다.",
  },
};

export const WithError: Story = {
  render: () => (
    <div className="grid w-full max-w-sm items-center gap-1.5">
      <Label htmlFor="review">활동 메모</Label>
      <Textarea
        id="review"
        placeholder="최소 10자 이상 입력해주세요"
        aria-invalid="true"
        className="border-destructive focus-visible:ring-destructive"
      />
      <p className="text-sm font-medium text-destructive">
        최소 10자 이상 입력해야 합니다.
      </p>
    </div>
  ),
};
