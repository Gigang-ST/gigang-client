"use client";

import { useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import { AlertTriangle, Check, RotateCcw, Zap } from "lucide-react";

import {
  resendKakao,
  type KakaoSendLogRow,
} from "@/app/actions/admin/kakao-send-log";

import { EmptyState } from "@/components/common/empty-state";
import { HelpTip } from "@/components/common/help-tip";
import { Body, Caption, H2, Micro } from "@/components/common/typography";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CardItem } from "@/components/ui/card";
import { formatKST } from "@/lib/dayjs";

/** 출처 → 사람이 읽을 말. 코드 식별자를 화면에 그대로 쓰지 않는다. */
const SOURCE_LABELS: Record<string, string> = {
  gathering_created: "모임 등록",
  gathering_updated: "모임 수정",
  gathering_canceled: "모임 취소",
  gathering_announce: "단톡방에 알림",
  pb_sess_open: "PB 훈련벙 개설",
};

/**
 * 실패 이름 → 한 줄 설명.
 *
 * SDK 클래스 이름(`KakaoTimeoutError`)을 그대로 띄우면 운영진이 "이게 뭔가"를 또 물어야 한다.
 * 여기서 갈라 주는 값은 **다음에 뭘 해야 하는가**다.
 */
const FAILURE_LABELS: Record<string, string> = {
  KakaoTransportError: "허브에 닿지 못함",
  KakaoTimeoutError: "허브 응답 지연",
  KakaoApiError: "허브가 거절함",
  KakaoProtocolError: "허브 응답이 이상함",
  UnexpectedError: "앱 오류",
};

function StatusBadge({ log }: { log: KakaoSendLogRow }) {
  if (log.status === "success") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
        <Check className="size-3" />
        발송
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
      <AlertTriangle className="size-3" />
      {FAILURE_LABELS[log.errName ?? ""] ?? "실패"}
    </span>
  );
}

export function AdminKakaoLogClient({
  logs,
  tableMissing = false,
}: {
  logs: KakaoSendLogRow[];
  /** 이 환경 DB 에 이력 테이블이 아직 없다 — 발송은 되고 기록만 안 남는다. */
  tableMissing?: boolean;
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<KakaoSendLogRow | null>(null);
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);

  const failedCount = logs.filter((l) => l.status === "failed").length;

  function doResend(log: KakaoSendLogRow) {
    startTransition(async () => {
      try {
        const result = await resendKakao(log.sendId);
        setNotice(result.message);
        if (result.ok) router.refresh();
      } catch (e) {
        setNotice(e instanceof Error ? e.message : "다시 보내지 못했어요.");
      } finally {
        setConfirming(null);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4 px-6 pb-6 pt-4">
      <div className="flex items-center gap-2">
        <H2>카카오 발송 이력</H2>
        <HelpTip title="카카오 발송 이력">
          단톡방으로 나간 공지의 성공·실패 기록이에요. 실패한 건은 다시 보낼 수 있어요.
          허브에 닿지 못한 건(와이파이 끊김 등)은 공지가 아예 안 나간 거예요.
        </HelpTip>
      </div>

      {/* 기록이 없는 환경에서 "모두 정상" 이라고 말하지 않는다 */}
      {!tableMissing && (
        <Caption>
          최근 {logs.length}건
          {failedCount > 0 ? ` · 실패 ${failedCount}건` : " · 모두 정상"}
        </Caption>
      )}

      {notice && (
        <CardItem className="bg-secondary">
          <Body>{notice}</Body>
        </CardItem>
      )}

      {tableMissing ? (
        <EmptyState
          variant="card"
          message="이 환경엔 발송 이력 저장소가 아직 준비되지 않았어요. 카톡 발송은 그대로 되고, 기록만 남지 않아요."
        />
      ) : logs.length === 0 ? (
        <EmptyState variant="card" message="아직 발송 기록이 없어요." />
      ) : (
        <div className="flex flex-col gap-2">
          {logs.map((log) => {
            const open = openId === log.sendId;
            return (
              <CardItem key={log.sendId} className="flex flex-col gap-2">
                <button
                  type="button"
                  className="flex flex-col gap-2 text-left"
                  onClick={() => setOpenId(open ? null : log.sendId)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <StatusBadge log={log} />
                    <Micro>{formatKST(log.createdAt, "YYYY.MM.DD HH:mm")}</Micro>
                  </div>
                  <Body className="line-clamp-2 text-[13px]">{log.message}</Body>
                  <div className="flex flex-wrap items-center gap-2">
                    {log.srcType && <Micro>{SOURCE_LABELS[log.srcType] ?? log.srcType}</Micro>}
                    <Micro>· {log.room}</Micro>
                    {log.resend && (
                      <Micro className="inline-flex items-center gap-0.5">
                        <Zap className="size-3" />
                        다시 보냄
                      </Micro>
                    )}
                  </div>
                </button>

                {open && (
                  <div className="flex flex-col gap-2 border-t border-border pt-2">
                    <pre className="whitespace-pre-wrap break-words text-[13px] text-foreground">
                      {log.message}
                    </pre>
                    {log.status === "failed" && (
                      <Caption>
                        {log.errMsg}
                        {log.httpStatus ? ` (HTTP ${log.httpStatus})` : ""}
                      </Caption>
                    )}
                    {log.status === "failed" &&
                      (log.retryable ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() => setConfirming(log)}
                        >
                          <RotateCcw className="size-4" />
                          다시 보내기
                        </Button>
                      ) : (
                        <Caption>
                          다시 보내도 같은 결과예요. 원인을 먼저 확인해 주세요.
                        </Caption>
                      ))}
                  </div>
                )}
              </CardItem>
            );
          })}
        </div>
      )}

      <Dialog open={confirming !== null} onOpenChange={(v) => !v && setConfirming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>이 공지를 다시 보낼까요?</DialogTitle>
            <DialogDescription>
              저장된 본문을 그대로 보냅니다. 그 사이 모임이 바뀌었다면 내용이 지금과 다를 수 있어요.
            </DialogDescription>
          </DialogHeader>
          <pre className="max-h-60 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-secondary p-3 text-[13px]">
            {confirming?.message}
          </pre>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirming(null)} disabled={pending}>
              취소
            </Button>
            <Button onClick={() => confirming && doResend(confirming)} disabled={pending}>
              {pending ? "보내는 중..." : "다시 보내기"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
