"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { type Enums } from "@/lib/supabase/database.types";
import { validateUUID } from "@/lib/utils";
import { uploadAvatar } from "@/app/actions/upload-avatar";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Camera, UserRound } from "lucide-react";
<<<<<<< feature/avatar-fallback
import { Button } from "@/components/ui/button";
=======
>>>>>>> dev

type ProfileData = {
  id: string;
  full_name: string;
  gender: Enums<"gender">;
  birthday: string;
  phone: string;
  email: string;
  avatar_url: string;
};

const isGender = (v: string): v is Enums<"gender"> =>
  v === "male" || v === "female";

export default function ProfileEditPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);


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
        .select("id, full_name, gender, birthday, phone, email, avatar_url")
        .or(`kakao_user_id.eq.${user.id},google_user_id.eq.${user.id}`)
        .maybeSingle();

      if (!member) {
        router.push("/onboarding");
        return;
      }

      setProfile({
        id: member.id,
        full_name: member.full_name ?? "",
        gender: member.gender,
        birthday: member.birthday ?? "",
        phone: member.phone ?? "",
        email: member.email ?? "",
        avatar_url: member.avatar_url ?? "",
      });
      setLoading(false);
    }

    load();
  }, [router]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    if (file.size > 10 * 1024 * 1024) {
      setMessage({ type: "error", text: "이미지는 10MB 이하만 가능합니다." });
      return;
    }

    setUploading(true);
    setMessage(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("memberId", profile.id);

    try {
      const result = await Promise.race([
        uploadAvatar(formData),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 15_000),
        ),
      ]);

      if (result.error) {
        setMessage({ type: "error", text: result.error });
      } else if (result.url) {
        setProfile({ ...profile, avatar_url: result.url });
        setMessage({ type: "success", text: "프로필 사진이 변경되었습니다." });
      }
    } catch {
      setMessage({
        type: "error",
        text: "업로드 시간이 초과되었습니다. 다른 형식(JPG, PNG)이나 다른 사진으로 다시 시도해 주세요.",
      });
    }
    setUploading(false);
  };

  const handleSave = async () => {
    if (!profile) return;
    if (!profile.full_name.trim()) {
      setMessage({ type: "error", text: "이름을 입력해 주세요." });
      return;
    }
    if (!profile.birthday) {
      setMessage({ type: "error", text: "생년월일을 입력해 주세요." });
      return;
    }
    setSaving(true);
    setMessage(null);

    const supabase = createClient();
    const { error } = await supabase
      .from("member")
      .update({
        full_name: profile.full_name.trim(),
        gender: profile.gender,
        birthday: profile.birthday,
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
      {/* 프로필 사진 */}
      <div className="flex flex-col items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="group relative size-24 overflow-hidden rounded-full p-0"
        >
          {profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt="프로필"
              className="size-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="flex size-full items-center justify-center bg-muted">
              <UserRound className="size-10 text-foreground/50" />
            </div>
          )}
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/10 transition-opacity group-hover:bg-black/30">
            <Camera className="size-6 text-white" />
          </div>
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          onChange={handleAvatarUpload}
          className="hidden"
        />
        <span className="text-xs text-muted-foreground">
          {uploading ? "업로드 중..." : "사진을 탭하여 변경"}
        </span>
      </div>

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
            onValueChange={(v) => {
              if (isGender(v)) setProfile({ ...profile, gender: v });
            }}
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
          min="1986-01-01"
          max="2008-12-31"
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
      <Button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="h-[52px] w-full rounded-xl text-base font-semibold"
      >
        {saving ? "저장 중..." : "저장"}
      </Button>

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
