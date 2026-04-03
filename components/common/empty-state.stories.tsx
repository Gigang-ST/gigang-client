import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Trophy, Users } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";

const meta = {
  title: "Common/EmptyState",
  component: EmptyState,
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Inline: Story = {
  args: {
    message: "등록된 기록이 없습니다.",
    variant: "inline",
  },
};

export const Card: Story = {
  args: {
    message: "등록된 기록이 없습니다.",
    variant: "card",
  },
};

export const WithIcon: Story = {
  args: {
    icon: Trophy,
    message: "아직 대회 기록이 없습니다.",
    variant: "inline",
  },
};

export const CardWithIcon: Story = {
  args: {
    icon: Users,
    message: "승인 대기 중인 멤버가 없습니다.",
    variant: "card",
  },
};
