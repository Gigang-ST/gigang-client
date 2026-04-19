"use client";

import { cn } from "@/lib/utils";
import {
  onboardingCheckPhone,
  onboardingCreateMember,
  onboardingLinkExistingMember,
} from "@/app/actions/onboarding-mem-v2";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { CheckCircle2 } from "lucide-react";
import Confetti from "react-confetti";
import { BANK_OPTIONS } from "@/lib/constants";
import { digitsOnly, formatPhone, isValidPhone } from "@/lib/phone-utils";

type MemberOnboardingFormProps = {
  userId: string;
  provider: "kakao" | "google";
  initialFullName?: string | null;
  email?: string | null;
  initialAvatarUrl?: string | null;
  kakaoChatPassword?: string;
};

type MemberOnboardingValues = {
  fullName: string;
  gender: "" | "male" | "female";
  birthday: string;
  phone: string;
  emailInput: string;
  bankAccount: string;
  bankName: string;
  bankNameCustom: string;
};

const KAKAO_OPEN_CHAT_URL = "https://open.kakao.com/o/grnMFGng";

export function MemberOnboardingForm({
  userId: _userId,
  provider,
  initialFullName,
  email,
  initialAvatarUrl,
  kakaoChatPassword,
}: MemberOnboardingFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next") ?? "/";
  const safeNext =
    nextParam.startsWith("/") && !nextParam.startsWith("//")
      ? nextParam
      : "/";
  const form = useForm<MemberOnboardingValues>({
    defaultValues: {
      fullName: initialFullName ?? "",
      gender: "",
      birthday: "",
      phone: "",
      emailInput: email ?? "",
      bankAccount: "",
      bankName: "",
      bankNameCustom: "",
    },
  });

  const [stage, setStage] = useState<"phone" | "details" | "pending" | "success">("phone");
  const [phoneLoading, setPhoneLoading] = useState(false);


  const handlePhoneSubmit = async (values: MemberOnboardingValues) => {
    const phoneValue = formatPhone(values.phone.trim());
    if (!digitsOnly(phoneValue)) {
      form.setError("phone", { message: "연락처를 입력해 주세요." });
      return;
    }
    if (!isValidPhone(phoneValue)) {
      form.setError("phone", { message: "010으로 시작하는 11자리 번호를 입력해 주세요." });
      return;
    }

    form.setValue("phone", phoneValue, { shouldValidate: true });
    form.clearErrors("phone");
    setPhoneLoading(true);
    form.clearErrors("root");

    const check = await onboardingCheckPhone(phoneValue);
    setPhoneLoading(false);

    if (!check.ok) {
      form.setError("root", { message: check.message });
      return;
    }

    if (check.kind === "new") {
      setStage("details");
      return;
    }
    if (check.kind === "pending") {
      setStage("pending");
      return;
    }

    const link = await onboardingLinkExistingMember({
      memId: check.memId,
      provider,
      initialAvatarUrl,
    });
    if (!link.ok) {
      form.setError("root", { message: link.message ?? "연동에 실패했습니다." });
      return;
    }
    router.replace(safeNext);
  };

  const onSubmit = async (values: MemberOnboardingValues) => {
    const emailValue = (email ?? values.emailInput.trim()) || null;
    const phoneValue = formatPhone(values.phone.trim());
    if (!digitsOnly(phoneValue)) {
      form.setError("phone", { message: "연락처를 입력해 주세요." });
      return;
    }
    if (!isValidPhone(phoneValue)) {
      form.setError("phone", { message: "010으로 시작하는 11자리 번호를 입력해 주세요." });
      return;
    }

    if (values.gender !== "male" && values.gender !== "female") {
      form.setError("gender", { message: "성별을 선택해 주세요." });
      return;
    }

    const bankName =
      values.bankName === "custom"
        ? values.bankNameCustom.trim()
        : values.bankName.trim();

    const res = await onboardingCreateMember({
      fullName: values.fullName,
      gender: values.gender,
      birthday: values.birthday,
      phoneDigits: digitsOnly(phoneValue),
      email: emailValue,
      bankName: bankName || null,
      bankAccountRaw: values.bankAccount,
      provider,
      initialAvatarUrl,
    });

    if (!res.ok) {
      form.setError("root", { message: res.message ?? "가입에 실패했습니다." });
      return;
    }

    if (res.alreadyRegistered) {
      router.replace(safeNext);
      return;
    }

    setStage("success");
  };

  if (stage === "success") {
    return (
      <div className="flex flex-col gap-6">
        <Confetti
          width={typeof window !== "undefined" ? window.innerWidth : 400}
          height={typeof window !== "undefined" ? window.innerHeight : 800}
          recycle={false}
          numberOfPieces={500}
          gravity={0.25}
          initialVelocityY={{ min: -30, max: -10 }}
          initialVelocityX={{ min: -10, max: 10 }}
          confettiSource={{
            x: typeof window !== "undefined" ? window.innerWidth / 2 - 50 : 150,
            y: typeof window !== "undefined" ? window.innerHeight : 800,
            w: 100,
            h: 0,
          }}
          style={{ position: "fixed", top: 0, left: 0, zIndex: 50 }}
        />
        <Card className="border-border bg-white shadow-sm">
          <CardContent className="flex flex-col items-center gap-5 pt-8 pb-8">
            <div className="flex size-16 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="size-9 text-green-600" />
            </div>
            <div className="text-center">
              <h3 className="text-2xl font-bold">가입 완료! 🎉</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">
                기강에 오신 것을 환영합니다.
              </p>
            </div>

            {kakaoChatPassword ? (
              <div className="w-full rounded-2xl border border-border bg-secondary/50 px-5 py-4 text-center">
                <p className="text-xs text-muted-foreground">오픈채팅 비밀번호</p>
                <p className="mt-1 text-2xl font-bold tracking-widest text-foreground">
                  {kakaoChatPassword}
                </p>
              </div>
            ) : null}

            <div className="flex w-full flex-col gap-2.5">
              <a
                href={KAKAO_OPEN_CHAT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#FEE500] text-[15px] font-bold text-neutral-900 shadow-sm transition-colors hover:bg-[#fdd835]"
              >
                💬 카카오톡 오픈채팅 참여하기
              </a>
              <Link
                href="/"
                className="flex h-12 items-center justify-center rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground"
              >
                홈으로 이동
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-6")}>
        <Card className="bg-white border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-2xl">회원 정보 입력</CardTitle>
          <CardDescription>
            기존 회원인지 확인하기 위해 연락처를 입력해 주세요.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(
                stage === "phone" ? handlePhoneSubmit : onSubmit,
              )}
            >
              <div className="flex flex-col gap-6">
                {stage === "pending" ? (
                  <div className="flex flex-col gap-4 text-center">
                    <p className="text-sm text-muted-foreground">
                      재가입 신청이 접수되었습니다.<br />
                      관리자 승인 후 이용 가능합니다.
                    </p>
                  </div>
                ) : stage === "phone" ? (
                  <>
                    <FormField
                      control={form.control}
                      name="phone"
                      rules={{
                        required: "연락처를 입력해 주세요.",
                        validate: (value) =>
                          isValidPhone(value) ||
                          "010으로 시작하는 11자리 번호를 입력해 주세요.",
                      }}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>연락처</FormLabel>
                          <FormControl>
                            <Input
                              type="tel"
                              inputMode="numeric"
                              placeholder="010-0000-0000"
                              value={field.value}
                              onChange={(event) =>
                                field.onChange(
                                  formatPhone(event.target.value),
                                )
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {form.formState.errors.root?.message ? (
                      <p className="text-sm text-red-500">
                        {form.formState.errors.root.message}
                      </p>
                    ) : null}
                    <Button
                      type="button"
                      className="w-full"
                      disabled={phoneLoading}
                      onClick={form.handleSubmit(handlePhoneSubmit)}
                    >
                      {phoneLoading ? "확인 중..." : "다음"}
                    </Button>
                  </>
                ) : (
                  <>
                    {email ? (
                      <div className="grid gap-2">
                        <Label>이메일</Label>
                        <Input value={email} disabled />
                      </div>
                    ) : null}
                    {!email ? (
                      <FormField
                        control={form.control}
                        name="emailInput"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>이메일 (선택)</FormLabel>
                            <FormControl>
                              <Input
                                type="email"
                                placeholder="example@email.com (선택)"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    ) : null}
                    <FormField
                      control={form.control}
                      name="fullName"
                      rules={{
                        required: "이름을 입력해 주세요.",
                        validate: (value) => {
                          const trimmed = value.trim();
                          if (!/^[가-힣]+$/.test(trimmed))
                            return "한글 이름만 입력해 주세요";
                          if (trimmed.length < 2)
                            return "이름은 2자 이상 입력해 주세요";
                          if (trimmed.length > 5)
                            return "이름은 5자 이하로 입력해 주세요";
                          return true;
                        },
                      }}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>이름</FormLabel>
                          <FormControl>
                        <Input {...field} placeholder="홍길동" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="gender"
                      rules={{
                        validate: (value) =>
                          value !== "" || "성별을 선택해 주세요.",
                      }}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>성별</FormLabel>
                          <FormControl>
                            <Select
                              value={field.value}
                              onValueChange={field.onChange}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="성별 선택" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="male">남성</SelectItem>
                                <SelectItem value="female">여성</SelectItem>
                              </SelectContent>
                            </Select>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="birthday"
                      rules={{ required: "생년월일을 입력해 주세요." }}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>생년월일</FormLabel>
                          <FormControl>
                        <Input type="date" min="1986-01-01" max="2008-12-31" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="phone"
                      rules={{ required: "연락처를 입력해 주세요." }}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>연락처</FormLabel>
                          <FormControl>
                        <Input type="tel" value={field.value} disabled />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="bankName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>은행</FormLabel>
                          <FormControl>
                            <Select
                              value={field.value}
                              onValueChange={field.onChange}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="은행 선택" />
                              </SelectTrigger>
                              <SelectContent>
                                {BANK_OPTIONS.map((option) => (
                                  <SelectItem key={option} value={option}>
                                    {option}
                                  </SelectItem>
                                ))}
                                <SelectItem value="custom">
                                  기타(직접 입력)
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {form.watch("bankName") === "custom" ? (
                      <FormField
                        control={form.control}
                        name="bankNameCustom"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>은행명 직접 입력</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                placeholder="예: 지역 농협, 단위 농협"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    ) : null}
                    <FormField
                      control={form.control}
                      name="bankAccount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>계좌번호</FormLabel>
                          <FormControl>
                          <Input
                            {...field}
                            placeholder="예: 110123456789 (숫자만)"
                            onChange={(e) => {
                              const sanitized = e.target.value.replace(/[^0-9-]/g, "");
                              field.onChange(sanitized);
                            }}
                          />
                          </FormControl>
                          <p className="text-xs text-muted-foreground">
                            회비 및 기타 환급 시 사용됩니다.
                          </p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {form.formState.errors.root?.message ? (
                      <p className="text-sm text-red-500">
                        {form.formState.errors.root.message}
                      </p>
                    ) : null}
                    <div className="flex flex-col gap-2">
                      <Button
                        type="submit"
                        className="w-full"
                        disabled={form.formState.isSubmitting}
                      >
                        {form.formState.isSubmitting
                          ? "저장 중..."
                          : "저장하고 계속하기"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setStage("phone")}
                      >
                        번호 다시 입력
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
