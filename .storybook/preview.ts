import type { Preview } from "@storybook/nextjs-vite";
import "../app/globals.css";

const preview: Preview = {
  parameters: {
    nextjs: {
      appDirectory: true,
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    layout: "centered",
    options: {
      storySort: {
        order: [
          "Design Tokens",
          "Navigation",
          "UI",
          "Common",
          "Home",
          "Profile",
          "Projects",
          "Races",
          "Settings",
        ],
      },
    },
  },
};

export default preview;