/**
 * 크루 통계 서버 컴포넌트 UI 프리뷰
 * CrewMonthlyStats, CrewProgressChart는 서버 컴포넌트라 직접 렌더 불가.
 * 동일한 UI 구조를 목 데이터로 미리보기.
 */
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { StatCard } from "@/components/common/stat-card";

function CrewMonthlyStatsPreview({
  achievedCount,
  participantCount,
  totalMileage,
  partyPool,
  avgMileage,
}: {
  achievedCount: number;
  participantCount: number;
  totalMileage: number;
  partyPool: number;
  avgMileage: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <StatCard value={`${achievedCount} / ${participantCount}`} label="달성인원 / 참가자수" />
      <StatCard value={`${totalMileage.toFixed(0)} km`} label="총 마일리지" />
      <StatCard value={`₩${Math.floor(partyPool).toLocaleString()}`} label="총 회식비 풀" />
      <StatCard value={`${avgMileage.toFixed(1)} km`} label="평균 마일리지" />
    </div>
  );
}

const meta = {
  title: "Projects/CrewStatsPreview",
  component: CrewMonthlyStatsPreview,
  parameters: { layout: "centered" },
} satisfies Meta<typeof CrewMonthlyStatsPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Active: Story = {
  args: {
    achievedCount: 8,
    participantCount: 15,
    totalMileage: 1240,
    partyPool: 750000,
    avgMileage: 82.7,
  },
  render: (args) => (
    <div className="w-[375px] p-4">
      <CrewMonthlyStatsPreview {...args} />
    </div>
  ),
};

export const EarlyMonth: Story = {
  args: {
    achievedCount: 2,
    participantCount: 15,
    totalMileage: 320,
    partyPool: 750000,
    avgMileage: 21.3,
  },
  render: (args) => (
    <div className="w-[375px] p-4">
      <CrewMonthlyStatsPreview {...args} />
    </div>
  ),
};
