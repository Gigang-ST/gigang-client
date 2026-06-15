"use client";

import { useRef, useState } from "react";

import { toJpeg } from "html-to-image";
import { Download, SlidersHorizontal } from "lucide-react";

import { dayjs } from "@/lib/dayjs";
import { buildCardFilename, type CardFeaturedKey, type MemberCardData } from "@/lib/member-card";

import { SectionLabel } from "@/components/common/typography";
import { CardRecordPicker } from "@/components/profile/card-record-picker";
import { RecordCard } from "@/components/records/record-card";
import { Button } from "@/components/ui/button";

export function MyRecordCard({ initialData }: { initialData: MemberCardData }) {
  const [data, setData] = useState<MemberCardData>(initialData);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const handleDownload = async () => {
    if (!cardRef.current) return;
    setDownloading(true);
    try {
      const dataUrl = await toJpeg(cardRef.current, {
        quality: 0.95,
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: getComputedStyle(document.body).backgroundColor,
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
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <SectionLabel>MY CARD</SectionLabel>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-muted-foreground" onClick={() => setPickerOpen(true)}>
            <SlidersHorizontal className="size-3.5" />
            기록 선택
          </Button>
          <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={handleDownload} disabled={downloading}>
            <Download className="size-3.5" />
            {downloading ? "저장 중..." : "JPG 저장"}
          </Button>
        </div>
      </div>

      <div className="flex justify-center">
        <RecordCard ref={cardRef} data={data} />
      </div>

      <CardRecordPicker
        allRecords={data.best_records}
        featured={data.card_featured}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSaved={handleSaved}
      />
    </div>
  );
}
