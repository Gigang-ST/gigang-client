import { LoginForm } from "@/components/auth/login-form";
import { Suspense } from "react";
import { InAppBrowserGate } from "@/components/in-app-browser-gate";
import { SignupProgress } from "@/components/auth/signup-progress";

export default function Page() {
  return (
    <InAppBrowserGate>
      <SignupProgress step={2} />
      <Suspense
        fallback={
          <div className="flex min-h-svh w-full items-center justify-center">
            <div className="size-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </InAppBrowserGate>
  );
}
