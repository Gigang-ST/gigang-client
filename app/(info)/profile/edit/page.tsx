"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { validateUUID } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

type ProfileData = {
  id: string;
  full_name: string;
  gender: "male" | "female" | "";
  birthday: string;
  phone: string;
  email: string;
};

export default function ProfileEditPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);

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

      validateUUID(user.id);
      const { data: member } = await supabase
        .from("member")
        .select("id, full_name, gender, birthday, phone, email")
        .or(`kakao_user_id.eq.${user.id},google_user_id.eq.${user.id}`)
        .maybeSingle();

      if (!member) {
        router.push("/onboarding");
        return;
      }

      setProfile({
        id: member.id,
        full_name: member.full_name ?? "",
        gender: member.gender ?? "",
        birthday: member.birthday ?? "",
        phone: member.phone ?? "",
        email: member.email ?? "",
      });
      setLoading(false);
    }

    load();
  }, [router]);

  const handleSave = async () => {
    if (!profile) return;
    if (!profile.full_name.trim()) {
      setMessage({ type: "error", text: "이름을 입력해 주세요." });
      return;
    }
    setSaving(true);
    setMessage(null);

    const supabase = createClient();
    const { error } = await supabase
      .from("member")
      .update({
        full_name: profile.full_name.trim(),
        gender: profile.gender || null,
        birthday: profile.birthday || null,
        email: profile.email.trim() || null,
      })
      .eq("id", profile.id);

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
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-4 w-16 rounded" />
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
        ))}
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="flex flex-col gap-6 px-6 pb-6 pt-4">
      {/* 이름 + 성별 */}
      <div className="flex gap-3">
        <div className="flex flex-1 flex-col gap-2">
          <label className="text-sm font-medium text-foreground">이름</label>
          <Input
            value={profile.full_name}
            onChange={(e) =>
              setProfile({ ...profile, full_name: e.target.value })
            }
            placeholder="홍길동"
            className="h-12 rounded-xl border-[1.5px] text-[15px]"
          />
        </div>
        <div className="flex w-[120px] shrink-0 flex-col gap-2">
          <label className="text-sm font-medium text-foreground">성별</label>
          <Select
            value={profile.gender}
            onValueChange={(v) =>
              setProfile({
                ...profile,
                gender: v as "male" | "female",
              })
            }
          >
            <SelectTrigger className="h-12 rounded-xl border-[1.5px] text-[15px]">
              <SelectValue placeholder="선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="male">남성</SelectItem>
              <SelectItem value="female">여성</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 생년월일 */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-foreground">생년월일</label>
        <Input
          type="date"
          max="9999-12-31"
          value={profile.birthday}
          onChange={(e) =>
            setProfile({ ...profile, birthday: e.target.value })
          }
          className="h-12 rounded-xl border-[1.5px] text-[15px]"
        />
      </div>

      {/* 연락처 (read-only) */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-foreground">연락처</label>
        <Input
          value={profile.phone}
          disabled
          className="h-12 rounded-xl border-[1.5px] bg-secondary text-[15px] text-muted-foreground"
        />
        <span className="text-xs text-muted-foreground">
          연락처는 변경할 수 없습니다.
        </span>
      </div>

      {/* 이메일 */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-foreground">
          이메일 (선택)
        </label>
        <Input
          type="email"
          value={profile.email}
          onChange={(e) => setProfile({ ...profile, email: e.target.value })}
          placeholder="example@email.com"
          className="h-12 rounded-xl border-[1.5px] text-[15px]"
        />
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
