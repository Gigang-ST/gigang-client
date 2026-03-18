import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { LoadingSpinner } from "@/components/ui/loading-spinner";

const meta = {
  title: "UI/LoadingSpinner",
  component: LoadingSpinner,
} satisfies Meta<typeof LoadingSpinner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};

export const CustomSize: Story = {
  args: {
    className: "min-h-[20vh]",
  },
};
