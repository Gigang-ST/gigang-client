"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

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

type BankData = {
  memberId: string;
  fullName: string;
  bankName: string;
  bankAccount: string;
};

export default function BankInfoPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [data, setData] = useState<BankData | null>(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/auth/login");
        return;
      }

      const { data: member } = await supabase
        .from("member")
        .select("id, full_name, bank_name, bank_account")
        .or(`kakao_user_id.eq.${user.id},google_user_id.eq.${user.id}`)
        .maybeSingle();

      if (!member) {
        router.push("/onboarding");
        return;
      }

      setData({
        memberId: member.id,
        fullName: member.full_name ?? "",
        bankName: member.bank_name ?? "",
        bankAccount: member.bank_account ?? "",
      });
      setLoading(false);
    }

    load();
  }, [router]);

  const handleSave = async () => {
    if (!data) return;
    setSaving(true);
    setMessage(null);

    const supabase = createClient();
    const { error } = await supabase
      .from("member")
      .update({
        bank_name: data.bankName.trim() || null,
        bank_account: data.bankAccount.trim() || null,
      })
      .eq("id", data.memberId);

    if (error) {
      setMessage({ type: "error", text: "저장에 실패했습니다." });
    } else {
      setMessage({ type: "success", text: "저장 완료" });
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-6 px-6 pt-4">
        <Skeleton className="h-24 w-full rounded-2xl" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-4 w-16 rounded" />
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
        ))}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="flex flex-col gap-6 px-6 pb-6 pt-4">
      {/* 안내 카드 */}
      <div className="flex items-center gap-3 rounded-2xl bg-secondary p-5">
        <Info className="size-5 shrink-0 text-primary" />
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          회비 및 기타 환급 시 사용됩니다.
          <br />
          정확한 정보를 입력해 주세요.
        </p>
      </div>

      {/* 은행 */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-foreground">은행</label>
        <Select
          value={data.bankName}
          onValueChange={(v) => setData({ ...data, bankName: v })}
        >
          <SelectTrigger className="h-12 rounded-xl border-[1.5px] text-[15px]">
            <SelectValue placeholder="은행 선택" />
          </SelectTrigger>
          <SelectContent>
            {BANK_OPTIONS.map((bank) => (
              <SelectItem key={bank} value={bank}>
                {bank}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 계좌번호 */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-foreground">계좌번호</label>
        <Input
          value={data.bankAccount}
          onChange={(e) => setData({ ...data, bankAccount: e.target.value })}
          placeholder="예: 3333-12-3456789"
          className="h-12 rounded-xl border-[1.5px] text-[15px]"
        />
        <span className="text-xs text-muted-foreground">
          숫자와 하이픈(-)만 입력 가능합니다.
        </span>
      </div>

      {/* 예금주 (read-only) */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-foreground">예금주</label>
        <Input
          value={data.fullName}
          disabled
          className="h-12 rounded-xl border-[1.5px] bg-secondary text-[15px] text-muted-foreground"
        />
        <span className="text-xs text-muted-foreground">
          프로필의 이름이 자동으로 적용됩니다.
        </span>
      </div>

      {/* 저장 버튼 */}
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="h-[52px] w-full rounded-xl bg-primary text-base font-semibold text-primary-foreground disabled:opacity-50"
      >
        {saving ? "저장 중..." : "저장"}
      </button>

      {message && (
        <p
          className={
            message.type === "error"
              ? "text-sm text-destructive"
              : "text-sm text-primary"
          }
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
