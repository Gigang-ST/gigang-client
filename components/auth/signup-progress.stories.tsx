import { SignupProgress } from "@/components/auth/signup-progress";

import type { Meta, StoryObj } from "@storybook/nextjs-vite";


const meta = {
  title: "Auth/SignupProgress",
  component: SignupProgress,
} satisfies Meta<typeof SignupProgress>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Step1: Story = { args: { step: 1 } };
export const Step2: Story = { args: { step: 2 } };
export const Step3: Story = { args: { step: 3 } };
export const Done: Story = { args: { step: 3, done: true } };
