import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
  SheetClose,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const meta = {
  title: "ui/Sheet",
  component: Sheet,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof Sheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">멤버 정보</Button>
      </SheetTrigger>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>멤버 상세 정보</SheetTitle>
          <SheetDescription>
            팀 멤버의 활동 내역과 대회 기록을 확인하세요.
          </SheetDescription>
        </SheetHeader>
        <div className="px-4 text-sm text-muted-foreground">
          <p>이름: 김기강</p>
          <p>종목: 러닝, 자전거</p>
          <p>최근 대회: 2026 서울 마라톤</p>
          <p>개인 기록: 3:28:15 (풀코스)</p>
        </div>
      </SheetContent>
    </Sheet>
  ),
};

export const Bottom: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">종목 선택</Button>
      </SheetTrigger>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>종목 선택</SheetTitle>
          <SheetDescription>
            참가할 종목을 선택해주세요.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-2 px-4 pb-4">
          <Button variant="outline" className="justify-start">
            러닝 (풀코스 / 하프 / 10km)
          </Button>
          <Button variant="outline" className="justify-start">
            자전거 (로드 / MTB)
          </Button>
          <Button variant="outline" className="justify-start">
            수영 (장거리 / 단거리)
          </Button>
          <Button variant="outline" className="justify-start">
            트레일러닝
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  ),
};

export const Left: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">메뉴</Button>
      </SheetTrigger>
      <SheetContent side="left">
        <SheetHeader>
          <SheetTitle>기강 팀</SheetTitle>
          <SheetDescription>함께 달리는 스포츠 팀</SheetDescription>
        </SheetHeader>
        <nav className="flex flex-col gap-1 px-4">
          <Button variant="ghost" className="justify-start">
            홈
          </Button>
          <Button variant="ghost" className="justify-start">
            대회 일정
          </Button>
          <Button variant="ghost" className="justify-start">
            기록 관리
          </Button>
          <Button variant="ghost" className="justify-start">
            멤버 목록
          </Button>
          <Button variant="ghost" className="justify-start">
            팀 규칙
          </Button>
        </nav>
      </SheetContent>
    </Sheet>
  ),
};

export const WithForm: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button>대회 기록 등록</Button>
      </SheetTrigger>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>대회 기록 등록</SheetTitle>
          <SheetDescription>
            참가한 대회의 기록을 입력해주세요.
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 px-4">
          <div className="grid gap-2">
            <Label htmlFor="sheet-race">대회명</Label>
            <Input id="sheet-race" placeholder="예: 춘천 마라톤" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sheet-event">종목</Label>
            <Input id="sheet-event" placeholder="예: 풀코스" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sheet-record">기록</Label>
            <Input id="sheet-record" placeholder="예: 3:45:20" />
          </div>
        </div>
        <SheetFooter>
          <SheetClose asChild>
            <Button variant="outline">취소</Button>
          </SheetClose>
          <Button>등록</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
};
