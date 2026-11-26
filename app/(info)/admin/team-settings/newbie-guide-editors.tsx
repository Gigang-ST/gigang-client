"use client";

import { useState } from "react";

import dynamic from "next/dynamic";
import { useTheme } from "next-themes";

import { ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from "lucide-react";

import { GUIDE_ICONS, guideSectionsSchema, type GuideSection } from "@/lib/newbie-guide";
import { cn } from "@/lib/utils";

import { Body, Caption } from "@/components/common/typography";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// 게시판과 같은 에디터 — 무거워서(css 포함) 열 때만 받는다(§components/board/md-editor-loader)
const MDEditor = dynamic(() => import("@/components/board/md-editor-loader"), { ssr: false });

function SaveButton({ pending, disabled, onClick }: { pending: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <Button type="button" disabled={pending || disabled} onClick={onClick} className="mt-1 w-full">
      {pending ? "저장 중…" : "저장"}
    </Button>
  );
}

/** 짧은 글 여러 줄 — 한 줄에 하나. 빈 줄은 뺀다 */
export function LinesEditor({
  value,
  placeholder,
  pending,
  onSave,
}: {
  value: string[];
  placeholder?: string;
  pending: boolean;
  onSave: (v: unknown) => void;
}) {
  const [text, setText] = useState(value.join("\n"));
  const rows = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const tooLong = rows.find((r) => r.length > 20);
  // 개수 상한도 서버 형식(guideActivitiesSchema .max(20))과 같게 — 안 막으면 저장이 이유 없이 거절된다(PR #745 리뷰)
  const tooMany = rows.length > 20;
  return (
    <div className="flex flex-col gap-2">
      <Textarea value={text} rows={7} placeholder={placeholder} onChange={(e) => setText(e.target.value)} />
      <Caption>한 줄에 하나씩 · {rows.length}개 (20개까지)</Caption>
      {tooLong && <Caption className="text-destructive">「{tooLong}」 — 20자까지예요</Caption>}
      {tooMany && <Caption className="text-destructive">20개까지 넣을 수 있어요</Caption>}
      <SaveButton pending={pending} disabled={Boolean(tooLong) || tooMany} onClick={() => onSave(rows)} />
    </div>
  );
}

type Row = GuideSection & { key: number };

/**
 * 신입 안내 칸 목록 — 표의 행처럼 더하고·지우고·순서를 바꾼다. 칸마다 보이기·아이콘·제목, 본문은 마크다운 에디터.
 * 에디터는 한 번에 한 칸만 연다(칸마다 에디터를 다 펼치면 시트가 끝없이 길어지고 무겁다).
 */
export function GuideSectionsEditor({
  value,
  pending,
  onSave,
}: {
  value: GuideSection[];
  pending: boolean;
  onSave: (v: unknown) => void;
}) {
  const { resolvedTheme } = useTheme();
  const [seq, setSeq] = useState(value.length);
  const [rows, setRows] = useState<Row[]>(() => value.map((s, i) => ({ ...s, key: i })));
  const [openKey, setOpenKey] = useState<number | null>(null);

  const update = (key: number, patch: Partial<GuideSection>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const move = (i: number, d: -1 | 1) =>
    setRows((prev) => {
      const next = [...prev];
      [next[i], next[i + d]] = [next[i + d], next[i]];
      return next;
    });
  const add = () => {
    const key = seq;
    setSeq((n) => n + 1);
    setRows((prev) => [...prev, { key, title: "", icon: "info", body: "", visible: true }]);
    setOpenKey(key);
  };

  // 제목도 본문도 없는 칸은 실수로 더한 빈 줄 — 저장할 때 뺀다
  const toSave: GuideSection[] = rows
    .filter((r) => r.title.trim() || r.body.trim())
    .map(({ title, icon, body, visible }) => ({ title: title.trim(), icon, body, visible }));
  const check = guideSectionsSchema.safeParse(toSave);
  const error = check.success ? null : (check.error.issues[0]?.message ?? "입력을 확인해 주세요");

  return (
    <div className="flex flex-col gap-3">
      {rows.length === 0 && <Caption>아직 칸이 없어요. 칸이 없으면 신입 안내에 「더 알아보기」가 안 보여요.</Caption>}
      {rows.map((r, i) => {
        const open = openKey === r.key;
        return (
          <div key={r.key} className={cn("flex flex-col gap-2 rounded-xl border border-border p-3", !r.visible && "opacity-60")}>
            <div className="flex items-center gap-2">
              <select
                className="h-9 shrink-0 rounded-md border border-input bg-background px-1.5 text-sm"
                value={r.icon}
                aria-label="아이콘"
                onChange={(e) => update(r.key, { icon: e.target.value as GuideSection["icon"] })}
              >
                {GUIDE_ICONS.map((ic) => (
                  <option key={ic.value} value={ic.value}>
                    {ic.label}
                  </option>
                ))}
              </select>
              <Input
                value={r.title}
                placeholder="제목 (예: 회칙)"
                onChange={(e) => update(r.key, { title: e.target.value })}
                className="min-w-0 flex-1"
              />
            </div>
            <div className="flex items-center gap-1">
              <Label className="flex flex-1 cursor-pointer items-center gap-2 font-normal">
                <Checkbox checked={r.visible} onCheckedChange={(v) => update(r.key, { visible: v === true })} />
                <Body className="text-sm">보이기</Body>
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setOpenKey(open ? null : r.key)}
                aria-expanded={open}
              >
                <Pencil className="size-3.5" /> {open ? "본문 닫기" : "본문 편집"}
              </Button>
              <Button type="button" variant="ghost" size="icon" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`${r.title || "이 칸"} 위로`}>
                <ChevronUp className="size-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon" disabled={i === rows.length - 1} onClick={() => move(i, 1)} aria-label={`${r.title || "이 칸"} 아래로`}>
                <ChevronDown className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}
                aria-label={`${r.title || "이 칸"} 지우기`}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
            {open && (
              <div data-color-mode={resolvedTheme === "dark" ? "dark" : "light"} className="overflow-hidden rounded-md border border-border">
                <MDEditor value={r.body} onChange={(v) => update(r.key, { body: v ?? "" })} height={260} preview="edit" />
              </div>
            )}
            {!open && !r.body.trim() && <Caption>본문이 비어 있어요 — 비어 있으면 화면에 안 보여요</Caption>}
          </div>
        );
      })}
      <Button type="button" variant="outline" size="sm" className="self-start" onClick={add} disabled={rows.length >= 20}>
        <Plus className="size-4" /> 칸 추가
      </Button>
      <Caption>
        본문 쓰는 법: <code>### 소제목</code> · <code>- 목록</code> · <code>**굵게**</code> · 표는{" "}
        <code>| 칸 | 칸 |</code>. 엔터를 누르면 화면에서도 줄이 바뀌어요.
      </Caption>
      {error && <Caption className="text-destructive">{error}</Caption>}
      <SaveButton pending={pending} disabled={Boolean(error)} onClick={() => onSave(toSave)} />
    </div>
  );
}
