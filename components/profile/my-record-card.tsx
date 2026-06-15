"use client";

import { useEffect, useRef, useState } from "react";

import { toJpeg } from "html-to-image";
import { Download, SlidersHorizontal } from "lucide-react";

import { dayjs } from "@/lib/dayjs";
import { buildCardFilename, type CardFeaturedKey, type MemberCardData } from "@/lib/member-card";

import { CardRecordPicker } from "@/components/profile/card-record-picker";
import { RecordCard } from "@/components/records/record-card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** 본인 프로필의 "내 카드" 팝업 — 카드 미리보기 + 기록 선택 + JPG 저장 */
export function MyRecordCardDialog({
  initialData,
  open,
  onOpenChange,
}: {
  initialData: MemberCardData;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [data, setData] = useState<MemberCardData>(initialData);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  // 캡처용 아바타(dataURL). 외부 호스트(kakao/google) 이미지는 canvas를 오염시키므로
  // 같은 출처 프록시로 받아 dataURL로 변환해 둔다. 아바타가 없으면 즉시 resolved.
  const [exportAvatar, setExportAvatar] = useState<string | null>(null);
  const [avatarResolved, setAvatarResolved] = useState(!initialData.avatar_url);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const url = data.avatar_url;
    if (!url) {
      setAvatarResolved(true);
      return;
    }
    let alive = true;
    setAvatarResolved(false);
    (async () => {
      try {
        const res = await fetch(`/api/avatar-proxy?url=${encodeURIComponent(url)}`);
        if (!res.ok) return;
        const blob = await res.blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () =>
            typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("read failed"));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
        if (alive) setExportAvatar(dataUrl);
      } catch {
        /* 실패 시 원본 URL로 폴백(캡처가 오염될 수 있음) */
      } finally {
        if (alive) setAvatarResolved(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [data.avatar_url]);

  const handleDownload = async () => {
    if (!cardRef.current) return;
    setDownloading(true);
    try {
      const dataUrl = await toJpeg(cardRef.current, {
        quality: 0.95,
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: getComputedStyle(cardRef.current).backgroundColor,
      });
      const link = document.createElement("a");
      link.download = buildCardFilename(data.mem_nm, dayjs().year());
      link.href = dataUrl;
      link.click();
    } catch {
      alert("이미지 저장에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setDownloading(false);
    }
  };

  const handleSaved = (next: CardFeaturedKey[] | null) => {
    setData((prev) => ({ ...prev, card_featured: next }));
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[380px]">
          <DialogHeader>
            <DialogTitle>내 카드</DialogTitle>
            <DialogDescription>기록을 골라 담고 JPG로 저장할 수 있어요.</DialogDescription>
          </DialogHeader>

          <div className="flex justify-center">
            <RecordCard ref={cardRef} data={data} avatarSrc={exportAvatar} />
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="h-11 flex-1 gap-1.5 rounded-xl font-semibold"
              onClick={() => setPickerOpen(true)}
            >
              <SlidersHorizontal className="size-4" />
              기록 선택
            </Button>
            <Button
              className="h-11 flex-1 gap-1.5 rounded-xl font-semibold"
              onClick={handleDownload}
              disabled={downloading || !avatarResolved}
            >
              <Download className="size-4" />
              {downloading ? "저장 중..." : "JPG 저장"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <CardRecordPicker
        allRecords={data.best_records}
        featured={data.card_featured}
        utmbIndex={data.utmb_index}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSaved={handleSaved}
      />
    </>
  );
}
