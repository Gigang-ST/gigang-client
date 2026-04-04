"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "@/lib/supabase/client";
import { type Enums } from "@/lib/supabase/database.types";
import { profileEditSchema, type ProfileEditValues } from "@/lib/validations/member";
import { uploadAvatar } from "@/app/actions/upload-avatar";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Camera, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";

type MemberData = {
  id: string;
  full_name: string;
  gender: "male" | "female";
  birthday: string;
  phone: string;
  email: string | null;
  avatar_url: string | null;
};

export function ProfileEditForm({ member }: { member: MemberData }) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(member.avatar_url ?? "");
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    setValue,
    watch,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProfileEditValues>({
    defaultValues: {
      full_name: member.full_name ?? "",
      gender: member.gender,
      birthday: member.birthday ?? "",
      email: member.email ?? "",
    },
    resolver: zodResolver(profileEditSchema),
  });

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setMessage({ type: "error", text: "이미지는 10MB 이하만 가능합니다." });
      return;
    }

    setUploading(true);
    setMessage(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("memberId", member.id);

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
        setAvatarUrl(result.url);
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

  async function onSubmit(data: ProfileEditValues) {
    setMessage(null);

    const supabase = createClient();
    const { error } = await supabase
      .from("member")
      .update({
        full_name: data.full_name.trim(),
        ...(data.gender && { gender: data.gender }),
        birthday: data.birthday || undefined,
        email: data.email.trim() || null,
      })
      .eq("id", member.id);

    if (error) {
      setMessage({ type: "error", text: "저장에 실패했습니다." });
    } else {
      setMessage({ type: "success", text: "저장 완료" });
      router.refresh();
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6 px-6 pb-6 pt-4">
      {/* 프로필 사진 */}
      <div className="flex flex-col items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="group relative size-24 overflow-hidden rounded-full p-0"
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
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
            {...register("full_name")}
            placeholder="홍길동"
            className="h-12 rounded-xl border-[1.5px] text-[15px]"
          />
          {errors.full_name && <p className="text-xs text-destructive">{errors.full_name.message}</p>}
        </div>
        <div className="flex w-[120px] shrink-0 flex-col gap-2">
          <label className="text-sm font-medium text-foreground">성별</label>
          <Select
            value={watch("gender")}
            onValueChange={(v) => setValue("gender", v as "male" | "female")}
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
          {...register("birthday")}
          className="h-12 rounded-xl border-[1.5px] text-[15px]"
        />
      </div>

      {/* 연락처 (read-only) */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-foreground">연락처</label>
        <Input
          value={member.phone}
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
          {...register("email")}
          placeholder="example@email.com"
          className="h-12 rounded-xl border-[1.5px] text-[15px]"
        />
        {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
      </div>

      {/* 저장 버튼 */}
      <Button
        type="submit"
        disabled={isSubmitting}
        className="h-[52px] w-full rounded-xl text-base font-semibold"
      >
        {isSubmitting ? "저장 중..." : "저장"}
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
    </form>
  );
}
