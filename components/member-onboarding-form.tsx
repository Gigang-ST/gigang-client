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
import { useRouter } from "next/navigation";
import { useMemo } from "react";
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
};

export function MemberOnboardingForm({
  userId,
  initialFullName,
  email,
}: MemberOnboardingFormProps) {
  const router = useRouter();
  const form = useForm<MemberOnboardingValues>({
    defaultValues: {
      fullName: initialFullName ?? "",
      gender: "",
      birthday: "",
      phone: "",
    },
  });

  const joinedAt = useMemo(
    () => new Date().toISOString().slice(0, 10),
    [],
  );

  const onSubmit = async (values: MemberOnboardingValues) => {
    const supabase = createClient();
    if (!email) {
      form.setError("root", { message: "이메일이 필요합니다." });
      return;
    }

    const { error } = await supabase.from("member").insert({
      id: userId,
      email,
      full_name: values.fullName,
      gender: values.gender,
      birthday: values.birthday,
      phone: values.phone,
      status: "active",
      admin: false,
      joined_at: joinedAt,
    });

    if (error) {
      if (error.code === "23505") {
        router.replace("/protected");
        return;
      }
      form.setError("root", { message: error.message });
      return;
    }

    router.replace("/protected");
  };

  return (
    <div className={cn("flex flex-col gap-6")}>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">프로필을 완성해주세요</CardTitle>
          <CardDescription>
            가입을 마무리하려면 몇 가지 정보가 더 필요해요.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <div className="flex flex-col gap-6">
                {email ? (
                  <div className="grid gap-2">
                    <Label>이메일</Label>
                    <Input value={email} disabled />
                  </div>
                ) : null}
                <FormField
                  control={form.control}
                  name="fullName"
                  rules={{ required: "이름을 입력해주세요." }}
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
                      value !== "" || "성별을 선택해주세요.",
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
                            <SelectValue placeholder="선택" />
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
                  rules={{ required: "생년월일을 입력해주세요." }}
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
                  rules={{ required: "연락처를 입력해주세요." }}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>연락처</FormLabel>
                      <FormControl>
                        <Input type="tel" {...field} />
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
                  type="submit"
                  className="w-full"
                  disabled={form.formState.isSubmitting}
                >
                  {form.formState.isSubmitting
                    ? "저장 중..."
                    : "저장하고 계속하기"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
