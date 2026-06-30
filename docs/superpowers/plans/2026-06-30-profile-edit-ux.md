# 프로필 수정 UX 재설계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 프로필 수정을 "저장 시 일괄 커밋" 모델로 통일하고, 사진 삭제·명확한 저장 피드백·디자인 시스템 정합을 추가한다.

**Architecture:** 사진을 저장 전엔 로컬 미리보기(objectURL)로만 다루고, 저장 시 단일 서버 액션 `updateProfile`이 (압축 사진 업로드 | 삭제 | 변경없음) + 프로필 필드를 하나의 `mem_mst` update로 커밋한다. JPG/PNG/WebP는 클라이언트에서 256px webp로 선압축, HEIC·안전망은 서버 처리.

**Tech Stack:** Next.js App Router, React 19, React Hook Form + Zod, Supabase Storage, sharp/heic-convert(서버), canvas(클라), sonner(토스트), vitest(node).

## Global Constraints

- 패키지 매니저: `pnpm`. 명령은 `pnpm run lint`, `pnpm run build`, `pnpm test`.
- 날짜: `@/lib/dayjs`만 사용 (이 작업엔 날짜 포맷 없음).
- 환경변수: `process.env` 직접 접근 금지 (이 작업엔 해당 없음).
- 디자인 시스템: typography 컴포넌트·`Avatar`·`Label` 사용, 매직넘버 금지 (DESIGN.md).
- 아바타 최종 스펙: 512×512 webp, sharp quality 80 / 클라 quality 0.85. (작은 표시엔 충분, 미래의 큰 "프로필 보기"까지 대비. 레티나 DPR3 기준 ~170px 표시까지 선명.)
- 허용 이미지 타입: `image/jpeg`, `image/png`, `image/webp`, `image/heic`, `image/heif`. 최대 10MB.
- **커밋 규칙:** 이 저장소는 "커밋은 사용자 명시 요청 시에만" 정책이다. 각 Task의 커밋 스텝은 **사용자 승인 후** 실행한다 (자동 커밋 금지). 승인 전까지는 변경만 쌓아두고 검증으로 대체한다.

---

### Task 1: Avatar 컴포넌트에 2xl(96px) 사이즈 추가

편집 미리보기는 96px인데 현재 `Avatar`는 최대 64px(`xl`)뿐이라 `2xl`을 추가한다.

**Files:**
- Modify: `components/common/avatar.tsx`

**Interfaces:**
- Produces: `AvatarSize`에 `"2xl"` 추가 (96px, `size-24`). Task 5가 `<Avatar size="2xl">` 사용.

- [ ] **Step 1: SIZE_MAP·SIZE_PX·ICON_SIZE_MAP에 2xl 추가**

`components/common/avatar.tsx`의 세 상수를 수정:

```tsx
const SIZE_MAP = {
  sm: "size-8",
  md: "size-10",
  lg: "size-14",
  xl: "size-16",
  "2xl": "size-24",
} as const;

const SIZE_PX: Record<AvatarSize, number> = {
  sm: 32,
  md: 40,
  lg: 56,
  xl: 64,
  "2xl": 96,
};

const ICON_SIZE_MAP = {
  sm: "size-4",
  md: "size-5",
  lg: "size-7",
  xl: "size-8",
  "2xl": "size-12",
} as const;
```

- [ ] **Step 2: 타입체크 통과 확인**

Run: `pnpm exec tsc --noEmit`
Expected: 에러 없음 (AvatarSize가 SIZE_MAP에서 파생되므로 세 맵이 일치하면 통과).

- [ ] **Step 3: 커밋 (사용자 승인 후)**

```bash
git add components/common/avatar.tsx
git commit -m "feat(avatar): 2xl(96px) 사이즈 추가"
```

---

### Task 2: 클라이언트 압축 순수 헬퍼 + 테스트 (TDD)

canvas 압축에 쓰일 순수 로직(압축 대상 판정, cover 크롭 계산)을 먼저 TDD로 만든다.

**Files:**
- Create: `lib/image/avatar-compress.ts`
- Test: `lib/__tests__/avatar-compress.test.ts`

**Interfaces:**
- Produces:
  - `AVATAR_TARGET_PX = 256`
  - `CLIENT_COMPRESSIBLE_TYPES: readonly string[]`
  - `shouldCompressInBrowser(type: string): boolean`
  - `computeCoverCrop(width: number, height: number): { sx: number; sy: number; side: number }`

- [ ] **Step 1: 실패하는 테스트 작성**

`lib/__tests__/avatar-compress.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  shouldCompressInBrowser,
  computeCoverCrop,
  AVATAR_TARGET_PX,
} from "@/lib/image/avatar-compress";

describe("shouldCompressInBrowser", () => {
  it("JPG·PNG·WebP는 true", () => {
    expect(shouldCompressInBrowser("image/jpeg")).toBe(true);
    expect(shouldCompressInBrowser("image/png")).toBe(true);
    expect(shouldCompressInBrowser("image/webp")).toBe(true);
  });
  it("HEIC·HEIF는 false (서버 변환)", () => {
    expect(shouldCompressInBrowser("image/heic")).toBe(false);
    expect(shouldCompressInBrowser("image/heif")).toBe(false);
  });
  it("알 수 없는 타입은 false", () => {
    expect(shouldCompressInBrowser("")).toBe(false);
    expect(shouldCompressInBrowser("image/gif")).toBe(false);
  });
});

describe("computeCoverCrop", () => {
  it("정사각형은 전체 사용", () => {
    expect(computeCoverCrop(100, 100)).toEqual({ sx: 0, sy: 0, side: 100 });
  });
  it("가로가 길면 좌우를 잘라 가운데 정사각형", () => {
    expect(computeCoverCrop(200, 100)).toEqual({ sx: 50, sy: 0, side: 100 });
  });
  it("세로가 길면 위아래를 잘라 가운데 정사각형", () => {
    expect(computeCoverCrop(100, 200)).toEqual({ sx: 0, sy: 50, side: 100 });
  });
  it("홀수 차이는 내림", () => {
    expect(computeCoverCrop(101, 100)).toEqual({ sx: 0, sy: 0, side: 100 });
  });
});

describe("AVATAR_TARGET_PX", () => {
  it("512", () => expect(AVATAR_TARGET_PX).toBe(512));
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm test -- avatar-compress`
Expected: FAIL — `lib/image/avatar-compress` 모듈을 찾지 못함.

- [ ] **Step 3: 순수 헬퍼 구현**

`lib/image/avatar-compress.ts` (이 Step에선 순수 함수만):

```ts
/** 아바타 최종 한 변 길이(px). 서버 sharp와 동일. 큰 프로필 보기까지 대비. */
export const AVATAR_TARGET_PX = 512;

/** 브라우저 canvas로 선압축 가능한 타입. HEIC/HEIF는 제외(서버 변환). */
export const CLIENT_COMPRESSIBLE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/** 브라우저에서 압축할 수 있는 이미지 타입인지. */
export function shouldCompressInBrowser(type: string): boolean {
  return (CLIENT_COMPRESSIBLE_TYPES as readonly string[]).includes(type);
}

/** cover(가운데 정사각형 크롭) 영역 계산. side = 짧은 변, 나머지는 가운데 정렬. */
export function computeCoverCrop(
  width: number,
  height: number,
): { sx: number; sy: number; side: number } {
  const side = Math.min(width, height);
  const sx = Math.floor((width - side) / 2);
  const sy = Math.floor((height - side) / 2);
  return { sx, sy, side };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm test -- avatar-compress`
Expected: PASS (모든 케이스).

- [ ] **Step 5: 커밋 (사용자 승인 후)**

```bash
git add lib/image/avatar-compress.ts lib/__tests__/avatar-compress.test.ts
git commit -m "feat(profile): 아바타 클라 압축 순수 헬퍼 + 테스트"
```

---

### Task 3: 클라이언트 압축 함수 (canvas)

순수 헬퍼를 이용해 실제 File을 압축하는 DOM 의존 함수를 추가한다. node 테스트 불가 → build/수동 검증.

**Files:**
- Modify: `lib/image/avatar-compress.ts`

**Interfaces:**
- Consumes: `shouldCompressInBrowser`, `computeCoverCrop`, `AVATAR_TARGET_PX` (Task 2)
- Produces: `compressAvatarFile(file: File): Promise<File>` — 압축 가능 타입이면 256px webp File 반환, 아니면(HEIC 등) 원본 그대로. 실패 시 원본 폴백.

- [ ] **Step 1: compressAvatarFile 구현 추가**

`lib/image/avatar-compress.ts` 하단에 추가:

```ts
/**
 * 아바타용 이미지를 브라우저에서 256px webp로 선압축한다.
 * - JPG/PNG/WebP: canvas로 가운데 정사각형 크롭 → 256px webp(q0.85)
 * - HEIC/HEIF 등: 압축하지 않고 원본 그대로 반환(서버가 변환)
 * - 처리 실패 시 원본 반환(안전)
 */
export async function compressAvatarFile(file: File): Promise<File> {
  if (!shouldCompressInBrowser(file.type)) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const { sx, sy, side } = computeCoverCrop(bitmap.width, bitmap.height);

    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_TARGET_PX;
    canvas.height = AVATAR_TARGET_PX;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      bitmap,
      sx,
      sy,
      side,
      side,
      0,
      0,
      AVATAR_TARGET_PX,
      AVATAR_TARGET_PX,
    );
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.85),
    );
    if (!blob) return file;

    return new File([blob], "avatar.webp", { type: "image/webp" });
  } catch {
    return file;
  }
}
```

- [ ] **Step 2: 타입체크 + 기존 테스트 통과 확인**

Run: `pnpm exec tsc --noEmit && pnpm test -- avatar-compress`
Expected: 타입 에러 없음, 기존 순수 함수 테스트 PASS (compressAvatarFile은 테스트 대상 아님).

- [ ] **Step 3: 커밋 (사용자 승인 후)**

```bash
git add lib/image/avatar-compress.ts
git commit -m "feat(profile): 아바타 canvas 클라 압축 함수"
```

---

### Task 4: updateProfile 통합 서버 액션

기존 `upload-avatar.ts`(즉시 업로드+커밋)를 대체할, 프로필 필드 + 아바타를 한 번에 커밋하는 단일 액션.

**Files:**
- Create: `app/actions/update-profile.ts`

**Interfaces:**
- Consumes: `withActive` (`@/lib/actions/auth`), `profileEditSchema` (`@/lib/validations/member`)
- Produces: `updateProfile(formData: FormData): Promise<{ ok: true; avatarUrl?: string | null } | { ok: false; message: string }>`
  - FormData 키: `full_name`, `gender`, `birthday`, `email`(문자열); 선택적 `file`(File), `removeAvatar`("true")
  - Task 5가 호출.

- [ ] **Step 1: 서버 액션 작성**

`app/actions/update-profile.ts`:

```ts
"use server";

import { withActive } from "@/lib/actions/auth";
import { profileEditSchema } from "@/lib/validations/member";

const MAX_SIZE = 512;
const QUALITY = 80;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

type Result =
  | { ok: true; avatarUrl?: string | null }
  | { ok: false; message: string };

export async function updateProfile(formData: FormData): Promise<Result> {
  const raw = {
    full_name: String(formData.get("full_name") ?? ""),
    gender: String(formData.get("gender") ?? ""),
    birthday: String(formData.get("birthday") ?? ""),
    email: String(formData.get("email") ?? ""),
  };

  const parsed = profileEditSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.",
    };
  }
  const data = parsed.data;

  const file = formData.get("file") as File | null;
  const hasFile = !!file && file.size > 0;
  const removeAvatar = formData.get("removeAvatar") === "true";

  if (hasFile) {
    if (file.size > MAX_FILE_SIZE)
      return { ok: false, message: "이미지는 10MB 이하만 가능합니다." };
    if (!ALLOWED_TYPES.includes(file.type))
      return { ok: false, message: "JPG, PNG, WebP, HEIC 형식만 가능합니다." };
  }

  return withActive(async ({ member, supabase }) => {
    const bucketUrl = supabase.storage.from("avatars").getPublicUrl("").data
      .publicUrl;
    const currentInBucket =
      member.avatar_url && member.avatar_url.startsWith(bucketUrl)
        ? member.avatar_url.replace(bucketUrl, "")
        : null;

    // undefined = avatar_url 미변경
    let newAvatarUrl: string | null | undefined = undefined;
    let oldPathToRemove: string | null = null;

    if (hasFile) {
      let buffer = Buffer.from(await file.arrayBuffer());

      const isHeic = file.type === "image/heic" || file.type === "image/heif";
      if (isHeic) {
        try {
          // @ts-expect-error -- heic-convert에 타입 선언 없음
          const { default: convert } = await import("heic-convert");
          const converted = await convert({
            buffer,
            format: "JPEG",
            quality: 0.9,
          });
          buffer = Buffer.from(converted);
        } catch (e) {
          console.error("[update-profile] heic-convert error:", e);
          return {
            ok: false,
            message: "HEIC 변환에 실패했습니다. JPG로 변환 후 다시 시도해 주세요.",
          };
        }
      }

      let resized: Buffer;
      try {
        const { default: sharp } = await import("sharp");
        resized = await sharp(buffer)
          .rotate()
          .resize(MAX_SIZE, MAX_SIZE, { fit: "cover" })
          .webp({ quality: QUALITY })
          .toBuffer();
      } catch (e) {
        console.error("[update-profile] sharp error:", e);
        return {
          ok: false,
          message: "이미지 처리에 실패했습니다. JPG 또는 PNG로 변환 후 다시 시도해 주세요.",
        };
      }

      const filePath = `${member.id}/${Date.now()}.webp`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, resized, {
          upsert: true,
          contentType: "image/webp",
        });
      if (uploadError) {
        console.error("[update-profile] storage error:", uploadError);
        return { ok: false, message: `업로드 실패: ${uploadError.message}` };
      }

      newAvatarUrl = supabase.storage.from("avatars").getPublicUrl(filePath)
        .data.publicUrl;
      oldPathToRemove = currentInBucket;
    } else if (removeAvatar) {
      newAvatarUrl = null;
      oldPathToRemove = currentInBucket;
    }

    const emailTrim = data.email.trim();
    const emailNorm = emailTrim ? emailTrim.toLowerCase() : null;

    const { error: eMst } = await supabase
      .from("mem_mst")
      .update({
        mem_nm: data.full_name.trim(),
        ...(data.gender && { gdr_enm: data.gender }),
        birth_dt: data.birthday || null,
        email_addr: emailNorm,
        ...(newAvatarUrl !== undefined && { avatar_url: newAvatarUrl }),
      })
      .eq("mem_id", member.id)
      .eq("vers", 0)
      .eq("del_yn", false);

    if (eMst) {
      console.error("[update-profile] mem_mst error:", eMst);
      return { ok: false, message: "저장에 실패했습니다." };
    }

    // DB 커밋 성공 후에만 기존 파일 제거 (실패는 무시)
    if (oldPathToRemove) {
      await supabase.storage.from("avatars").remove([oldPathToRemove]);
    }

    return { ok: true, avatarUrl: newAvatarUrl };
  });
}
```

- [ ] **Step 2: 타입체크 + 린트 통과 확인**

Run: `pnpm exec tsc --noEmit && pnpm run lint`
Expected: 에러 없음.

- [ ] **Step 3: 커밋 (사용자 승인 후)**

```bash
git add app/actions/update-profile.ts
git commit -m "feat(profile): 프로필 필드+아바타 단일 커밋 서버 액션 updateProfile"
```

---

### Task 5: ProfileEditForm 재작성

상태 모델·미리보기·삭제·저장 흐름·디자인 시스템 정합을 모두 반영해 폼을 다시 쓴다.

**Files:**
- Modify: `components/profile/profile-edit-form.tsx` (전체 교체)

**Interfaces:**
- Consumes: `compressAvatarFile`(Task 3), `updateProfile`(Task 4), `Avatar` size `"2xl"`(Task 1)

- [ ] **Step 1: 파일 전체 교체**

`components/profile/profile-edit-form.tsx`를 아래로 교체:

```tsx
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
```

- [ ] **Step 2: 타입체크 + 린트 통과 확인**

Run: `pnpm exec tsc --noEmit && pnpm run lint`
Expected: 에러 없음. (참고: `createClient` import 제거됨 — 미사용 경고 없어야 함.)

- [ ] **Step 3: 커밋 (사용자 승인 후)**

```bash
git add components/profile/profile-edit-form.tsx
git commit -m "feat(profile): 저장 시 일괄 커밋 + 사진 삭제 + 토스트 피드백"
```

---

### Task 6: upload-avatar.ts 폐기 + 문서 갱신

`updateProfile`로 대체됐으니 옛 액션을 제거하고 참조 문서를 갱신한다.

**Files:**
- Delete: `app/actions/upload-avatar.ts`
- Modify: `.claude/docs/coding-standards.md:17` (네이밍 예시)

**Interfaces:**
- (없음 — 정리 작업)

- [ ] **Step 1: 잔존 import 없음 확인**

Run: `git grep -n "upload-avatar\|uploadAvatar" -- '*.ts' '*.tsx'`
Expected: `app/actions/upload-avatar.ts` 자기 자신 외에 코드 참조 없음 (Task 5에서 폼이 import 제거함).

- [ ] **Step 2: 파일 삭제 + 문서 예시 갱신**

```bash
git rm app/actions/upload-avatar.ts
```

`.claude/docs/coding-standards.md`의 서버 액션 네이밍 예시를 `app/actions/upload-avatar.ts` → `app/actions/update-profile.ts`로 수정.

- [ ] **Step 3: 빌드로 최종 확인**

Run: `pnpm exec tsc --noEmit && pnpm run lint`
Expected: 에러 없음 (깨진 import 없음).

- [ ] **Step 4: 커밋 (사용자 승인 후)**

```bash
git add -A
git commit -m "refactor(profile): 폐기된 upload-avatar 액션 제거 + 문서 갱신"
```

---

## 최종 검증 (수동 QA)

`pnpm run dev` 후 `/profile/edit`에서:

- [ ] 사진 선택 → 미리보기 즉시 표시, **저장 안 하고 뒤로가기** → 프로필 사진 변경 없음 (서버 미반영)
- [ ] 사진 여러 번 교체 → Supabase Storage `avatars` 버킷에 파일 안 쌓임 (저장 전까지)
- [ ] "기본 이미지로" → 저장 → DiceBear 폴백 표시 + 기존 파일 삭제됨 + `avatar_url` null
- [ ] 텍스트만 수정 → 저장 즉시 완료(업로드 지연 없음), 토스트 + 프로필 복귀
- [ ] 새 사진 + 저장 → "저장 중..." 표시 후 토스트 + 복귀, 사진 반영됨
- [ ] HEIC(아이폰) 사진 → 저장 시 서버 변환 경로로 정상 저장
- [ ] 아무것도 안 바꾸면 저장 버튼 비활성
- [ ] 잘못된 이름(한글 아님 등) → 인라인 에러 표시, 저장 안 됨

## Self-Review 결과

- **Spec coverage:** 상태모델(T5)·디자인정합(T1,T5)·클라압축(T2,T3)·단일커밋 서버액션(T4)·저장흐름·토스트(T5)·upload-avatar 폐기(T6)·dirty-guard 제외(스펙 §6 그대로) 모두 매핑됨.
- **Placeholder scan:** 모든 코드 스텝에 실제 코드 포함, TBD/TODO 없음.
- **Type consistency:** `updateProfile(formData)` 시그니처/FormData 키가 T4 정의와 T5 호출에서 일치. `compressAvatarFile`·`Avatar size="2xl"`·`shouldCompressInBrowser`/`computeCoverCrop`/`AVATAR_TARGET_PX` 명칭이 정의-사용 전반에서 일치.
