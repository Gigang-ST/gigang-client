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
import { useState } from "react";
import { useForm } from "react-hook-form";
import { BANK_OPTIONS } from "@/lib/constants";

type MemberOnboardingFormProps = {
  userId: string;
  provider: "kakao" | "google";
  initialFullName?: string | null;
  email?: string | null;
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

export function MemberOnboardingForm({
  userId,
  provider,
  initialFullName,
  email,
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

  const [stage, setStage] = useState<"phone" | "details" | "inactive" | "pending">("phone");
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [inactiveMemberId, setInactiveMemberId] = useState<string | null>(null);
  const [rejoinLoading, setRejoinLoading] = useState(false);

  const digitsOnly = (value: string) => value.replace(/\D/g, "");
  const formatPhone = (value: string) => {
    const digits = digitsOnly(value);
    if (digits.length <= 3) return digits;
    if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
  };
  const isValidPhone = (value: string) => /^010\d{8}$/.test(digitsOnly(value));

  const handleRejoinRequest = async () => {
    if (!inactiveMemberId) return;
    setRejoinLoading(true);
    const supabase = createClient();
    const column = provider === "kakao" ? "kakao_user_id" : "google_user_id";
    const { error } = await supabase
      .from("member")
      .update({ status: "pending", [column]: userId, updated_at: new Date().toISOString() })
      .eq("id", inactiveMemberId);
    setRejoinLoading(false);
    if (error) {
      form.setError("root", { message: error.message });
      return;
    }
    setStage("pending");
  };

  const handlePhoneSubmit = async (values: MemberOnboardingValues) => {
    const supabase = createClient();
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

    const { data: existingMember, error: lookupError } = await supabase
      .from("member")
      .select("id, status")
      .eq("phone", phoneValue)
      .maybeSingle();

    setPhoneLoading(false);

    if (lookupError) {
      if (lookupError.code === "PGRST116") {
        form.setError("root", {
          message: "같은 번호로 등록된 회원이 여러 명이라 관리자 확인이 필요합니다.",
        });
        return;
      }
      form.setError("root", { message: "기존 회원 확인에 실패했습니다." });
      return;
    }

    if (existingMember) {
      if (existingMember.status === "inactive") {
        setInactiveMemberId(existingMember.id);
        setStage("inactive");
        return;
      }
      if (existingMember.status === "pending") {
        setStage("pending");
        return;
      }

      const column = provider === "kakao" ? "kakao_user_id" : "google_user_id";
      const { error: linkError } = await supabase
        .from("member")
        .update({ [column]: userId })
        .eq("id", existingMember.id);

      if (linkError) {
        form.setError("root", { message: linkError.message });
        return;
      }

      router.replace(safeNext);
      return;
    }

    setStage("details");
  };

  const onSubmit = async (values: MemberOnboardingValues) => {
    const supabase = createClient();
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

    const bankName =
      values.bankName === "custom"
        ? values.bankNameCustom.trim()
        : values.bankName.trim();

    const column = provider === "kakao" ? "kakao_user_id" : "google_user_id";
    const { error } = await supabase.from("member").insert({
      [column]: userId,
      email: emailValue,
      full_name: values.fullName,
      gender: values.gender,
      birthday: values.birthday,
      phone: phoneValue,
      bank_name: bankName || null,
      bank_account: values.bankAccount.trim() || null,
      status: "active",
      admin: false,
      joined_at: new Date().toISOString().slice(0, 10),
    });

    if (error) {
      if (error.code === "23505") {
        router.replace(safeNext);
        return;
      }
      form.setError("root", { message: error.message });
      return;
    }

    router.replace(safeNext);
  };

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
                {stage === "inactive" ? (
                  <div className="flex flex-col gap-4 text-center">
                    <p className="text-sm text-muted-foreground">
                      탈퇴 처리된 계정입니다.<br />
                      재가입을 신청하면 관리자 승인 후 이용 가능합니다.
                    </p>
                    {form.formState.errors.root?.message ? (
                      <p className="text-sm text-red-500">
                        {form.formState.errors.root.message}
                      </p>
                    ) : null}
                    <Button
                      type="button"
                      className="w-full"
                      disabled={rejoinLoading}
                      onClick={handleRejoinRequest}
                    >
                      {rejoinLoading ? "신청 중..." : "재가입 신청"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setStage("phone")}
                    >
                      번호 다시 입력
                    </Button>
                  </div>
                ) : stage === "pending" ? (
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
                      rules={{ required: "이름을 입력해 주세요." }}
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
                        <Input type="date" {...field} />
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
