"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Camera } from "lucide-react";
import {
  profileEditSchema,
  type ProfileEditValues,
} from "@/lib/validations/member";
import { updateProfile } from "@/app/actions/update-profile";
import { compressAvatarFile } from "@/lib/image/avatar-compress";
import { Avatar } from "@/components/common/avatar";
import { Caption } from "@/components/common/typography";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

type AvatarState =
  | { kind: "current" }
  | { kind: "new"; file: File; previewUrl: string }
  | { kind: "removed" };

export function ProfileEditForm({ member }: { member: MemberData }) {
  const router = useRouter();
  const [avatarState, setAvatarState] = useState<AvatarState>({
    kind: "current",
  });
  const [compressing, setCompressing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    setValue,
    watch,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProfileEditValues>({
    defaultValues: {
      full_name: member.full_name ?? "",
      gender: member.gender,
      birthday: member.birthday ?? "",
      email: member.email ?? "",
    },
    resolver: zodResolver(profileEditSchema),
  });

  // 언마운트/상태 교체 시 미리보기 objectURL 정리
  useEffect(() => {
    return () => {
      if (avatarState.kind === "new") URL.revokeObjectURL(avatarState.previewUrl);
    };
  }, [avatarState]);

  const handlePickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // 같은 파일 재선택 허용
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error("이미지는 10MB 이하만 가능합니다.");
      return;
    }

    setCompressing(true);
    try {
      const processed = await compressAvatarFile(file);
      const previewUrl = URL.createObjectURL(processed);
      setAvatarState((prev) => {
        if (prev.kind === "new") URL.revokeObjectURL(prev.previewUrl);
        return { kind: "new", file: processed, previewUrl };
      });
    } catch {
      toast.error("이미지를 불러오지 못했습니다. 다른 사진으로 시도해 주세요.");
    } finally {
      setCompressing(false);
    }
  };

  const handleRemovePhoto = () => {
    setAvatarState((prev) => {
      if (prev.kind === "new") URL.revokeObjectURL(prev.previewUrl);
      return { kind: "removed" };
    });
  };

  const previewSrc =
    avatarState.kind === "new"
      ? avatarState.previewUrl
      : avatarState.kind === "removed"
        ? null
        : member.avatar_url;

  // 지울 사진이 있는지: 새 사진 선택했거나, 기존 사진이 그대로 있을 때
  const hasRemovablePhoto =
    avatarState.kind === "new" ||
    (avatarState.kind === "current" && !!member.avatar_url);

  async function onSubmit(data: ProfileEditValues) {
    const formData = new FormData();
    formData.append("full_name", data.full_name);
    formData.append("gender", data.gender ?? "");
    formData.append("birthday", data.birthday ?? "");
    formData.append("email", data.email ?? "");
    if (avatarState.kind === "new") formData.append("file", avatarState.file);
    if (avatarState.kind === "removed") formData.append("removeAvatar", "true");

    try {
      const result = await Promise.race([
        updateProfile(formData),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 20_000),
        ),
      ]);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("저장했어요");
      router.back();
    } catch {
      toast.error("저장 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    }
  }

  const saveDisabled =
    isSubmitting || compressing || (!isDirty && avatarState.kind === "current");

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-6 px-6 pb-6 pt-4"
    >
      {/* 프로필 사진 */}
      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={compressing}
          className="relative size-24 overflow-hidden rounded-full"
        >
          <Avatar src={previewSrc} seed={member.id} size="2xl" alt="프로필" />
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/10 transition-colors hover:bg-black/30">
            <Camera className="size-6 text-white" />
          </span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          onChange={handlePickFile}
          className="hidden"
        />
        <div className="flex items-center gap-3">
          <Caption>{compressing ? "사진 준비 중..." : "사진을 탭하여 변경"}</Caption>
          {hasRemovablePhoto && !compressing && (
            <button
              type="button"
              onClick={handleRemovePhoto}
              className="text-xs text-destructive underline-offset-2 hover:underline"
            >
              기본 이미지로
            </button>
          )}
        </div>
      </div>

      {/* 이름 + 성별 */}
      <div className="flex gap-3">
        <div className="flex flex-1 flex-col gap-2">
          <Label>이름</Label>
          <Input
            {...register("full_name")}
            placeholder="홍길동"
            className="h-12 rounded-xl border-[1.5px] text-[15px]"
          />
          {errors.full_name && (
            <Caption className="text-destructive">
              {errors.full_name.message}
            </Caption>
          )}
        </div>
        <div className="flex w-[120px] shrink-0 flex-col gap-2">
          <Label>성별</Label>
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
        <Label>생년월일</Label>
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
        <Label>연락처</Label>
        <Input
          value={member.phone}
          disabled
          className="h-12 rounded-xl border-[1.5px] bg-secondary text-[15px] text-muted-foreground"
        />
        <Caption>연락처는 변경할 수 없습니다.</Caption>
      </div>

      {/* 이메일 */}
      <div className="flex flex-col gap-2">
        <Label>이메일 (선택)</Label>
        <Input
          type="email"
          {...register("email")}
          placeholder="example@email.com"
          className="h-12 rounded-xl border-[1.5px] text-[15px]"
        />
        {errors.email && (
          <Caption className="text-destructive">{errors.email.message}</Caption>
        )}
      </div>

      {/* 저장 버튼 */}
      <Button
        type="submit"
        disabled={saveDisabled}
        className="h-[52px] w-full rounded-xl text-base font-semibold"
      >
        {isSubmitting ? "저장 중..." : "저장"}
      </Button>
    </form>
  );
}
