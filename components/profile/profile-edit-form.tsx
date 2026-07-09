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
  AVG_PACE_CODES,
  JOIN_PURP_CODES,
  PACE_LABELS,
  JOIN_PURP_LABELS,
} from "@/lib/validations/member";
import { updateProfile } from "@/app/actions/update-profile";
import { updateRunningProfile } from "@/app/actions/profile/update-running-profile";
import type { OnbdProfile } from "@/lib/queries/onboarding-profile";
import { compressAvatarFile } from "@/lib/image/avatar-compress";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/common/avatar";
import { Caption } from "@/components/common/typography";
import { StationCombobox } from "@/components/auth/station-combobox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
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

export function ProfileEditForm({
  member,
  runningProfile,
}: {
  member: MemberData;
  runningProfile: OnbdProfile | null;
}) {
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
    <div className="flex flex-col gap-6 px-6 pb-6 pt-4">
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
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

      <Separator />

      {/* 러닝 프로필 — 기존 프로필 <form> 바깥의 형제로 둔다(독립 저장 updateRunningProfile).
          form 안에 있으면 이 섹션 입력에서 Enter 시 상위 폼이 제출돼 페이지를 벗어나며
          미저장 변경이 유실되기 때문. 밖으로 빼 그 문제를 구조적으로 제거한다. */}
      <RunningProfileSection initial={runningProfile} />
    </div>
  );
}

/** "러닝 프로필" 섹션 — 역·거리·페이스·가입 목적. 프로필 편집 폼과 독립적으로 저장한다(설계 §6.3). */
function RunningProfileSection({
  initial,
}: {
  initial: OnbdProfile | null;
}) {
  const [nearStnNm, setNearStnNm] = useState<string | null>(
    initial?.nearStnNm ?? null,
  );
  const [avgRunDistKmInput, setAvgRunDistKmInput] = useState(
    initial?.avgRunDistKm != null ? String(initial.avgRunDistKm) : "",
  );
  const [avgPaceCd, setAvgPaceCd] = useState<
    (typeof AVG_PACE_CODES)[number] | ""
  >((initial?.avgPaceCd as (typeof AVG_PACE_CODES)[number] | null) ?? "");
  const [joinPurpCds, setJoinPurpCds] = useState<
    (typeof JOIN_PURP_CODES)[number][]
  >((initial?.joinPurpCds ?? []) as (typeof JOIN_PURP_CODES)[number][]);
  const [joinPurpTxt, setJoinPurpTxt] = useState(initial?.joinPurpTxt ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const distTrimmed = avgRunDistKmInput.trim();
    const parsedDist = distTrimmed ? Number(distTrimmed) : null;
    // 거리는 선택 필드 — 범위(1~100km) 밖이면 null로 떨어뜨려 저장이 막히지 않게 한다.
    const validDist =
      parsedDist !== null && Number.isFinite(parsedDist) && parsedDist >= 1 && parsedDist <= 100
        ? parsedDist
        : null;

    setSaving(true);
    try {
      const result = await updateRunningProfile({
        nearStnNm,
        avgRunDistKm: validDist,
        avgPaceCd: avgPaceCd || null,
        joinPurpCds,
        joinPurpTxt: joinPurpTxt.trim() || null,
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("러닝 프로필을 저장했어요");
    } catch {
      toast.error("저장 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Label className="text-base font-semibold">러닝 프로필</Label>
        <Caption className="mt-1 block">
          전부 선택 입력이에요. 코스·모임 안내에 참고할게요.
        </Caption>
      </div>

      <div className="flex flex-col gap-2">
        <Label>가까운 역 (선택)</Label>
        <StationCombobox value={nearStnNm} onChange={setNearStnNm} />
      </div>

      <div className="flex flex-col gap-2">
        <Label>평균 러닝 거리 (선택)</Label>
        <div className="relative">
          <Input
            type="text"
            inputMode="decimal"
            placeholder="예: 5 (1~100km)"
            value={avgRunDistKmInput}
            onChange={(e) => {
              const next = e.target.value;
              if (!/^\d*\.?\d*$/.test(next)) return;
              setAvgRunDistKmInput(next);
            }}
            className="h-12 rounded-xl border-[1.5px] pr-10 text-[15px]"
          />
          <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            km
          </span>
        </div>
        {(() => {
          const d = Number(avgRunDistKmInput.trim());
          const invalid =
            avgRunDistKmInput.trim() !== "" &&
            (!Number.isFinite(d) || d < 1 || d > 100);
          return invalid ? (
            <Caption className="text-destructive">
              1~100km 사이로 입력해 주세요.
            </Caption>
          ) : null;
        })()}
      </div>

      <div className="flex flex-col gap-2">
        <Label>평균 페이스 (선택)</Label>
        <Select
          value={avgPaceCd}
          onValueChange={(v) =>
            setAvgPaceCd(v as (typeof AVG_PACE_CODES)[number])
          }
        >
          <SelectTrigger className="h-12 rounded-xl border-[1.5px] text-[15px]">
            <SelectValue placeholder="페이스 선택" />
          </SelectTrigger>
          <SelectContent>
            {AVG_PACE_CODES.map((code) => (
              <SelectItem key={code} value={code}>
                {PACE_LABELS[code]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label>기강에서 뭘 하고 싶으세요? (선택)</Label>
        <div className="flex flex-wrap gap-2">
          {JOIN_PURP_CODES.map((code) => {
            const selected = joinPurpCds.includes(code);
            return (
              <button
                key={code}
                type="button"
                onClick={() =>
                  setJoinPurpCds((prev) =>
                    selected
                      ? prev.filter((c) => c !== code)
                      : [...prev, code],
                  )
                }
                className={cn(
                  "rounded-full border-[1.5px] px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
                  selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-foreground hover:bg-secondary",
                )}
              >
                {JOIN_PURP_LABELS[code]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>더 하고 싶은 말이 있다면 (선택)</Label>
        <Textarea
          placeholder="자유롭게 남겨주세요"
          value={joinPurpTxt}
          onChange={(e) => setJoinPurpTxt(e.target.value)}
          className="rounded-xl border-[1.5px] text-[15px]"
        />
      </div>

      <Button
        type="button"
        variant="secondary"
        disabled={saving}
        onClick={handleSave}
        className="h-[52px] w-full rounded-xl text-base font-semibold"
      >
        {saving ? "저장 중..." : "러닝 프로필 저장"}
      </Button>
    </div>
  );
}
