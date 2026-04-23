import type { Preview, Decorator } from "@storybook/nextjs-vite";
import "../app/globals.css";
import { THEMES } from "./themes";

const withTheme: Decorator = (Story, context) => {
  const themeKey = (context.globals.theme as string) ?? "blue";
  const theme = THEMES[themeKey] ?? THEMES.blue;
  const darkMode = (context.globals.darkMode as string) === "dark";
  const root = document.documentElement;

  // 다크모드 클래스 토글
  root.classList.toggle("dark", darkMode);

  // primary/secondary 색상 주입
  root.style.setProperty("--primary", theme.primary);
  root.style.setProperty("--primary-foreground", theme.primaryForeground);
  root.style.setProperty("--secondary", theme.secondary);
  root.style.setProperty("--secondary-foreground", theme.secondaryForeground);
  // ring, accent, info는 primary/secondary 따라감
  root.style.setProperty("--ring", theme.primary);
  root.style.setProperty("--accent", theme.secondary);
  root.style.setProperty("--accent-foreground", theme.secondaryForeground);
  root.style.setProperty("--info", theme.primary);
  root.style.setProperty("--info-foreground", theme.primaryForeground);

  return Story();
};

const preview: Preview = {
  globalTypes: {
    theme: {
      description: "테마 색상",
      defaultValue: "blue",
      toolbar: {
        title: "테마",
        icon: "paintbrush",
        items: Object.entries(THEMES).map(([key, t]) => ({
          value: key,
          title: t.name,
        })),
        dynamicTitle: true,
      },
    },
    darkMode: {
      description: "다크모드",
      defaultValue: "light",
      toolbar: {
        title: "모드",
        icon: "circlehollow",
        items: [
          { value: "light", title: "라이트", icon: "sun" },
          { value: "dark", title: "다크", icon: "moon" },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [withTheme],
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