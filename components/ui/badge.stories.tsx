import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Bike, Footprints, Waves } from "lucide-react";

import { Badge } from "@/components/ui/badge";

const meta = {
  title: "UI/Badge",
  component: Badge,
  args: {
    children: "마라톤",
  },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Badge variant="default">참가 확정</Badge>
      <Badge variant="secondary">대기 중</Badge>
      <Badge variant="destructive">마감</Badge>
      <Badge variant="outline">자유 참가</Badge>
    </div>
  ),
};

export const WithIcon: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Badge>
        <Footprints className="mr-1 size-3" />
        러닝
      </Badge>
      <Badge variant="secondary">
        <Bike className="mr-1 size-3" />
        자전거
      </Badge>
      <Badge variant="outline">
        <Waves className="mr-1 size-3" />
        수영
      </Badge>
    </div>
  ),
};
