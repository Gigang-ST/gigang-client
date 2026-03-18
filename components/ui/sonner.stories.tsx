import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";

const meta = {
  title: "ui/Sonner",
  component: Toaster,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof Toaster>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllTypes: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Toaster />
      <Button
        variant="outline"
        onClick={() => toast.success("대회 등록이 완료되었습니다.")}
      >
        성공 (Success)
      </Button>
      <Button
        variant="outline"
        onClick={() => toast.error("기록 등록에 실패했습니다.")}
      >
        에러 (Error)
      </Button>
      <Button
        variant="outline"
        onClick={() => toast.info("다음 대회는 4월 12일입니다.")}
      >
        정보 (Info)
      </Button>
      <Button
        variant="outline"
        onClick={() => toast.warning("대회 접수 마감이 3일 남았습니다.")}
      >
        경고 (Warning)
      </Button>
    </div>
  ),
};

export const WithDescription: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Toaster />
      <Button
        variant="outline"
        onClick={() =>
          toast.success("대회 기록 등록 완료", {
            description: "2026 서울 마라톤 풀코스 3:28:15",
          })
        }
      >
        설명 포함 토스트
      </Button>
      <Button
        variant="outline"
        onClick={() =>
          toast.error("기록 등록 실패", {
            description: "유효하지 않은 기록 형식입니다. HH:MM:SS 형식으로 입력해주세요.",
          })
        }
      >
        에러 + 설명
      </Button>
    </div>
  ),
};

export const WithAction: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Toaster />
      <Button
        variant="outline"
        onClick={() =>
          toast("대회 참가 신청이 취소되었습니다.", {
            action: {
              label: "되돌리기",
              onClick: () => toast.success("참가 신청이 복원되었습니다."),
            },
          })
        }
      >
        액션 버튼 포함
      </Button>
      <Button
        variant="outline"
        onClick={() =>
          toast.success("새 멤버가 가입했습니다.", {
            action: {
              label: "프로필 보기",
              onClick: () => toast.info("프로필 페이지로 이동합니다."),
            },
          })
        }
      >
        성공 + 액션
      </Button>
    </div>
  ),
};
