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

  const normalizePhone = (value: string) => value.replace(/\D/g, "");

  const handlePhoneSubmit = async (values: MemberOnboardingValues) => {
    const supabase = createClient();
    const phoneValue = normalizePhone(values.phone.trim());
    if (!phoneValue) {
      form.setError("phone", { message: "연락처는 필수야." });
      return;
    }

    form.setValue("phone", phoneValue, { shouldValidate: true });
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
          message: "같은 번호로 등록된 회원이 여러 명이라 관리자 확인이 필요해.",
        });
        return;
      }
      form.setError("root", { message: "기존 회원 확인에 실패했어." });
      return;
    }

    if (existingMember) {
      if (existingMember.auth_user_id && existingMember.auth_user_id !== userId) {
        form.setError("root", {
          message: "이미 다른 계정에 연결된 번호야.",
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
    const phoneValue = normalizePhone(values.phone.trim());
    if (!phoneValue) {
      form.setError("phone", { message: "연락처는 필수야." });
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
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Complete your profile</CardTitle>
          <CardDescription>
            We need a few more details to finish your sign up.
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
                      rules={{ required: "Phone is required." }}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>연락처</FormLabel>
                          <FormControl>
                            <Input
                              type="tel"
                              inputMode="numeric"
                              placeholder="01012345678"
                              value={field.value}
                              onChange={(event) =>
                                field.onChange(
                                  normalizePhone(event.target.value),
                                )
                              }
                            />
                          </FormControl>
                          <p className="text-xs text-muted-foreground">
                            숫자만 입력해줘. 하이픈 없이 010부터.
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
                                placeholder="example@email.com"
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
                      rules={{ required: "Full name is required." }}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>이름</FormLabel>
                          <FormControl>
                            <Input {...field} />
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
                          value !== "" || "Please select a gender.",
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
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="male">Male</SelectItem>
                                <SelectItem value="female">Female</SelectItem>
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
                      rules={{ required: "Birthday is required." }}
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
                      rules={{ required: "Phone is required." }}
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
                              placeholder="예: 123-456-789012"
                            />
                          </FormControl>
                          <p className="text-xs text-muted-foreground">
                            회비 및 기타 돈 환급시 사용해.
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
                          ? "Saving..."
                          : "Save and continue"}
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
