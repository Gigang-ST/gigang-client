"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

import { ImagePlus, X } from "lucide-react";
import { toast } from "sonner";

import { POST_PHOTO_MAX_BYTES, POST_PHOTO_TYPES } from "@/lib/validations/post";

/**
 * 사진 한 장 고르기 — 기강이야기 운동기록과 마일리지런 기록이 공유한다.
 *
 * 두 폼의 사진 규격(10MB·JPG/PNG/WebP/HEIC)과 조작감이 같아야 한다. 각자 만들면
 * 한쪽만 HEIC를 거부하거나 미리보기 해제를 빠뜨려도 눈으로만 드러난다.
 *
 * 고른 `File`은 `onPick`으로 부모에게 올려 준다 — 업로드 시점이 폼마다 다르기 때문이다
 * (기강이야기는 제출과 한 액션, 마일리지런은 제출 전 별도 업로드). 이 컴포넌트는
 * 고르기·미리보기·해제까지만 맡고 파일을 되받지 않는다(미리보기는 여기서 자족한다).
 *
 * `initialUrl`은 수정 화면용이다: 이미 올라간 사진을 미리보기로 보여 주되, 사용자가
 * 새로 고르거나 지우기 전엔 파일이 없다(그대로 두면 서버는 기존 URL을 유지한다).
 */
export function PhotoPicker({
  onPick,
  initialUrl,
  invalid = false,
  removable = true,
  emptyLabel = "사진 한 장 고르기",
  size = "full",
}: {
  /** 파일 선택/해제 콜백. 지우기를 누르면 null이 온다 */
  onPick: (file: File | null) => void;
  /** 수정 화면에서 이미 올라가 있는 사진 URL */
  initialUrl?: string | null;
  /** 필수인데 비었을 때 — 테두리를 빨갛게 */
  invalid?: boolean;
  /** 지우기 버튼 노출. 사진이 필수인 폼에서도 교체는 되므로 기본은 true */
  removable?: boolean;
  emptyLabel?: string;
  /**
   * 미리보기 판 크기. 기본 `full`은 폼 폭을 꽉 채운 정사각(375px에서 ~343px)이라
   * 사진이 화면을 지배한다. `half`는 폭을 절반으로 줄여 **면적이 1/4**이 된다 —
   * 사진은 "무엇을 골랐는지" 확인만 되면 충분하고, 남는 높이는 아래 입력들이 쓴다.
   *
   * 정사각 비율·조작감은 그대로 두고 폭만 줄인다(칸 모양이 폼마다 달라지면 같은
   * 부품으로 안 읽힌다). 왼쪽 정렬이라 라벨·헬퍼 문구와 세로선이 맞는다.
   */
  size?: "full" | "half";
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  // 미리보기 objectURL은 **고르는 순간(이벤트 핸들러)에** 만든다. 파일을 보고 effect에서
  // 만들면 첫 프레임이 빈 칸으로 그려졌다가 다시 그려져 고른 순간 깜빡인다.
  // 브라우저가 자동 회수하지 않으므로 교체할 땐 이전 걸 즉시 해제하고(setPreview 자리),
  // 언마운트 때 남은 하나는 아래 effect가 치운다.
  const [preview, setPreview] = useState<string | null>(null);

  /**
   * 지금 살아 있는 objectURL — 언마운트 정리에 쓴다.
   *
   * cleanup에서 `setPreview(prev => ...)`로 해제하면 안 된다: 이미 언마운트된 컴포넌트의
   * 상태 갱신은 React가 무시하고 updater 실행 자체가 보장되지 않아, revoke가 안 불려
   * objectURL이 남는다(사진을 여러 번 고르고 폼을 닫으면 그만큼 샌다).
   * 상태와 무관하게 ref로 들고 있다가 직접 해제한다.
   */
  const previewRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewRef.current) {
        URL.revokeObjectURL(previewRef.current);
        previewRef.current = null;
      }
    };
  }, []);

  /** 미리보기를 갈아끼운다 — 이전 objectURL은 여기서 반드시 해제한다(누수 방지) */
  function swapPreview(next: string | null) {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = next;
    setPreview(next);
  }

  // 새로 고른 파일이 있으면 그걸, 없으면 이미 올라간 사진을 보여 준다
  const shown = preview ?? initialUrl ?? null;

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    // 같은 파일을 다시 고를 수 있게 값을 비운다 — 안 그러면 change가 안 뜬다
    e.target.value = "";
    if (!picked) return;
    if (picked.size > POST_PHOTO_MAX_BYTES) {
      toast.error("사진은 10MB 이하만 가능합니다.");
      return;
    }
    if (!POST_PHOTO_TYPES.includes(picked.type)) {
      toast.error("JPG, PNG, WebP, HEIC 형식만 가능합니다.");
      return;
    }
    swapPreview(URL.createObjectURL(picked));
    onPick(picked);
  }

  /** 지우기 — 미리보기와 파일을 함께 뗀다(부모는 `initialUrl`도 같이 비운다) */
  function handleClear() {
    swapPreview(null);
    onPick(null);
  }

  return (
    // 폭은 **래퍼가** 잡는다 — 지우기 버튼이 `absolute right-2`로 이 상자에 붙으므로,
    // 버튼(아래 w-full)만 줄이면 지우기가 줄어든 사진에서 떨어져 허공에 남는다.
    <div className={`relative ${size === "half" ? "w-1/2" : ""}`}>
      <input
        ref={fileRef}
        type="file"
        accept={POST_PHOTO_TYPES.join(",")}
        onChange={handlePick}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className={`flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border-[1.5px] border-dashed bg-muted/30 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          invalid ? "border-destructive" : "border-border"
        }`}
      >
        {shown ? (
          <Image
            src={shown}
            alt="올릴 사진 미리보기"
            width={480}
            height={480}
            className="size-full object-cover"
            unoptimized
          />
        ) : (
          <span className="flex flex-col items-center gap-2 text-muted-foreground">
            <ImagePlus className="size-7" />
            <span className="text-[13px]">{emptyLabel}</span>
          </span>
        )}
      </button>

      {removable && shown && (
        <button
          type="button"
          onClick={handleClear}
          aria-label="사진 지우기"
          className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full bg-foreground/60 text-background backdrop-blur-sm transition-colors hover:bg-foreground/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
