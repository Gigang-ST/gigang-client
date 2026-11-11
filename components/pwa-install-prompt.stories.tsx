import { GIGANG_COPY } from "@/lib/__fixtures__/team-copy";
import { PwaInstallPrompt } from "@/components/pwa-install-prompt";

import type { Meta, StoryObj } from "@storybook/nextjs-vite";


const meta = {
  title: "Common/PwaInstallPrompt",
  component: PwaInstallPrompt,
} satisfies Meta<typeof PwaInstallPrompt>;

export default meta;
type Story = StoryObj<typeof meta>;

// 참고: standalone/인앱이 아닌 일반 브라우저 환경에서만 렌더됨.
const TITLE = GIGANG_COPY.installPromptTitle;
export const Banner: Story = { args: { variant: "banner", title: TITLE } };
export const Inline: Story = { args: { variant: "inline", title: TITLE } };
