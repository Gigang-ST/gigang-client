import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverDescription,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const meta = {
  title: "ui/Popover",
  component: Popover,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof Popover>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">대회 일정 보기</Button>
      </PopoverTrigger>
      <PopoverContent>
        <div className="grid gap-2 text-sm">
          <p className="font-medium">2026 서울 마라톤</p>
          <p className="text-muted-foreground">
            2026년 4월 12일 (일) 오전 7시
          </p>
          <p className="text-muted-foreground">장소: 서울 광화문 광장</p>
          <p className="text-muted-foreground">
            종목: 풀코스 / 하프 / 10km
          </p>
        </div>
      </PopoverContent>
    </Popover>
  ),
};

export const WithForm: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button>기록 등록</Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="grid gap-4">
          <div className="text-sm font-medium">대회 기록 입력</div>
          <div className="grid gap-3">
            <div className="grid grid-cols-3 items-center gap-4">
              <Label htmlFor="popover-race">대회명</Label>
              <Input
                id="popover-race"
                placeholder="예: 춘천 마라톤"
                className="col-span-2"
              />
            </div>
            <div className="grid grid-cols-3 items-center gap-4">
              <Label htmlFor="popover-time">완주 기록</Label>
              <Input
                id="popover-time"
                placeholder="예: 3:45:20"
                className="col-span-2"
              />
            </div>
            <div className="grid grid-cols-3 items-center gap-4">
              <Label htmlFor="popover-distance">거리</Label>
              <Input
                id="popover-distance"
                placeholder="예: 42.195km"
                className="col-span-2"
              />
            </div>
          </div>
          <Button size="sm" className="w-full">
            등록
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  ),
};

export const WithHeader: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">팀 정보</Button>
      </PopoverTrigger>
      <PopoverContent>
        <PopoverHeader>
          <PopoverTitle>기강 (Gigang)</PopoverTitle>
          <PopoverDescription>
            러닝, 자전거, 수영, 트레일러닝을 함께하는 스포츠 팀
          </PopoverDescription>
        </PopoverHeader>
        <div className="mt-4 grid gap-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">팀원 수</span>
            <span className="font-medium">42명</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">창단일</span>
            <span className="font-medium">2024년 3월</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">참가 대회</span>
            <span className="font-medium">28회</span>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  ),
};
