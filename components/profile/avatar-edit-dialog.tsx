"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { toast } from "sonner";
import { Camera } from "lucide-react";

import { updateAvatar } from "@/app/actions/profile/update-avatar";
import { compressAvatarFile } from "@/lib/image/avatar-compress";

import { Avatar } from "@/components/common/avatar";
import {
  ResponsiveDrawer,
  ResponsiveDrawerContent,
  ResponsiveDrawerHeader,
  ResponsiveDrawerTitle,
} from "@/components/common/responsive-drawer";
import { Caption } from "@/components/common/typography";
import { Button } from "@/components/ui/button";

/** 클라이언트 선검증 — 서버(`validateAvatarFile`)와 같은 값. 넘치면 올리기 전에 잡는다 */
const MAX_BYTES = 10 * 1024 * 1024;

const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif";

type AvatarState =
  | { kind: "current" }
  | { kind: "new"; file: File; previewUrl: string }
  | { kind: "removed" };

/**
 * 프로필 사진 인라인 편집 — 프로필 수정 화면으로 이동하지 않고 사진만 바꾼다.
 *
 * 한마디(`IntroEditDialog`)와 같은 그릇·같은 어법이다: 프로필탭의 편집 진입점은 그 자리에서
 * 다이얼로그로 여는 게 기본이고, 폼이 두 벌이 될 위험이 있는 것(러닝 프로필)만 `/profile/edit`로
 * 보낸다. 사진은 파일 하나 고르는 일이라 폼이 두 벌이 되지 않는다.
 *
 * `/profile/edit` 맨 위 사진 영역은 그대로 둔다 — 편집 페이지에서 사진만 못 바꾸는 게 더 이상하고,
 * 저장은 양쪽 다 `lib/storage/avatar.ts` 한 곳을 지난다.
 */
export function AvatarEditDialog({
  open,
  onOpenChange,
  memId,
  memNm,
  currentUrl,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 프사 미설정 시 폴백 아바타 seed */
  memId: string;
  memNm: string;
  currentUrl: string | null;
  /** 저장 성공 후 호출 — 열려 있는 카드의 사진을 갱신하는 용도 */
  onSaved?: (avatarUrl: string | null) => void;
}) {
  // 닫혀 있을 땐 폼을 언마운트한다 — 재진입 시 이전에 고른 사진이 남지 않게(IntroEditDialog와 동일).
  if (!open) {
    return (
      <ResponsiveDrawer open={false} onOpenChange={onOpenChange}>
        <></>
      </ResponsiveDrawer>
    );
  }

  return (
    <AvatarEditForm
      onOpenChange={onOpenChange}
      memId={memId}
      memNm={memNm}
      currentUrl={currentUrl}
      onSaved={onSaved}
    />
  );
}

function AvatarEditForm({
  onOpenChange,
  memId,
  memNm,
  currentUrl,
  onSaved,
}: {
  onOpenChange: (open: boolean) => void;
  memId: string;
  memNm: string;
  currentUrl: string | null;
  onSaved?: (avatarUrl: string | null) => void;
}) {
  const router = useRouter();
  const [state, setState] = useState<AvatarState>({ kind: "current" });
  const [compressing, setCompressing] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 미리보기 objectURL 정리는 **여기 한 곳**이 맡는다. `state`가 deps라 사진을 바꿔 끼울
  // 때도 cleanup이 직전 URL을 들고 돌고, 언마운트도 같은 경로다 — 고르기·되돌리기 쪽에서
  // 따로 해제하면 같은 책임이 세 군데로 흩어진다.
  useEffect(() => {
    return () => {
      if (state.kind === "new") URL.revokeObjectURL(state.previewUrl);
    };
  }, [state]);

  async function handlePickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 같은 파일 재선택 허용
    if (!file) return;

    if (file.size > MAX_BYTES) {
      toast.error("이미지는 10MB 이하만 가능합니다.");
      return;
    }

    setCompressing(true);
    try {
      const processed = await compressAvatarFile(file);
      setState({
        kind: "new",
        file: processed,
        previewUrl: URL.createObjectURL(processed),
      });
    } catch {
      toast.error("이미지를 불러오지 못했습니다. 다른 사진으로 시도해 주세요.");
    } finally {
      setCompressing(false);
    }
  }

  function handleRemovePhoto() {
    setState({ kind: "removed" });
  }

  const previewSrc =
    state.kind === "new"
      ? state.previewUrl
      : state.kind === "removed"
        ? null
        : currentUrl;

  // 지울 사진이 있는지: 새 사진을 골랐거나, 기존 사진이 그대로 있을 때
  const hasRemovablePhoto =
    state.kind === "new" || (state.kind === "current" && !!currentUrl);

  const busy = saving || compressing;

  async function handleSave() {
    if (busy || state.kind === "current") return;

    setSaving(true);
    try {
      const formData = new FormData();
      if (state.kind === "new") formData.append("file", state.file);
      else formData.append("removeAvatar", "true");

      const result = await updateAvatar(formData);
      if (!result.ok) {
        toast.error(result.message ?? "저장에 실패했습니다");
        return;
      }
      onSaved?.(result.avatarUrl);
      onOpenChange(false);
      router.refresh();
      toast.success("프로필 사진을 바꿨어요");
    } catch {
      toast.error("저장 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ResponsiveDrawer open onOpenChange={onOpenChange}>
      <ResponsiveDrawerContent
        className="flex flex-col gap-0"
        dialogClassName="max-w-sm"
      >
        <ResponsiveDrawerHeader className="px-4 py-4 text-left">
          <ResponsiveDrawerTitle>프로필 사진</ResponsiveDrawerTitle>
        </ResponsiveDrawerHeader>

        <div className="flex flex-col gap-3 px-4 pb-6">
          {/* 미리보기 자체가 고르기 버튼이다 — 수정 화면(`/profile/edit`)과 같은 조작감 */}
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              aria-label="사진 고르기"
              className="relative size-24 overflow-hidden rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Avatar src={previewSrc} seed={memId} size="2xl" alt={memNm} />
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/10 transition-colors hover:bg-black/30">
                <Camera aria-hidden className="size-6 text-white" />
              </span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT}
              onChange={handlePickFile}
              className="hidden"
            />
            <div className="flex items-center gap-3">
              <Caption>
                {compressing ? "사진 준비 중..." : "사진을 탭하여 변경"}
              </Caption>
              {hasRemovablePhoto && !busy && (
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

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              취소
            </Button>
            <Button
              type="button"
              className="flex-1"
              onClick={() => void handleSave()}
              disabled={busy || state.kind === "current"}
            >
              {saving ? "저장 중..." : "저장"}
            </Button>
          </div>
        </div>
      </ResponsiveDrawerContent>
    </ResponsiveDrawer>
  );
}
