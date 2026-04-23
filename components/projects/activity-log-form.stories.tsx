import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ActivityLogForm } from "@/components/projects/activity-log-form";

const meta = {
  title: "Projects/ActivityLogForm",
  component: ActivityLogForm,
  parameters: { layout: "centered" },
} satisfies Meta<typeof ActivityLogForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const New: Story = {
  args: {
    evtId: "evt-001",
    memId: "member-001",
    onSuccess: () => alert("저장 완료!"),
  },
  render: (args) => (
    <div className="w-[375px] p-6">
      <ActivityLogForm {...args} />
    </div>
  ),
};

export const Edit: Story = {
  args: {
    evtId: "evt-001",
    memId: "member-001",
    editData: {
      act_id: "act-001",
      act_dt: "2026-04-20",
      sprt_enm: "RUNNING",
      distance_km: 10.5,
      elevation_m: 150,
      applied_mults: [],
      review: "오늘도 잘 달렸다!",
    },
    onSuccess: () => alert("수정 완료!"),
  },
  render: (args) => (
    <div className="w-[375px] p-6">
      <ActivityLogForm {...args} />
    </div>
  ),
};
