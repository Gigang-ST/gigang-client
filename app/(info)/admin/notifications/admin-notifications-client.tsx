"use client";

import { useState, useMemo } from "react";

import { cn } from "@/lib/utils";

import { sendNotification } from "@/app/actions/admin/send-notification";

import { Body, Caption } from "@/components/common/typography";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Member = { mem_id: string; mem_nm: string };

export function AdminNotificationsClient({
  members,
  initialSelectedIds = [],
  initialNotiNm = "",
  initialNotiCont = "",
}: {
  members: Member[];
  initialSelectedIds?: string[];
  initialNotiNm?: string;
  initialNotiCont?: string;
}) {
  const [targetMode, setTargetMode] = useState<"all" | "select">(initialSelectedIds.length > 0 ? "select" : "all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(initialSelectedIds));
  const [search, setSearch] = useState("");
  const [notiNm, setNotiNm] = useState(initialNotiNm);
  const [notiCont, setNotiCont] = useState(initialNotiCont);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const filtered = useMemo(
    () => members.filter((m) => m.mem_nm.includes(search)),
    [members, search],
  );

  function toggleMember(memId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(memId)) next.delete(memId);
      else next.add(memId);
      return next;
    });
  }

  function toggleAll() {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((m) => m.mem_id)));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!notiNm.trim()) return;
    if (targetMode === "select" && selectedIds.size === 0) return;

    setLoading(true);
    setResult(null);
    try {
      const target = targetMode === "all" ? "all" : [...selectedIds];
      const res = await sendNotification({
        target,
        notiNm: notiNm.trim(),
        notiCont: notiCont.trim() || null,
      });

      if (!res.ok) {
        setResult({ ok: false, message: res.message ?? "발송 실패" });
        return;
      }

      const label = targetMode === "all" ? "전체 멤버" : `${selectedIds.size}명`;
      setResult({ ok: true, message: `${label}에게 알림을 발송했습니다.` });
      setNotiNm("");
      setNotiCont("");
      setSelectedIds(new Set());
    } catch (e) {
      console.error(e);
      setResult({ ok: false, message: "발송 중 오류가 발생했습니다." });
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = notiNm.trim() && (targetMode === "all" || selectedIds.size > 0);

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6 px-6 py-4">

      {/* 수신 대상 */}
      <div className="flex flex-col gap-3">
        <Label>수신 대상</Label>
        <div className="flex gap-4">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              checked={targetMode === "all"}
              onChange={() => setTargetMode("all")}
            />
            <Body className="text-[14px]">전체 멤버</Body>
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              checked={targetMode === "select"}
              onChange={() => setTargetMode("select")}
            />
            <Body className="text-[14px]">멤버 선택</Body>
          </label>
        </div>

        {targetMode === "select" && (
          <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
            <Input
              placeholder="이름 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-sm"
            />
            {/* 전체 선택 */}
            <label className="flex cursor-pointer items-center gap-2 border-b border-border pb-2">
              <input
                type="checkbox"
                checked={filtered.length > 0 && selectedIds.size === filtered.length}
                onChange={toggleAll}
              />
              <Caption className="font-medium text-foreground">
                전체 선택 ({selectedIds.size}/{filtered.length})
              </Caption>
            </label>
            {/* 멤버 목록 */}
            <div className="max-h-48 overflow-y-auto">
              {filtered.length === 0 ? (
                <Caption className="py-2 text-center">검색 결과 없음</Caption>
              ) : (
                filtered.map((m) => (
                  <label
                    key={m.mem_id}
                    className="flex cursor-pointer items-center gap-2 py-1.5"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(m.mem_id)}
                      onChange={() => toggleMember(m.mem_id)}
                    />
                    <Body className={cn("text-[13px]", selectedIds.has(m.mem_id) && "font-medium")}>
                      {m.mem_nm}
                    </Body>
                  </label>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* 알림 내용 */}
      <div className="flex flex-col gap-1.5">
        <Label>알림 내용 <span className="text-destructive">*</span></Label>
        <Input
          placeholder="알림 내용을 입력하세요."
          value={notiNm}
          onChange={(e) => setNotiNm(e.target.value)}
          maxLength={100}
        />
      </div>

      {/* 부가 설명 */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5">
          <Label>부가 설명</Label>
          <Caption>(선택)</Caption>
        </div>
        <Input
          placeholder="추가 설명이 있으면 입력하세요."
          value={notiCont}
          onChange={(e) => setNotiCont(e.target.value)}
          maxLength={200}
        />
      </div>

      {result && (
        <Body className={`text-sm ${result.ok ? "text-primary" : "text-destructive"}`}>
          {result.message}
        </Body>
      )}

      <Button type="submit" disabled={loading || !canSubmit}>
        {loading ? "발송 중..." : "알림 발송"}
      </Button>
    </form>
  );
}
