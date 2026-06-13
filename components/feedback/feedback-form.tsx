"use client";

import { useState, useTransition } from "react";

import { submitFeedback } from "@/app/actions/feedback/submit-feedback";

import { Caption } from "@/components/common/typography";
import { Button } from "@/components/ui/button";
import { CardItem } from "@/components/ui/card";

export function FeedbackForm() {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitted(false);
    startTransition(async () => {
      const result = await submitFeedback(body);
      if (!result.ok) {
        setError(result.message ?? "제출에 실패했습니다.");
      } else {
        setBody("");
        setSubmitted(true);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <CardItem className="flex flex-col gap-3 p-4">
        <textarea
          placeholder="불편한 점, 개선 아이디어 등 자유롭게 남겨주세요"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={2000}
          rows={4}
          className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <div className="flex items-center justify-between">
          <Caption>{body.length}/2000</Caption>
          <Button type="submit" size="sm" disabled={isPending || body.trim().length === 0}>
            {isPending ? "제출 중..." : "제출"}
          </Button>
        </div>
        {error && <Caption className="text-destructive">{error}</Caption>}
        {submitted && <Caption className="text-success">의견이 접수됐습니다. 감사합니다!</Caption>}
      </CardItem>
    </form>
  );
}
