"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";

import { uploadXlsx } from "@/app/actions/dues/upload-xlsx";

import { Button } from "@/components/ui/button";

/**
 * 은행 거래 엑셀 업로드 진입점. 결과 요약(자동/확인필요/제외/중복)은 onResult 로
 * 부모의 공용 메시지 라인에 올린다. 같은 파일 재선택이 가능하도록 input 값은 매번 비운다.
 */
export function UploadXlsxButton({ onResult }: { onResult: (msg: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onFile(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    startTransition(async () => {
      const res = await uploadXlsx(fd);
      if (res.ok) {
        const s = res.summary;
        const parts = [`자동 ${s.autoDone}`, `확인필요 ${s.needsReview}`, `제외 ${s.excluded}`];
        if (s.skipped) parts.push(`중복 ${s.skipped}`);
        if (s.skippedByCutoff) parts.push(`이미 반영된 과거 ${s.skippedByCutoff}건 건너뜀`);
        onResult(`업로드 완료 — ${parts.join(" · ")}`);
        router.refresh();
      } else {
        onResult(res.message ?? "업로드에 실패했습니다.");
      }
    });
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onFile(file);
        }}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => inputRef.current?.click()}
      >
        {pending ? "업로드 중…" : "엑셀 업로드"}
      </Button>
    </>
  );
}
