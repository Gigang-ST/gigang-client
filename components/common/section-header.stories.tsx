import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { SectionHeader } from "@/components/common/section-header";

const meta = {
  title: "Common/SectionHeader",
  component: SectionHeader,
} satisfies Meta<typeof SectionHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { label: "TEAM OVERVIEW" },
};

export const WithAction: Story = {
  args: {
    label: "RECENT RECORDS",
    action: { label: "모두 보기", href: "/records" },
  },
};
