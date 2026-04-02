import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Settings } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";

const meta = {
  title: "Common/PageHeader",
  component: PageHeader,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof PageHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { title: "기강" },
};

export const WithAction: Story = {
  args: {
    title: "내 프로필",
    action: (
      <Button variant="ghost" size="icon" asChild>
        <Link href="/settings">
          <Settings className="size-[22px] text-muted-foreground" />
        </Link>
      </Button>
    ),
  },
};
