"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Camera } from "lucide-react";
import {
  AVG_PACE_CODES,
  JOIN_PURP_CODES,
  JOIN_PURP_SHORT_LABELS,
  PACE_LABELS,
  profileEditSchema,
  type ProfileEditValues,
  type RunningProfileEditValues,
} from "@/lib/validations/member";
import { updateProfile } from "@/app/actions/update-profile";
import { updateNearStation } from "@/app/actions/profile/update-near-station";
import { updateRunningProfile } from "@/app/actions/profile/update-running-profile";
import { compressAvatarFile } from "@/lib/image/avatar-compress";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/common/avatar";
import { Caption } from "@/components/common/typography";
import { StationCombobox } from "@/components/auth/station-combobox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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

/** Radix Select는 빈 문자열 value를 허용하지 않아 "선택 안 함"에 센티넬을 쓴다 */
const NONE = "__none__";

/** 목적 자유 입력 최대 길이 — runningProfileEditSchema와 동일 */
const PURP_TXT_MAX = 500;

export type InitialRunningProfile = {
  nearStnNm: string | null;
  avgRunDistKm: number | null;
  avgPaceCd: string | null;
  joinPurpCds: string[];
  joinPurpTxt: string | null;
};

export function ProfileEditForm({
  member,
  initialRunningProfile,
}: {
  member: MemberData;
  initialRunningProfile: InitialRunningProfile;
}) {
  const router = useRouter();
  const [avatarState, setAvatarState] = useState<AvatarState>({
    kind: "current",
  });
  // 러닝 프로필은 mem_onbd_prf 위성 테이블 소관이라 RHF 폼과 별도 액션으로 저장한다.
  const [nearStnNm, setNearStnNm] = useState<string | null>(
    initialRunningProfile.nearStnNm,
  );
  const [avgPaceCd, setAvgPaceCd] = useState<string | null>(
    initialRunningProfile.avgPaceCd,
  );
  // 입력 중간 상태(빈 문자열)를 허용해야 해서 문자열로 들고 저장 시 숫자로 바꾼다.
  const [avgRunDistKm, setAvgRunDistKm] = useState(
    initialRunningProfile.avgRunDistKm?.toString() ?? "",
  );
  const [joinPurpCds, setJoinPurpCds] = useState<string[]>(
    initialRunningProfile.joinPurpCds,
  );
  const [joinPurpTxt, setJoinPurpTxt] = useState(
    initialRunningProfile.joinPurpTxt ?? "",
  );
  const [compressing, setCompressing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
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

  const stationDirty = nearStnNm !== initialRunningProfile.nearStnNm;

  // 거리는 문자열 입력이라 저장 전에 검증한다 — 빈 값은 "미입력"(null)으로 허용.
  const distTrimmed = avgRunDistKm.trim();
  const distNum = distTrimmed === "" ? null : Number(distTrimmed);
  const distError =
    distNum != null && (!Number.isFinite(distNum) || distNum < 1 || distNum > 100)
      ? "1~100 사이 숫자를 입력해 주세요."
      : null;

  const sameStrArray = (a: string[], b: string[]) =>
    a.length === b.length && a.every((v, i) => v === b[i]);

  const runningDirty =
    avgPaceCd !== initialRunningProfile.avgPaceCd ||
    distNum !== initialRunningProfile.avgRunDistKm ||
    !sameStrArray(joinPurpCds, initialRunningProfile.joinPurpCds) ||
    joinPurpTxt.trim() !== (initialRunningProfile.joinPurpTxt ?? "").trim();

  // 저장 버튼은 하나 — 수정된 섹션만 골라서 해당 액션을 호출한다.
  async function onSubmit(data: ProfileEditValues) {
    if (distError) {
      toast.error(distError);
      return;
    }
    const memberDirty = isDirty || avatarState.kind !== "current";

    // 통합 저장 버튼이라 어느 한 액션이 멈추면 버튼 전체가 잠긴다 — 둘 다 타임아웃 필수
    const withTimeout = <T,>(p: Promise<T>) =>
      Promise.race([
        p,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 20_000),
        ),
      ]);

    try {
      const tasks: Promise<{ ok: boolean; message?: string }>[] = [];

      if (memberDirty) {
        const formData = new FormData();
        formData.append("full_name", data.full_name);
        // 성별·생년월일은 편집 불가 — 폼 값 대신 서버가 준 원본을 그대로 되돌려보낸다.
        formData.append("gender", member.gender ?? "");
        formData.append("birthday", member.birthday ?? "");
        formData.append("email", data.email ?? "");
        if (avatarState.kind === "new") formData.append("file", avatarState.file);
        if (avatarState.kind === "removed") formData.append("removeAvatar", "true");

        tasks.push(withTimeout(updateProfile(formData)));
      }

      if (stationDirty) {
        tasks.push(withTimeout(updateNearStation({ nearStnNm })));
      }

      if (runningDirty) {
        tasks.push(
          withTimeout(
            updateRunningProfile({
              avgPaceCd: avgPaceCd as RunningProfileEditValues["avgPaceCd"],
              avgRunDistKm: distNum,
              joinPurpCds:
                joinPurpCds as RunningProfileEditValues["joinPurpCds"],
              joinPurpTxt: joinPurpTxt.trim() || null,
            }),
          ),
        );
      }

      const results = await Promise.all(tasks);
      const failed = results.find((r) => !r.ok);
      if (failed) {
        toast.error(failed.message ?? "저장에 실패했습니다.");
        return;
      }
      toast.success("저장했어요");
      router.back();
    } catch {
      toast.error("저장 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    }
  }

  const saveDisabled =
    isSubmitting ||
    compressing ||
    distError != null ||
    (!isDirty &&
      avatarState.kind === "current" &&
      !stationDirty &&
      !runningDirty);

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

      {/* 이름 */}
      <div className="flex flex-col gap-2">
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

      {/* 변경 불가 항목 — 입력창 대신 한 줄짜리 정보 행으로 압축한다 */}
      <div className="flex flex-col gap-1 rounded-xl bg-secondary/60 px-3.5 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <Caption>성별</Caption>
          <Caption className="text-foreground">
            {member.gender === "male" ? "남성" : "여성"}
          </Caption>
        </div>
        <div className="flex items-center justify-between gap-2">
          <Caption>생년월일</Caption>
          <Caption className="text-foreground tabular-nums">
            {member.birthday ?? "-"}
          </Caption>
        </div>
        <div className="flex items-center justify-between gap-2">
          <Caption>연락처</Caption>
          <Caption className="text-foreground tabular-nums">
            {member.phone}
          </Caption>
        </div>
        <Caption className="mt-0.5 text-[11px]">
          변경이 필요하면 운영진에게 문의해 주세요.
        </Caption>
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

      {/* ── 러닝 프로필 — 프로필 카드 "소개"에 그대로 나가는 값들 ───────────── */}
      <div className="flex flex-col gap-4 rounded-2xl border-[1.5px] border-border p-4">
        <div className="flex flex-col gap-0.5">
          <Label className="text-[15px] font-semibold">러닝 프로필</Label>
          <Caption>내 프로필 카드의 &lsquo;소개&rsquo;에 보여요.</Caption>
        </div>

        {/* 가까운 역 — 콤보박스 트리거는 type="button", 팝오버는 포털이라 폼 안에서 안전 */}
        <div className="flex flex-col gap-2">
          <Label>가까운 역 (선택)</Label>
          <StationCombobox value={nearStnNm} onChange={setNearStnNm} />
        </div>

        <div className="flex gap-3">
          <div className="flex flex-1 flex-col gap-2">
            <Label>평균 페이스 (선택)</Label>
            <Select
              value={avgPaceCd ?? NONE}
              onValueChange={(v) => setAvgPaceCd(v === NONE ? null : v)}
            >
              <SelectTrigger className="h-12 rounded-xl border-[1.5px] text-[15px]">
                <SelectValue placeholder="선택" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>선택 안 함</SelectItem>
                {AVG_PACE_CODES.map((cd) => (
                  <SelectItem key={cd} value={cd}>
                    {PACE_LABELS[cd]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex w-[130px] shrink-0 flex-col gap-2">
            <Label>평균 거리 (선택)</Label>
            <div className="relative">
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={100}
                value={avgRunDistKm}
                onChange={(e) => setAvgRunDistKm(e.target.value)}
                placeholder="7"
                className="h-12 rounded-xl border-[1.5px] pr-10 text-[15px]"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground">
                km
              </span>
            </div>
          </div>
        </div>
        {distError && <Caption className="text-destructive">{distError}</Caption>}

        <div className="flex flex-col gap-2">
          <Label>목적 (선택)</Label>
          <div className="flex flex-wrap gap-1.5">
            {JOIN_PURP_CODES.map((cd) => {
              const selected = joinPurpCds.includes(cd);
              return (
                <button
                  key={cd}
                  type="button"
                  onClick={() =>
                    setJoinPurpCds((prev) =>
                      selected ? prev.filter((c) => c !== cd) : [...prev, cd],
                    )
                  }
                  aria-pressed={selected}
                  className={cn(
                    "rounded-full border-[1.5px] px-3 py-1.5 text-[13px] font-medium transition-colors",
                    selected
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted/50",
                  )}
                >
                  {JOIN_PURP_SHORT_LABELS[cd]}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label>더 하고 싶은 말 (선택)</Label>
          <Textarea
            value={joinPurpTxt}
            onChange={(e) => setJoinPurpTxt(e.target.value)}
            maxLength={PURP_TXT_MAX}
            placeholder="올해는 꼭 서브4 찍고 싶어요"
            className="rounded-xl border-[1.5px] text-[15px]"
          />
          <div className="flex items-center justify-end gap-2">
            <Caption>
              {joinPurpTxt.length}/{PURP_TXT_MAX}
            </Caption>
          </div>
        </div>
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
    </div>
  );
}
