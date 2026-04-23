import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { BottomTabBar } from "@/components/bottom-tab-bar";

const meta = {
  title: "Navigation/BottomTabBar",
  component: BottomTabBar,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof BottomTabBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Home: Story = {
  parameters: {
    nextjs: { navigation: { pathname: "/" } },
  },
};

export const Races: Story = {
  parameters: {
    nextjs: { navigation: { pathname: "/races" } },
  },
};

export const Projects: Story = {
  parameters: {
    nextjs: { navigation: { pathname: "/projects" } },
  },
};

export const Records: Story = {
  parameters: {
    nextjs: { navigation: { pathname: "/records" } },
  },
};

export const Profile: Story = {
  parameters: {
    nextjs: { navigation: { pathname: "/profile" } },
  },
};
