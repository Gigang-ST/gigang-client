import { SignupProgress } from "@/components/auth/signup-progress";
import { getTeamSignup } from "@/lib/team-signup";

import type { Meta, StoryObj } from "@storybook/nextjs-vite";


const meta = {
  title: "Auth/SignupProgress",
  component: SignupProgress,
} satisfies Meta<typeof SignupProgress>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Start: Story = { args: { step: "시작" } };
export const Login: Story = { args: { step: "로그인" } };
export const Details: Story = { args: { step: "기본 정보" } };
export const RunningProfile: Story = { args: { step: "러닝 프로필" } };
export const Purpose: Story = { args: { step: "가입 목적" } };
export const Pledge: Story = { args: { step: "참석 약속" } };
export const Done: Story = { args: { step: "참석 약속", done: true } };
/** 러닝 프로필 단계가 없는 팀(모비) — 5단계 */
export const PurposeWithoutRunningProfile: Story = { args: { step: "가입 목적", steps: getTeamSignup("ulsan", { runningProfile: false }).steps } };
