"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchUtmbIndex } from "@/app/actions/utmb";
import { Plus, ExternalLink, Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type UtmbData = {
  utmb_profile_url: string;
  utmb_index: number;
} | null;

export function UtmbIndexSection({
  memberId,
  initialData,
}: {
  memberId: string;
  initialData: UtmbData;
}) {
  const [data, setData] = useState(initialData);
  const [open, setOpen] = useState(false);

  // Form state
  const [utmbUrl, setUtmbUrl] = useState(() => {
    if (!data?.utmb_profile_url) return "";
    const match = data.utmb_profile_url.match(/\/runner\/(.+)$/);
    return match ? match[1] : data.utmb_profile_url;
  });
  const [utmbIndex, setUtmbIndex] = useState<number | null>(data?.utmb_index ?? null);
  const [utmbName, setUtmbName] = useState("");
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  const toShortId = (url: string) => {
    const match = url.match(/\/runner\/(.+)$/);
    return match ? match[1] : url;
  };

  const resetForm = () => {
    setUtmbUrl(data?.utmb_profile_url ? toShortId(data.utmb_profile_url) : "");
    setUtmbIndex(data?.utmb_index ?? null);
    setUtmbName("");
    setMessage(null);
    setIsError(false);
  };

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (v) resetForm();
  };

  const handleFetch = async () => {
    if (!utmbUrl.trim()) {
      setMessage("번호와 이름을 입력해 주세요.");
      setIsError(true);
      return;
    }
    setFetching(true);
    setMessage(null);
    const fullUrl = utmbUrl.trim().startsWith("http")
      ? utmbUrl.trim()
      : `https://utmb.world/runner/${utmbUrl.trim()}`;
    const result = await fetchUtmbIndex(fullUrl);
    setFetching(false);
    if (result.ok) {
      setUtmbIndex(result.index);
      setUtmbName(result.name);
      setMessage(`UTMB Index: ${result.index} (${result.name})`);
      setIsError(false);
    } else {
      setUtmbIndex(null);
      setUtmbName("");
      setMessage(result.error);
      setIsError(true);
    }
  };

  const handleSave = async () => {
    if (!utmbUrl.trim()) {
      setMessage("번호와 이름을 입력해 주세요.");
      setIsError(true);
      return;
    }
    if (utmbIndex === null) {
      setMessage("먼저 '조회' 버튼으로 UTMB Index를 가져와 주세요.");
      setIsError(true);
      return;
    }
    setSaving(true);
    setMessage(null);
    const fullUrl = utmbUrl.trim().startsWith("http")
      ? utmbUrl.trim()
      : `https://utmb.world/runner/${utmbUrl.trim()}`;
    const supabase = createClient();
    const { error } = await supabase.from("utmb_profile").upsert(
      {
        member_id: memberId,
        utmb_profile_url: fullUrl,
        utmb_index: utmbIndex,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "member_id" },
    );
    setSaving(false);
    if (error) {
      setMessage(error.message);
      setIsError(true);
      return;
    }
    setData({ utmb_profile_url: fullUrl, utmb_index: utmbIndex });
    setOpen(false);
  };

  const handleDelete = async () => {
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("utmb_profile").delete().eq("member_id", memberId);
    setSaving(false);
    if (error) {
      setMessage(error.message);
      setIsError(true);
      return;
    }
    setData(null);
    setOpen(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <span className="text-xs font-semibold tracking-widest text-muted-foreground">
        UTMB INDEX
      </span>

      {data ? (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center justify-between rounded-2xl border-[1.5px] border-border p-5 text-left"
        >
          <div className="flex flex-col gap-1">
            <span className="text-[32px] font-bold leading-none text-foreground">
              {data.utmb_index}
            </span>
            <span className="text-xs text-muted-foreground">
              UTMB Index Score
            </span>
          </div>
          <div className="flex items-center gap-2">
            {data.utmb_profile_url && (
              <a
                href={data.utmb_profile_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary"
              >
                UTMB
              </a>
            )}
            <Pencil className="size-4 text-muted-foreground" />
          </div>
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-border py-8 text-sm text-muted-foreground"
        >
          <Plus className="size-4" />
          UTMB Index 연동하기
        </button>
      )}

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>UTMB Index</DialogTitle>
            <DialogDescription>
              UTMB 프로필 번호와 이름을 입력하세요.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-foreground">
                UTMB 프로필
              </label>
              <div className="flex gap-2">
                <Input
                  placeholder="123456.gildong.hong"
                  value={utmbUrl}
                  onChange={(e) => {
                    setUtmbUrl(e.target.value);
                    setUtmbIndex(null);
                    setUtmbName("");
                  }}
                  className="flex-1"
                />
                <button
                  type="button"
                  onClick={handleFetch}
                  disabled={fetching}
                  className="shrink-0 rounded-lg border-[1.5px] border-border px-4 py-2 text-sm font-medium text-foreground disabled:opacity-50"
                >
                  {fetching ? "조회 중..." : "조회"}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                utmb.world 프로필의 번호.이름 형식으로 입력하세요.
              </p>
              <a
                href="https://accounts.utmb.world/auth/realms/utmb-world/protocol/openid-connect/auth?client_id=utmb-world&redirect_uri=https%3A%2F%2Futmb.world%2F%2Fmy-utmb%2Fmy-dashboard%2F&state=76b3100e-28a0-44c8-8171-c1565b6e2f8b&response_mode=fragment&response_type=code&scope=openid&nonce=cfd2878c-e432-4b2d-8c94-7a5ba1596c5c&ui_locales=en&code_challenge=i05NEfg3AfJvYoh7vwpYkqW-IcHNqfmLOqk4iLdzYe8&code_challenge_method=S256"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-primary underline"
              >
                내 UTMB 프로필 찾기
              </a>
            </div>

            {utmbIndex !== null && (
              <div className="flex items-center gap-2 rounded-xl bg-secondary px-4 py-3">
                <span className="text-sm text-muted-foreground">UTMB Index:</span>
                <span className="text-lg font-bold text-foreground">{utmbIndex}</span>
                {utmbName && (
                  <span className="text-sm text-muted-foreground">({utmbName})</span>
                )}
              </div>
            )}

            {message && (
              <p className={isError ? "text-sm text-destructive" : "text-sm text-emerald-600"}>
                {message}
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex-1 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {saving ? "저장 중..." : "저장"}
              </button>
              {data && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={saving}
                  className="rounded-xl border-[1.5px] border-border px-4 py-3 text-sm font-medium text-destructive disabled:opacity-50"
                >
                  삭제
                </button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
