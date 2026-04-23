import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetTrigger,
} from "@/components/ui/sheet";

const meta = {
  title: "UI/Sheet",
  component: Sheet,
  parameters: { layout: "centered" },
} satisfies Meta<typeof Sheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Bottom: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button>하단 시트 열기</Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="rounded-t-2xl px-6">
        <SheetHeader className="px-0 pt-4 pb-0">
          <SheetTitle>기록 입력</SheetTitle>
          <SheetDescription>오늘 달린 거리를 입력해 주세요.</SheetDescription>
        </SheetHeader>
        <div className="py-6">
          <p className="text-sm text-muted-foreground">폼 내용이 여기에 들어갑니다.</p>
        </div>
        <SheetFooter>
          <Button className="w-full h-12 rounded-xl">저장</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
};

export const Right: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">우측 시트 열기</Button>
      </SheetTrigger>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>설정</SheetTitle>
          <SheetDescription>앱 설정을 변경하세요.</SheetDescription>
        </SheetHeader>
        <div className="py-4">
          <p className="text-sm text-muted-foreground">설정 항목이 여기에 들어갑니다.</p>
        </div>
      </SheetContent>
    </Sheet>
  ),
};

export const Left: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">좌측 시트 열기</Button>
      </SheetTrigger>
      <SheetContent side="left">
        <SheetHeader>
          <SheetTitle>메뉴</SheetTitle>
        </SheetHeader>
        <div className="py-4">
          <p className="text-sm text-muted-foreground">네비게이션 항목이 여기에 들어갑니다.</p>
        </div>
      </SheetContent>
    </Sheet>
  ),
};
