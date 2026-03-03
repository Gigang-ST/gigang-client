"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchUtmbIndex } from "@/app/actions/utmb";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type UtmbProfileData = {
  utmb_profile_url: string;
  utmb_index: number;
} | null;

type UtmbProfileFormProps = {
  memberId: string;
  initialData: UtmbProfileData;
};

export function UtmbProfileForm({
  memberId,
  initialData,
}: UtmbProfileFormProps) {
  const [utmbUrl, setUtmbUrl] = useState(initialData?.utmb_profile_url ?? "");
  const [utmbIndex, setUtmbIndex] = useState<number | null>(
    initialData?.utmb_index ?? null,
  );
  const [utmbName, setUtmbName] = useState("");
  const [fetching, setFetching] = useState(false);
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState<string | null>(null);

  const handleFetch = async () => {
    if (!utmbUrl.trim()) {
      setMessage("UTMB 프로필 URL을 입력해 주세요.");
      setSaveState("error");
      return;
    }

    setFetching(true);
    setMessage(null);
    setSaveState("idle");

    const result = await fetchUtmbIndex(utmbUrl);

    setFetching(false);

    if (result.ok) {
      setUtmbIndex(result.index);
      setUtmbName(result.name);
      setMessage(`UTMB Index: ${result.index} (${result.name})`);
      setSaveState("success");
    } else {
      setUtmbIndex(null);
      setUtmbName("");
      setMessage(result.error);
      setSaveState("error");
    }
  };

  const handleSave = async () => {
    setSaveState("saving");
    setMessage(null);

    if (!utmbUrl.trim()) {
      setSaveState("error");
      setMessage("UTMB 프로필 URL을 입력해 주세요.");
      return;
    }
    if (utmbIndex === null) {
      setSaveState("error");
      setMessage("먼저 '조회' 버튼으로 UTMB Index를 가져와 주세요.");
      return;
    }

    const supabase = createClient();
    const { error } = await supabase.from("utmb_profile").upsert(
      {
        member_id: memberId,
        utmb_profile_url: utmbUrl.trim(),
        utmb_index: utmbIndex,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "member_id" },
    );

    if (error) {
      setSaveState("error");
      setMessage(error.message);
      return;
    }

    setSaveState("success");
    setMessage("저장 완료");
  };

  const handleDelete = async () => {
    if (!initialData && utmbIndex === null) return;

    setSaveState("saving");
    setMessage(null);

    const supabase = createClient();
    const { error } = await supabase
      .from("utmb_profile")
      .delete()
      .eq("member_id", memberId);

    if (error) {
      setSaveState("error");
      setMessage(error.message);
      return;
    }

    setUtmbUrl("");
    setUtmbIndex(null);
    setUtmbName("");
    setSaveState("success");
    setMessage("삭제 완료");
  };

  return (
    <Card className="border border-white/20 bg-white/80 text-foreground shadow-xl backdrop-blur-xl">
      <CardHeader>
        <CardTitle className="text-2xl">UTMB Index</CardTitle>
        <CardDescription>
          UTMB 프로필 URL을 등록하면 Index가 자동 조회됩니다.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          <div>
            <Label>UTMB 프로필 URL</Label>
            <div className="flex gap-2">
              <Input
                placeholder="https://utmb.world/runner/1234567.firstname.lastname"
                value={utmbUrl}
                onChange={(e) => {
                  setUtmbUrl(e.target.value);
                  setUtmbIndex(null);
                  setUtmbName("");
                }}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleFetch}
                disabled={fetching}
              >
                {fetching ? "조회 중..." : "조회"}
              </Button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              utmb.world에서 본인 프로필 페이지 URL을 붙여넣으세요.
            </p>
            <a
              href="https://accounts.utmb.world/auth/realms/utmb-world/protocol/openid-connect/registrations"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-0.5 inline-block text-xs text-blue-600 underline"
            >
              UTMB 계정이 없으신가요? 가입하기
            </a>
          </div>

          {utmbIndex !== null && (
            <div className="rounded-md border bg-white/50 px-3 py-2">
              <span className="text-sm text-muted-foreground">
                UTMB Index:
              </span>{" "}
              <span className="text-lg font-bold">{utmbIndex}</span>
              {utmbName && (
                <span className="ml-2 text-sm text-muted-foreground">
                  ({utmbName})
                </span>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <Button
              type="button"
              onClick={handleSave}
              disabled={saveState === "saving"}
              className="flex-1"
            >
              {saveState === "saving" ? "저장 중..." : "저장"}
            </Button>
            {(initialData || utmbIndex !== null) && (
              <Button
                type="button"
                variant="outline"
                onClick={handleDelete}
                disabled={saveState === "saving"}
              >
                삭제
              </Button>
            )}
          </div>
          {message ? (
            <p
              className={
                saveState === "error"
                  ? "text-sm text-red-500"
                  : "text-sm text-emerald-600"
              }
            >
              {message}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
