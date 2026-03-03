"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

type ProfileFormValues = {
  fullName: string;
  gender: "" | "male" | "female";
  birthday: string;
  phone: string;
  emailInput: string;
  bankAccount: string;
  bankName: string;
  bankNameCustom: string;
};

type ProfileFormProps = {
  userId: string;
  initialValues: {
    fullName: string;
    gender: "" | "male" | "female";
    birthday: string;
    phone: string;
    email: string;
    bankName: string;
    bankAccount: string;
  };
};

type ProviderName = "google" | "kakao";

export function ProfileForm({ userId, initialValues }: ProfileFormProps) {
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [linking, setLinking] = useState<ProviderName | null>(null);
  const [linkedProviders, setLinkedProviders] = useState<Set<ProviderName>>(
    new Set(),
  );

  const form = useForm<ProfileFormValues>({
    defaultValues: {
      fullName: initialValues.fullName,
      gender: initialValues.gender,
      birthday: initialValues.birthday,
      phone: initialValues.phone,
      emailInput: initialValues.email,
      bankAccount: initialValues.bankAccount,
      bankName: initialValues.bankName,
      bankNameCustom: "",
    },
  });

  useEffect(() => {
    const supabase = createClient();
    void supabase.auth.getUser().then(({ data }) => {
      const providers = new Set<ProviderName>();
      data.user?.identities?.forEach((identity) => {
        if (identity.provider === "google" || identity.provider === "kakao") {
          providers.add(identity.provider);
        }
      });
      setLinkedProviders(providers);
    });
  }, []);

  const saveProfile = async (values: ProfileFormValues) => {
    setSaveState("saving");
    setMessage(null);

    const bankName =
      values.bankName === "custom"
        ? values.bankNameCustom.trim()
        : values.bankName.trim();

    const supabase = createClient();
    const { error } = await supabase
      .from("member")
      .update({
        full_name: values.fullName.trim(),
        gender: values.gender,
        birthday: values.birthday,
        email: values.emailInput.trim() || null,
        bank_name: bankName || null,
        bank_account: values.bankAccount.trim() || null,
      })
      .eq("auth_user_id", userId);

    if (error) {
      setSaveState("error");
      setMessage(error.message);
      return;
    }

    setSaveState("success");
    setMessage("저장 완료");
  };

  const handleLink = async (provider: ProviderName) => {
    if (linkedProviders.has(provider)) {
      return;
    }

    setLinking(provider);
    setMessage(null);

    const supabase = createClient();
    const origin = window.location.origin;
    const { error } = await supabase.auth.linkIdentity({
      provider,
      options: {
        redirectTo: `${origin}/auth/callback?flow=link&next=/profile`,
      },
    });

    if (error) {
      setLinking(null);
      setMessage(error.message);
    }
  };

  const providerStatus = (provider: ProviderName) =>
    linkedProviders.has(provider) ? "연결됨" : "연결하기";

  return (
    <Card className="border border-black/10 bg-white/95 text-foreground shadow-lg">
      <CardHeader>
        <CardTitle className="text-2xl">프로필</CardTitle>
        <CardDescription>
          내 정보를 수정하고 OAuth 연결도 여기서 할 수 있습니다.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(saveProfile)}>
            <div className="flex flex-col gap-6">
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
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="성별 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="male">남자</SelectItem>
                          <SelectItem value="female">여자</SelectItem>
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
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>연락처</FormLabel>
                    <FormControl>
                      <Input type="tel" value={field.value} disabled />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      연락처는 변경할 수 없습니다.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
              <FormField
                control={form.control}
                name="bankName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>은행</FormLabel>
                    <FormControl>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="은행 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          {BANK_OPTIONS.map((option) => (
                            <SelectItem key={option} value={option}>
                              {option}
                            </SelectItem>
                          ))}
                          <SelectItem value="custom">기타(직접 입력)</SelectItem>
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

              <div className="flex flex-col gap-2">
                <Button type="submit" disabled={saveState === "saving"}>
                  {saveState === "saving" ? "저장 중..." : "저장"}
                </Button>
                {message ? (
                  <p
                    className={
                      saveState === "error"
                        ? "text-sm text-red-500"
                        : "text-sm text-emerald-600"
                    }
                  >
                    {message}
                  </p>
                ) : null}
              </div>

              <div className="border-t border-black/10 pt-4">
                <p className="text-sm font-medium">OAuth 연결</p>
                <p className="text-xs text-muted-foreground">
                  구글/카카오 계정을 연결해두면 다음 로그인에서 바로 들어갈 수 있습니다.
                </p>
                <div className="mt-3 flex flex-col gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleLink("google")}
                    disabled={linking === "google" || linkedProviders.has("google")}
                  >
                    Google {providerStatus("google")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleLink("kakao")}
                    disabled={linking === "kakao" || linkedProviders.has("kakao")}
                  >
                    Kakao {providerStatus("kakao")}
                  </Button>
                </div>
              </div>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
