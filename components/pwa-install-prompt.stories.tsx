import { PwaInstallPrompt } from "@/components/pwa-install-prompt";

import type { Meta, StoryObj } from "@storybook/nextjs-vite";


const meta = {
  title: "Common/PwaInstallPrompt",
  component: PwaInstallPrompt,
} satisfies Meta<typeof PwaInstallPrompt>;

export default meta;
type Story = StoryObj<typeof meta>;

// 참고: standalone/인앱이 아닌 일반 브라우저 환경에서만 렌더됨.
export const Banner: Story = { args: { variant: "banner" } };
export const Inline: Story = { args: { variant: "inline" } };
