import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { User } from "lucide-react";

import { Avatar } from "@/components/common/avatar";

const meta = {
  title: "Common/Avatar",
  component: Avatar,
} satisfies Meta<typeof Avatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { size: "md" },
};

export const AllSizes: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Avatar size="sm" />
      <Avatar size="md" />
      <Avatar size="lg" />
      <Avatar size="xl" />
    </div>
  ),
};

export const WithImage: Story = {
  args: {
    src: "https://api.dicebear.com/9.x/avataaars/svg?seed=gigang",
    alt: "프로필",
    size: "lg",
  },
};

export const Fallback: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Avatar size="md" />
      <Avatar size="md" fallbackIcon={User} />
      <Avatar size="md" src={null} />
    </div>
  ),
};
