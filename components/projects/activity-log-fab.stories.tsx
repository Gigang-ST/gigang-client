import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ActivityLogFab } from "@/components/projects/activity-log-fab";

const meta = {
  title: "Projects/ActivityLogFab",
  component: ActivityLogFab,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof ActivityLogFab>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    evtId: "evt-001",
    memId: "member-001",
  },
  render: (args) => (
    <div className="relative h-[600px] w-[375px] bg-background">
      <p className="px-6 pt-6 text-sm text-muted-foreground">
        우측 하단 FAB 버튼을 탭하면 기록 입력 Sheet가 열립니다.
      </p>
      <ActivityLogFab {...args} />
    </div>
  ),
};
