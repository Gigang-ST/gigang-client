"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ThemeProvider } from "next-themes";
import { createClient } from "@/lib/supabase/client";

function AuthRefresher() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      router.refresh();
    });
    return () => subscription.unsubscribe();
  }, [router]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <AuthRefresher />
      {children}
    </ThemeProvider>
  );
}
