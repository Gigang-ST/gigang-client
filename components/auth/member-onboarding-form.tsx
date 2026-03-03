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
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";

type MemberOnboardingFormProps = {
  userId: string;
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

const BANK_OPTIONS = [
  "KB국민은행",
  "신한은행",
  "우리은행",
  "하나은행",
  "NH농협은행",
  "IBK기업은행",
  "SC제일은행",
  "씨티은행",
  "케이뱅크",
  "카카오뱅크",
  "토스뱅크",
  "수협은행",
  "새마을금고",
  "신협",
  "우체국",
  "부산은행",
  "경남은행",
  "대구은행",
  "광주은행",
  "전북은행",
  "제주은행",
];

export function MemberOnboardingForm({
  userId,
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

  const [stage, setStage] = useState<"phone" | "details">("phone");
  const [phoneLoading, setPhoneLoading] = useState(false);

  const joinedAt = useMemo(
    () => new Date().toISOString().slice(0, 10),
    [],
  );

  const digitsOnly = (value: string) => value.replace(/\D/g, "");
  const formatPhone = (value: string) => {
    const digits = digitsOnly(value);
    if (digits.length <= 3) return digits;
    if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
  };
  const isValidPhone = (value: string) => /^010\d{8}$/.test(digitsOnly(value));

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
      .select("id, auth_user_id")
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
      if (existingMember.auth_user_id && existingMember.auth_user_id !== userId) {
        form.setError("root", {
          message: "이미 다른 계정에 연결된 번호입니다.",
        });
        return;
      }

      if (!existingMember.auth_user_id) {
        const { error: updateError } = await supabase
          .from("member")
          .update({ auth_user_id: userId })
          .eq("id", existingMember.id);

        if (updateError) {
          form.setError("root", { message: updateError.message });
          return;
        }
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

    const { error } = await supabase.from("member").insert({
      auth_user_id: userId,
      email: emailValue,
      full_name: values.fullName,
      gender: values.gender,
      birthday: values.birthday,
      phone: phoneValue,
      bank_name: bankName || null,
      bank_account: values.bankAccount.trim() || null,
      status: "active",
      admin: false,
      joined_at: joinedAt,
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
        <Card className="border border-black/20 bg-white/95 text-foreground shadow-2xl">
        <CardHeader>
          <CardTitle className="text-2xl">회원 정보 입력</CardTitle>
          <CardDescription>
            가입을 완료하려면 몇 가지 정보가 더 필요합니다.
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
                {stage === "phone" ? (
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
                          <p className="text-xs text-muted-foreground">
                            010으로 시작하는 휴대폰 번호를 입력해 주세요.
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
