import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { BackHeader } from "@/components/back-header";

const meta = {
  title: "Navigation/BackHeader",
  component: BackHeader,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof BackHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithTitle: Story = {
  args: { title: "프로필 수정" },
};

export const WithoutTitle: Story = {
  args: {},
};

export const LongTitle: Story = {
  args: { title: "2026 서울 마라톤 참가 신청 상세" },
};
