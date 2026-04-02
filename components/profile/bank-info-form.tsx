"use client";

import { useState } from "react";
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
import { BANK_OPTIONS } from "@/lib/constants";

type BankInfoFormProps = {
  member: {
    id: string;
    fullName: string;
    bankName: string;
    bankNameCustom: string;
    bankAccount: string;
  };
};

type BankData = {
  memberId: string;
  fullName: string;
  bankName: string;
  bankNameCustom: string;
  bankAccount: string;
};

export function BankInfoForm({ member }: BankInfoFormProps) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [data, setData] = useState<BankData>({
    memberId: member.id,
    fullName: member.fullName,
    bankName: member.bankName,
    bankNameCustom: member.bankNameCustom,
    bankAccount: member.bankAccount,
  });

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    const supabase = createClient();
    const resolvedBankName =
      data.bankName === "custom"
        ? data.bankNameCustom.trim()
        : data.bankName.trim();
    const { error } = await supabase
      .from("member")
      .update({
        bank_name: resolvedBankName || null,
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
            <SelectItem value="custom">기타(직접 입력)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {data.bankName === "custom" && (
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground">
            은행명 직접 입력
          </label>
          <Input
            value={data.bankNameCustom}
            onChange={(e) =>
              setData({ ...data, bankNameCustom: e.target.value })
            }
            placeholder="예: 지역 농협, 단위 농협"
            className="h-12 rounded-xl border-[1.5px] text-[15px]"
          />
        </div>
      )}

      {/* 계좌번호 */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-foreground">계좌번호</label>
        <Input
          value={data.bankAccount}
          onChange={(e) => {
            const sanitized = e.target.value.replace(/[^0-9-]/g, "");
            setData({ ...data, bankAccount: sanitized });
          }}
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
