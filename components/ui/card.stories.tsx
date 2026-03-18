import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const meta = {
  title: "UI/Card",
  component: Card,
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Card className="w-[350px]">
      <CardHeader>
        <CardTitle>2026 서울 마라톤</CardTitle>
        <CardDescription>2026년 4월 12일 | 서울 잠실</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          풀코스, 하프, 10km 종목이 진행됩니다. 기강 팀원 8명이 참가
          예정입니다.
        </p>
      </CardContent>
    </Card>
  ),
};

export const WithFooter: Story = {
  render: () => (
    <Card className="w-[350px]">
      <CardHeader>
        <CardTitle>대회 참가 신청</CardTitle>
        <CardDescription>참가할 종목을 선택해주세요.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          풀코스 (42.195km) / 하프 (21.0975km) / 10km
        </p>
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button variant="outline">취소</Button>
        <Button>신청하기</Button>
      </CardFooter>
    </Card>
  ),
};

export const SimpleContent: Story = {
  render: () => (
    <Card className="w-[350px]">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">이번 달 훈련 횟수</span>
          <span className="text-2xl font-bold">12회</span>
        </div>
      </CardContent>
    </Card>
  ),
};
