"use client";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export function SignUpForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [otpToken, setOtpToken] = useState("");
  const [otpStep, setOtpStep] = useState<"request" | "verify">("request");
  const [error, setError] = useState<string | null>(null);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next") ?? "/";
  const normalizedNext =
    nextParam.startsWith("/") && !nextParam.startsWith("//")
      ? nextParam
      : "/";
  const safeNext = normalizedNext.startsWith("/protected")
    ? "/"
    : normalizedNext;

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    setIsLoading(true);
    setError(null);
    setResendMessage(null);

    if (password !== repeatPassword) {
      setError("Passwords do not match");
      setIsLoading(false);
      return;
    }

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });
      if (error) throw error;
      setOtpStep("verify");
      setResendMessage("Verification code sent to your email.");
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    setIsVerifying(true);
    setError(null);
    setResendMessage(null);

    const { error } = await supabase.auth.verifyOtp({
      email,
      token: otpToken,
      type: "signup",
    });

    if (error) {
      setError(error.message);
      setIsVerifying(false);
      return;
    }

    router.push(safeNext);
  };

  const handleResendOtp = async () => {
    const supabase = createClient();
    setIsResending(true);
    setError(null);
    setResendMessage(null);

    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
    });

    if (error) {
      setError(error.message);
      setIsResending(false);
      return;
    }

    setResendMessage("Verification code resent.");
    setIsResending(false);
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Sign up</CardTitle>
          <CardDescription>
            {otpStep === "verify"
              ? "Enter the verification code sent to your email"
              : "Create a new account"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={otpStep === "verify" ? handleVerifyOtp : handleSignUp}>
            <div className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="email">이메일</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="m@example.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={otpStep === "verify"}
                />
              </div>
              {otpStep === "verify" ? (
                <div className="grid gap-2">
                  <Label htmlFor="otp-token">인증 코드</Label>
                  <Input
                    id="otp-token"
                    inputMode="numeric"
                    placeholder="123456"
                    required
                    value={otpToken}
                    onChange={(e) => setOtpToken(e.target.value)}
                  />
                </div>
              ) : (
                <>
                  <div className="grid gap-2">
                    <div className="flex items-center">
                      <Label htmlFor="password">비밀번호</Label>
                    </div>
                    <Input
                      id="password"
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <div className="flex items-center">
                      <Label htmlFor="repeat-password">비밀번호 확인</Label>
                    </div>
                    <Input
                      id="repeat-password"
                      type="password"
                      required
                      value={repeatPassword}
                      onChange={(e) => setRepeatPassword(e.target.value)}
                    />
                  </div>
                </>
              )}
              {error && <p className="text-sm text-red-500">{error}</p>}
              {resendMessage && (
                <p className="text-sm text-emerald-600">{resendMessage}</p>
              )}
              <Button
                type="submit"
                className="w-full"
                disabled={isLoading || isVerifying || isResending}
              >
                {otpStep === "verify"
                  ? isVerifying
                    ? "Verifying..."
                    : "Verify code"
                  : isLoading
                    ? "Creating an account..."
                    : "Send verification code"}
              </Button>
              {otpStep === "verify" ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={handleResendOtp}
                    disabled={isLoading || isVerifying || isResending}
                  >
                    {isResending ? "Resending..." : "Resend verification code"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    onClick={() => {
                      setOtpStep("request");
                      setOtpToken("");
                      setResendMessage(null);
                    }}
                    disabled={isLoading || isVerifying || isResending}
                  >
                    Change email
                  </Button>
                </>
              ) : null}
            </div>
            <div className="mt-4 text-center text-sm">
              Already have an account?{" "}
              <Link href="/auth/login" className="underline underline-offset-4">
                Login
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
