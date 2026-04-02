import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const meta = {
  title: "UI/Dialog",
  component: Dialog,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">대회 상세 보기</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>2026 서울 마라톤</DialogTitle>
          <DialogDescription>
            대회 일정 및 참가 정보를 확인하세요.
          </DialogDescription>
        </DialogHeader>
        <div className="text-sm text-muted-foreground">
          <p>일시: 2026년 4월 12일 (일) 오전 7시</p>
          <p>장소: 서울 광화문 광장</p>
          <p>종목: 풀코스 / 하프 / 10km</p>
        </div>
      </DialogContent>
    </Dialog>
  ),
};

export const WithForm: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button>기록 등록</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>대회 기록 등록</DialogTitle>
          <DialogDescription>
            참가한 대회의 기록을 입력해주세요.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="race-name" className="text-right">
              대회명
            </Label>
            <Input
              id="race-name"
              placeholder="예: 춘천 마라톤"
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="record" className="text-right">
              기록
            </Label>
            <Input
              id="record"
              placeholder="예: 3:45:20"
              className="col-span-3"
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">취소</Button>
          </DialogClose>
          <Button type="submit">등록</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

export const WithFooter: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="destructive">팀 탈퇴</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>정말 탈퇴하시겠습니까?</DialogTitle>
          <DialogDescription>
            탈퇴 시 모든 대회 기록과 활동 내역이 삭제됩니다. 이 작업은 되돌릴 수
            없습니다.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">취소</Button>
          </DialogClose>
          <Button variant="destructive">탈퇴하기</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};
