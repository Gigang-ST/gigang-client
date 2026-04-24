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

  // primary 계열만 주입 (surface 토큰은 .dark 블록이 담당)
  root.style.setProperty("--primary", theme.primary);
  root.style.setProperty("--primary-foreground", theme.primaryForeground);
  root.style.setProperty("--ring", theme.primary);
  root.style.setProperty("--info", theme.primary);
  root.style.setProperty("--info-foreground", theme.primaryForeground);

  // 라이트모드에서만 secondary/accent 주입 (다크모드는 .dark 블록 사용)
  if (!darkMode) {
    root.style.setProperty("--secondary", theme.secondary);
    root.style.setProperty("--secondary-foreground", theme.secondaryForeground);
    root.style.setProperty("--accent", theme.secondary);
    root.style.setProperty("--accent-foreground", theme.secondaryForeground);
  } else {
    root.style.removeProperty("--secondary");
    root.style.removeProperty("--secondary-foreground");
    root.style.removeProperty("--accent");
    root.style.removeProperty("--accent-foreground");
  }

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