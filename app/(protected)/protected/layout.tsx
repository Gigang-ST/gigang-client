import { DeployButton } from "@/components/deploy-button";
import { EnvVarWarning } from "@/components/env-var-warning";
import { AuthButton } from "@/components/auth-button";
import { hasEnvVars } from "@/lib/utils";
import { Suspense } from "react";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen flex flex-col items-center text-white">
      <div className="flex-1 w-full flex flex-col gap-10 items-center">
        <div className="w-full max-w-5xl px-5 pt-20 flex items-center justify-between text-sm text-white/90">
          <div className="flex items-center gap-2">
            <DeployButton />
          </div>
          {!hasEnvVars ? (
            <EnvVarWarning />
          ) : (
            <Suspense>
              <AuthButton />
            </Suspense>
          )}
        </div>
        <div className="flex-1 flex flex-col gap-20 max-w-5xl p-5 w-full">
          {children}
        </div>

        <footer className="w-full flex items-center justify-center border-t border-white/10 mx-auto text-center text-xs gap-4 py-6 text-white/70">
          <p>
            Powered by{" "}
            <a
              href="https://supabase.com/?utm_source=create-next-app&utm_medium=template&utm_term=nextjs"
              target="_blank"
              className="font-bold hover:underline"
              rel="noreferrer"
            >
              Supabase
            </a>
          </p>
        </footer>
      </div>
    </main>
  );
}
