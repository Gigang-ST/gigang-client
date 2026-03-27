"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

type ChartMode = "mileage" | "percent";

const ChartModeContext = createContext<{
  mode: ChartMode;
  setMode: (m: ChartMode) => void;
}>({ mode: "mileage", setMode: () => {} });

export function ChartModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ChartMode>("mileage");
  return (
    <ChartModeContext.Provider value={{ mode, setMode }}>
      {children}
    </ChartModeContext.Provider>
  );
}

export function useChartMode() {
  return useContext(ChartModeContext);
}
