"use client";

import { useState, useTransition } from "react";

import { Activity, Link2 } from "lucide-react";
import { toast } from "sonner";

import {
  connectIntervals,
  disconnectIntervals,
  refreshIntervals,
} from "@/app/actions/profile/intervals";
import { dayjs, formatKST } from "@/lib/dayjs";
import {
  formatDistanceKm,
  formatDuration,
  formatPace,
  sportLabel,
  type ActivitySummaryRow,
} from "@/lib/intervals/summary";

import { Body, Caption, H2, Micro, SectionLabel } from "@/components/common/typography";
import { Button } from "@/components/ui/button";
import { CardItem } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export type IntervalsViewStatus =
  | { connected: false }
  | { connected: true; statusCd: "ok" | "auth_failed" | "error"; lastOkAt: string | null };

/** 연결 화면에 그대로 적는 열람 범위 — 연결하면 이 범위에 동의한 것으로 본다(#760). */
export const INTERVALS_DISCLOSURE =
  "운영진은 날짜·종목·거리·시간·페이스 요약만 볼 수 있고, 심박·경로 상세는 본인만 봐요.";

const SHOWN = 5;

function dateLabel(actDt: string) {
  // act_dt 는 date 컬럼이라 그대로 안전하다
  return dayjs(actDt).format("M.D");
}

function activityFacts(a: ActivitySummaryRow, withDistance = true) {
  return [
    withDistance ? formatDistanceKm(a.dst_m) : null,
    formatDuration(a.mov_sec),
    formatPace(a.sprt_type_nm, a.avg_spd_mps),
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * 프로필 「최근 운동」(#760) — intervals.icu 에서 받아 둔 활동 요약을 보여 준다.
 * 목적은 기록 관리가 아니라 **보여 주기·대화거리**라, 가장 최근 운동을 크게 세운다.
 * 화면을 열어도 외부를 부르지 않는다(DB 에 저장된 값만 읽는다) — 새로 받는 건 새로고침 버튼·일 배치뿐이다.
 */
export function IntervalsSection({
  status,
  activities,
  enabled,
}: {
  status: IntervalsViewStatus;
  activities: ActivitySummaryRow[];
  /** 서버에 암호화 비밀이 설정돼 있나 — 아니면 연결 입구를 세우지 않는다 */
  enabled: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (!status.connected && !enabled) return null;

  const [latest, ...rest] = activities;

  return (
    <section className="flex flex-col gap-3 pt-2 pb-8">
      <div className="flex items-center justify-between">
        <SectionLabel>RECENT WORKOUTS</SectionLabel>
        {status.connected && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="-my-2 py-2 text-xs font-medium text-primary"
          >
            연결 관리
          </button>
        )}
      </div>

      {status.connected && status.statusCd === "auth_failed" && (
        <CardItem className="flex flex-col gap-2">
          <Body className="font-semibold">연결이 끊겼어요</Body>
          <Caption>intervals.icu 가 저장된 키를 받아주지 않아요. 키를 새로 만들어 다시 연결해 주세요.</Caption>
          <Button size="sm" className="self-start" onClick={() => setOpen(true)}>
            다시 연결하기
          </Button>
        </CardItem>
      )}

      {!status.connected && (
        <CardItem variant="dashed" className="flex flex-col items-start gap-3">
          <div className="flex items-center gap-2">
            <Activity className="size-5 text-primary" />
            <Body className="font-semibold">최근 운동을 프로필에 보여 주세요</Body>
          </div>
          <Caption>intervals.icu 를 연결하면 달린 기록이 여기에 자동으로 떠요.</Caption>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Link2 className="size-4" />
            intervals.icu 연결하기
          </Button>
        </CardItem>
      )}

      {status.connected && !latest && status.statusCd !== "auth_failed" && (
        <CardItem variant="dashed" className="py-8 text-center">
          <Caption>최근 60일 안에 가져온 운동이 아직 없어요.</Caption>
        </CardItem>
      )}

      {latest && (
        <CardItem className="flex flex-col gap-3 bg-secondary/40">
          <div className="flex items-center justify-between">
            <Micro className="font-semibold text-primary">{dateLabel(latest.act_dt)} · {sportLabel(latest.sprt_type_nm)}</Micro>
            <Micro>가장 최근</Micro>
          </div>
          <H2 className="tabular-nums">{formatDistanceKm(latest.dst_m) ?? formatDuration(latest.mov_sec) ?? sportLabel(latest.sprt_type_nm)}</H2>
          <Caption className="text-foreground">
            {activityFacts(latest, false)}
          </Caption>
        </CardItem>
      )}

      {rest.length > 0 && (
        <ul className="flex flex-col divide-y divide-border">
          {rest.slice(0, SHOWN - 1).map((a) => (
            <li key={a.icu_act_id} className="flex items-baseline gap-3 py-2.5">
              <Micro className="w-10 shrink-0 tabular-nums">{dateLabel(a.act_dt)}</Micro>
              <Body className="shrink-0 font-semibold">{sportLabel(a.sprt_type_nm)}</Body>
              <Caption className="min-w-0 truncate">
                {activityFacts(a)}
              </Caption>
            </li>
          ))}
        </ul>
      )}

      <IntervalsDialog open={open} onOpenChange={setOpen} status={status} />
    </section>
  );
}

function IntervalsDialog({
  open,
  onOpenChange,
  status,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: IntervalsViewStatus;
}) {
  const [apiKey, setApiKey] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [confirmingOff, setConfirmingOff] = useState(false);
  const [pending, startTransition] = useTransition();

  const needsKey = !status.connected || status.statusCd === "auth_failed";

  const handleOpenChange = (v: boolean) => {
    onOpenChange(v);
    if (v) {
      setApiKey("");
      setMessage(null);
      setConfirmingOff(false);
    }
  };

  const run = (fn: () => ReturnType<typeof connectIntervals>, close: boolean) =>
    startTransition(async () => {
      setMessage(null);
      try {
        const res = await fn();
        if (!res.ok) {
          setMessage(res.message);
          return;
        }
        setApiKey("");
        if (res.message) toast.success(res.message);
        if (close) onOpenChange(false);
      } catch {
        setMessage("문제가 생겼어요. 잠시 뒤 다시 시도해 주세요.");
      }
    });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>intervals.icu 연결</DialogTitle>
          <DialogDescription>
            {needsKey
              ? "개인 API 키로 달린 기록을 가져와 프로필에 보여 줘요."
              : status.connected && status.lastOkAt
                ? `마지막으로 가져온 시각 ${formatKST(status.lastOkAt, "M월 D일 HH:mm")} · 하루 한 번 자동으로 가져와요.`
                : "하루 한 번 자동으로 가져와요."}
          </DialogDescription>
        </DialogHeader>

        <CardItem className="flex flex-col gap-1 bg-secondary/40">
          <Caption className="font-semibold text-foreground">누가 무엇을 볼 수 있나요</Caption>
          <Caption>{INTERVALS_DISCLOSURE}</Caption>
          {needsKey && <Caption>연결하면 이 범위에 동의한 것으로 봐요. 언제든 연결을 끊으면 가져온 기록도 지워져요.</Caption>}
        </CardItem>

        {needsKey ? (
          <div className="flex flex-col gap-3">
            <Input
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="API 키"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              disabled={pending}
            />
            <Caption>intervals.icu 에서 Settings → Developer Settings → API Key 를 만들어 붙여 넣어요. 키는 암호화해 저장하고 화면에 다시 보이지 않아요.</Caption>
            {message && <Caption className="text-destructive">{message}</Caption>}
            <Button disabled={pending || apiKey.trim().length < 8} onClick={() => run(() => connectIntervals(apiKey), true)}>
              {pending ? "확인하는 중…" : "연결하기"}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {message && <Caption className="text-destructive">{message}</Caption>}
            <Button variant="outline" disabled={pending} onClick={() => run(() => refreshIntervals(), false)}>
              {pending ? "가져오는 중…" : "지금 새로고침"}
            </Button>
            {confirmingOff ? (
              <div className="flex flex-col gap-2">
                <Caption>연결을 끊고 가져온 기록도 모두 지울까요?</Caption>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" disabled={pending} onClick={() => setConfirmingOff(false)}>
                    취소
                  </Button>
                  <Button variant="destructive" className="flex-1" disabled={pending} onClick={() => run(() => disconnectIntervals(), true)}>
                    연결 해제
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="ghost" className="text-muted-foreground" onClick={() => setConfirmingOff(true)}>
                연결 해제
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
