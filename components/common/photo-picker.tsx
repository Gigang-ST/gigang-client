"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

import { ImagePlus, X } from "lucide-react";
import { toast } from "sonner";

import { compressPostPhoto } from "@/lib/image/post-photo-compress";
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
  align = "start",
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
   * 부품으로 안 읽힌다).
   */
  size?: "full" | "half";
  /**
   * 줄어든 판을 폼 안에서 어디에 놓을지. `half`일 때만 의미가 있다(`full`은 폭을 꽉 채워
   * 정렬할 여백 자체가 없다).
   *
   * 기본 `start`는 라벨·헬퍼 문구와 왼쪽 세로선이 맞는다 — 여러 입력이 줄줄이 선 폼
   * (마일리지런 다건 입력)에선 이 정렬선이 있어야 칸들이 한 줄기로 읽힌다.
   * `center`는 사진이 그 폼의 얼굴일 때 쓴다: 입력이 몇 개뿐인 폼에서 절반 판만 왼쪽에
   * 붙어 있으면 오른쪽 절반이 통째로 빈 채 균형이 무너져 보인다.
   */
  align?: "start" | "center";
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

  /**
   * 마지막으로 고른 순번. 압축이 **비동기**라 결과가 고른 순서대로 돌아오지 않는다 —
   * 큰 사진 A를 고른 뒤 곧바로 작은 사진 B로 바꾸면 B가 먼저 끝나고 A가 나중에 도착해,
   * 화면엔 B가 보이는데 실제 업로드는 A가 되는 어긋남이 생긴다(지우기 직후 도착하면
   * 지운 사진이 되살아난다). 순번이 최신이 아닌 결과는 버려서 **항상 마지막 선택만**
   * 부모에게 넘긴다.
   */
  const pickSeqRef = useRef(0);

  useEffect(() => {
    return () => {
      if (previewRef.current) {
        URL.revokeObjectURL(previewRef.current);
        previewRef.current = null;
      }
      // 언마운트 뒤 도착하는 압축 결과가 부모 상태를 건드리지 않게 순번을 끊는다
      pickSeqRef.current += 1;
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

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    // 같은 파일을 다시 고를 수 있게 값을 비운다 — 안 그러면 change가 안 뜬다
    e.target.value = "";
    if (!picked) return;
    // 크기·타입은 **원본 기준**으로 본다: 압축은 전송량을 줄이는 최적화일 뿐이라,
    // 10MB를 넘는 사진을 줄여서 통과시키면 사용자가 정한 상한이 조용히 무의미해진다.
    if (picked.size > POST_PHOTO_MAX_BYTES) {
      toast.error("사진은 10MB 이하만 가능합니다.");
      return;
    }
    if (!POST_PHOTO_TYPES.includes(picked.type)) {
      toast.error("JPG, PNG, WebP, HEIC 형식만 가능합니다.");
      return;
    }

    // 미리보기는 **원본으로 즉시** 띄운다 — 압축을 기다리면 고른 순간 칸이 비어 보인다.
    swapPreview(URL.createObjectURL(picked));

    // 이번 선택의 순번. 압축이 끝났을 때 이 값이 여전히 최신이어야 부모에게 넘긴다.
    const seq = ++pickSeqRef.current;

    // **부모에게도 원본을 먼저 넘긴다.** 압축이 끝날 때까지 기다리면 그 사이 부모의 파일
    // 상태가 비어 있어, 사진을 골라 놓고 바로 저장을 누른 사용자가 "사진을 한 장
    // 올려주세요" 오류를 본다(화면엔 사진이 멀쩡히 보이는데). 아래에서 압축본으로 즉시
    // 갈아끼우므로, 이 원본이 실제로 업로드되는 건 그 찰나에 저장을 누른 경우뿐이고
    // 그때도 서버가 규격을 맞춰 저장한다(결과물은 같고 전송만 커진다).
    onPick(picked);

    // 업로드용은 미리 줄여서 넘긴다. 원본(아이폰 12MP = 3~9MB)을 그대로 보내면 모바일
    // 회선에서 전송이 길어져 액션 한도·실행시간 경계에 걸리고, 같은 사진이 됐다 안 됐다
    // 한다. 최종 저장물은 어차피 300KB 안팎이라 미리 줄여도 결과가 같다(자세한 근거는
    // `compressPostPhoto` 주석). 실패하면 원본이 그대로 돌아오므로 흐름이 끊기지 않는다.
    const compressed = await compressPostPhoto(picked);

    // 기다리는 동안 다른 사진을 고르거나 지웠으면 이 결과는 버린다(위 pickSeqRef 주석).
    if (seq !== pickSeqRef.current) return;
    onPick(compressed);
  }

  /** 지우기 — 미리보기와 파일을 함께 뗀다(부모는 `initialUrl`도 같이 비운다) */
  function handleClear() {
    // 진행 중인 압축 결과가 뒤늦게 도착해 지운 사진을 되살리지 못하게 순번을 올린다
    pickSeqRef.current += 1;
    swapPreview(null);
    onPick(null);
  }

  return (
    // 폭은 **래퍼가** 잡는다 — 지우기 버튼이 `absolute right-2`로 이 상자에 붙으므로,
    // 버튼(아래 w-full)만 줄이면 지우기가 줄어든 사진에서 떨어져 허공에 남는다.
    // 가운데 정렬도 같은 이유로 이 래퍼에 건다(`mx-auto`) — 바깥에서 감싸 옮기면
    // 지우기 버튼만 원래 자리에 남는다.
    <div
      className={`relative ${size === "half" ? "w-1/2" : ""} ${
        align === "center" ? "mx-auto" : ""
      }`}
    >
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
