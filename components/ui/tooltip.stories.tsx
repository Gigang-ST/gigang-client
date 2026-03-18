import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Info, Trophy, BarChart3, Calendar } from "lucide-react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";

const meta = {
  title: "ui/Tooltip",
  component: Tooltip,
  decorators: [
    (Story) => (
      <TooltipProvider>
        <Story />
      </TooltipProvider>
    ),
  ],
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline" size="icon">
          <Info className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>대회 참가 신청은 마감 7일 전까지 가능합니다</p>
      </TooltipContent>
    </Tooltip>
  ),
};

export const Positions: Story = {
  render: () => (
    <div className="flex items-center gap-8 p-16">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="icon">
            <Trophy className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p>위쪽: 대회 정보</p>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="icon">
            <BarChart3 className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">
          <p>오른쪽: 기록 통계</p>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="icon">
            <Calendar className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>아래쪽: 일정 보기</p>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="icon">
            <Info className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">
          <p>왼쪽: 도움말</p>
        </TooltipContent>
      </Tooltip>
    </div>
  ),
};
