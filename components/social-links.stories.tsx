import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { SocialLinksRow, SocialLinksGrid } from "@/components/social-links";

const meta = {
  title: "Common/SocialLinks",
  component: SocialLinksGrid,
  parameters: { layout: "centered" },
} satisfies Meta<typeof SocialLinksGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Grid: Story = {
  render: () => (
    <div className="w-[375px] p-6">
      <SocialLinksGrid />
    </div>
  ),
};

export const GridWithPassword: Story = {
  render: () => (
    <div className="w-[375px] p-6">
      <SocialLinksGrid kakaoChatPassword="1234" />
    </div>
  ),
};

export const Row: Story = {
  render: () => (
    <div className="w-[375px] p-6 flex justify-center">
      <SocialLinksRow />
    </div>
  ),
};
