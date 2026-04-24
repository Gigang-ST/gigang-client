export type ThemePreset = {
  name: string;
  /** 전체 oklch 색상값 — CSS var에 직접 주입 */
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
};

export const THEMES: Record<string, ThemePreset> = {
  blue: {
    name: "블루 (기본)",
    primary: "oklch(0.623 0.188 260)",
    primaryForeground: "oklch(1 0 0)",
    secondary: "oklch(0.961 0 0)",
    secondaryForeground: "oklch(0.21 0 0)",
  },
  indigo: {
    name: "인디고",
    primary: "oklch(0.585 0.233 277)",
    primaryForeground: "oklch(1 0 0)",
    secondary: "oklch(0.955 0.02 277)",
    secondaryForeground: "oklch(0.21 0.03 277)",
  },
  emerald: {
    name: "에메랄드",
    primary: "oklch(0.527 0.154 150)",
    primaryForeground: "oklch(1 0 0)",
    secondary: "oklch(0.955 0.03 150)",
    secondaryForeground: "oklch(0.21 0.04 150)",
  },
  rose: {
    name: "로즈",
    primary: "oklch(0.647 0.243 13)",
    primaryForeground: "oklch(1 0 0)",
    secondary: "oklch(0.955 0.025 13)",
    secondaryForeground: "oklch(0.21 0.03 13)",
  },
  amber: {
    name: "앰버",
    primary: "oklch(0.769 0.188 70)",
    primaryForeground: "oklch(0.21 0 0)",
    secondary: "oklch(0.97 0.025 70)",
    secondaryForeground: "oklch(0.21 0.04 70)",
  },
};
