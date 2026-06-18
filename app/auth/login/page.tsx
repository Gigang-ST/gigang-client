import { Suspense } from "react";

import { LoginForm } from "@/components/auth/login-form";
import { SignupProgress } from "@/components/auth/signup-progress";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const isSignupFlow = next === "/onboarding";
  return (
    <>
      {isSignupFlow && <SignupProgress step={2} />}
      <Suspense
        fallback={
          <div className="flex min-h-svh w-full items-center justify-center">
            <div className="size-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </>
  );
}
