import { Suspense } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { MonthNavigator } from "@/components/projects/month-navigator";

const meta = {
  title: "Projects/MonthNavigator",
  component: MonthNavigator,
  parameters: { layout: "centered" },
} satisfies Meta<typeof MonthNavigator>;

export default meta;
type Story = StoryObj<typeof meta>;

function Wrapped(props: React.ComponentProps<typeof MonthNavigator>) {
  return (
    <Suspense fallback={null}>
      <MonthNavigator {...props} />
    </Suspense>
  );
}

export const Default: Story = {
  render: () => (
    <Wrapped currentMonth="2026-05-01" startMonth="2026-05-01" endMonth="2026-09-01" />
  ),
};

export const MiddleMonth: Story = {
  render: () => (
    <Wrapped currentMonth="2026-07-01" startMonth="2026-05-01" endMonth="2026-09-01" />
  ),
};

export const LastMonth: Story = {
  render: () => (
    <Wrapped currentMonth="2026-09-01" startMonth="2026-05-01" endMonth="2026-09-01" />
  ),
};

export const PracticeMonth: Story = {
  render: () => (
    <Wrapped currentMonth="2026-04-01" startMonth="2026-05-01" endMonth="2026-09-01" />
  ),
};
