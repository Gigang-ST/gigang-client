"use client";

import { useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import { Check, Copy, KeyRound, Trash2 } from "lucide-react";

import { createMcpToken, revokeMcpToken, type McpTokenSummary } from "@/app/actions/mcp-token";
import { dayjs } from "@/lib/dayjs";
import { MCP_TOKEN_LABEL_MAX } from "@/lib/validations/mcp-token";

import { Body, Caption, Micro } from "@/components/common/typography";
import { EmptyState } from "@/components/common/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardItem } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const MCP_ENDPOINT_PATH = "/api/mcp/mcp";

type Props = {
  initialTokens: McpTokenSummary[];
};

export function McpTokensClient({ initialTokens }: Props) {
  const router = useRouter();
  const [tokens, setTokens] = useState(initialTokens);
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // 발급 직후 1회만 노출하는 평문 토큰. 화면 상태 외 어디에도 저장하지 않는다.
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createMcpToken(label);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setIssuedToken(result.token);
      setCopied(false);
      setLabel("");
      setTokens((prev) => [
        {
          token_id: result.token_id,
          label: result.label,
          created_at: result.created_at,
          last_used_at: null,
          revoked: false,
        },
        ...prev,
      ]);
    });
  }

  function handleRevoke(tokenId: string) {
    if (!window.confirm("이 토큰을 폐기하시겠습니까? 이 토큰을 사용하는 MCP 클라이언트는 즉시 접속이 끊깁니다.")) return;
    setRevokingId(tokenId);
    startTransition(async () => {
      const result = await revokeMcpToken(tokenId);
      setRevokingId(null);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setTokens((prev) =>
        prev.map((t) => (t.token_id === tokenId ? { ...t, revoked: true } : t)),
      );
      router.refresh();
    });
  }

  async function handleCopy() {
    if (!issuedToken) return;
    await navigator.clipboard.writeText(issuedToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex flex-col gap-7 px-6 pb-6 pt-4">
      <div className="flex flex-col gap-2">
        <Body className="font-semibold">MCP 토큰</Body>
        <Caption>
          운영 AI 도구(MCP 클라이언트)를 기강 데이터에 연결할 때 쓰는 개인 액세스 토큰입니다.
          발급된 토큰은 발급 직후 한 번만 볼 수 있으니 안전한 곳에 보관하세요.
        </Caption>
      </div>

      <CardItem className="flex flex-col gap-1.5">
        <Micro className="font-semibold uppercase tracking-widest">접속 URL</Micro>
        <Caption className="break-all font-mono text-foreground">{MCP_ENDPOINT_PATH}</Caption>
        <Micro>MCP 클라이언트에 위 경로 앞에 이 팀의 도메인을 붙여 등록하세요.</Micro>
      </CardItem>

      <form onSubmit={handleCreate} className="flex flex-col gap-3">
        <div className="flex gap-2">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="이름 (예: 내 노트북, Claude Desktop)"
            maxLength={MCP_TOKEN_LABEL_MAX}
            disabled={isPending}
          />
          <Button type="submit" disabled={isPending}>
            발급
          </Button>
        </div>
        {error && <Caption className="text-destructive">{error}</Caption>}
      </form>

      <div className="flex flex-col gap-3">
        {tokens.length === 0 ? (
          <EmptyState variant="card" icon={KeyRound} message="발급된 토큰이 없습니다." />
        ) : (
          tokens.map((token) => (
            <CardItem key={token.token_id} className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Body className="truncate font-semibold">
                    {token.label || "이름 없음"}
                  </Body>
                  {token.revoked && (
                    <Badge variant="secondary" className="shrink-0">
                      폐기됨
                    </Badge>
                  )}
                </div>
                <Micro>
                  발급 {dayjs(token.created_at).format("YY.MM.DD HH:mm")}
                  {token.last_used_at &&
                    ` · 최근 사용 ${dayjs(token.last_used_at).format("YY.MM.DD HH:mm")}`}
                </Micro>
              </div>
              {!token.revoked && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="토큰 폐기"
                  disabled={isPending && revokingId === token.token_id}
                  onClick={() => handleRevoke(token.token_id)}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              )}
            </CardItem>
          ))
        )}
      </div>

      <Dialog open={issuedToken !== null} onOpenChange={(open) => !open && setIssuedToken(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>토큰이 발급되었습니다</DialogTitle>
            <DialogDescription>
              이 토큰은 지금만 표시됩니다. 다시 볼 수 없으니 지금 복사해 안전한 곳에 보관하세요.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2 rounded-xl border border-border bg-muted px-3.5 py-3">
            <Caption className="flex-1 overflow-x-auto whitespace-nowrap break-all font-mono text-foreground">
              {issuedToken}
            </Caption>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCopy} className="gap-2">
              {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
              {copied ? "복사됨" : "복사"}
            </Button>
            <Button type="button" onClick={() => setIssuedToken(null)}>
              확인
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
