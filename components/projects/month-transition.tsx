"use client";

import {
  createContext,
  useContext,
  useTransition,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

const MonthTransitionContext = createContext<{
  isPending: boolean;
  startTransition: React.TransitionStartFunction;
}>({
  isPending: false,
  startTransition: (cb) => cb(),
});

export function useMonthTransition() {
  return useContext(MonthTransitionContext);
}

export function MonthTransitionProvider({ children }: { children: ReactNode }) {
  const [isPending, startTransition] = useTransition();
  return (
    <MonthTransitionContext.Provider value={{ isPending, startTransition }}>
      {children}
    </MonthTransitionContext.Provider>
  );
}

export function TransitionOverlay({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { isPending } = useMonthTransition();
  return (
    <div
      className={cn(
        "transition-opacity duration-200",
        isPending && "pointer-events-none opacity-50",
        className,
      )}
    >
      {children}
    </div>
  );
}
