import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ChevronRight, Mail, Plus, Trophy } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

const meta = {
  title: "UI/Button",
  component: Button,
  args: {
    children: "버튼",
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="default">기본</Button>
      <Button variant="destructive">삭제</Button>
      <Button variant="outline">아웃라인</Button>
      <Button variant="secondary">보조</Button>
      <Button variant="ghost">고스트</Button>
      <Button variant="link">링크</Button>
    </div>
  ),
};

export const AllSizes: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="xs">XS</Button>
      <Button size="sm">SM</Button>
      <Button size="default">기본</Button>
      <Button size="lg">LG</Button>
      <Button size="icon">
        <Plus />
      </Button>
      <Button size="icon-xs">
        <Plus />
      </Button>
      <Button size="icon-sm">
        <Plus />
      </Button>
      <Button size="icon-lg">
        <Plus />
      </Button>
    </div>
  ),
};

export const WithIcon: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button>
        <Mail />
        메일 보내기
      </Button>
      <Button variant="outline">
        <Trophy />
        대회 등록
      </Button>
      <Button variant="secondary">
        기록 보기
        <ChevronRight />
      </Button>
    </div>
  ),
};

export const IconOnly: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="icon-xs" variant="ghost">
        <Plus />
      </Button>
      <Button size="icon-sm" variant="outline">
        <Plus />
      </Button>
      <Button size="icon">
        <Plus />
      </Button>
      <Button size="icon-lg" variant="secondary">
        <Plus />
      </Button>
    </div>
  ),
};

export const Disabled: Story = {
  args: {
    disabled: true,
    children: "비활성화됨",
  },
};

export const AsChild: Story = {
  render: () => (
    <Button asChild>
      <Link href="/races">대회 목록으로 이동</Link>
    </Button>
  ),
};
