import { DeployButton } from "@/components/deploy-button";
import { EnvVarWarning } from "@/components/auth/env-var-warning";
import { AuthButton } from "@/components/auth/auth-button";
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

        <div className="h-12" aria-hidden="true" />
      </div>
    </main>
  );
}
