"use client";

import { useEffect, useState } from "react";

import { CalendarPlus } from "lucide-react";
import { toast } from "sonner";

import { createPbSessGatherings, getPbSessDrafts } from "@/app/actions/admin/manage-pb-class";
import { wkLabel } from "@/lib/pb-class";
import { buildMeasureDraft } from "@/lib/pb-class-sessions";
import type { PbClassBoard } from "@/lib/queries/pb-class";

import { EmptyState } from "@/components/common/empty-state";
import {
  ResponsiveDrawer,
  ResponsiveDrawerContent,
  ResponsiveDrawerDescription,
  ResponsiveDrawerHeader,
  ResponsiveDrawerTitle,
} from "@/components/common/responsive-drawer";
import { Caption } from "@/components/common/typography";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

import { hasBlockingError, rowKeyOf, SessOpenRowList, toRows, type SessOpenRow } from "./pb-sess-open-rows";

const DEFAULT_TIME = "19:30";
const DEFAULT_DUR_MIN = 90;

/**
 * 공식훈련 벙 한 번에 열기 — 서버가 만든 초안을 오너가 눈으로 보고 장소·시간을 고친 뒤 한꺼번에 만든다.
 * 「연결」이 아니라 「열기」다: 벙을 새로 만들면서 곧바로 이 프로젝트에 건다(오너 지시).
 */
export function PbSessOpenDialog({
  evtId,
  board,
  open,
  onOpenChange,
  onDone,
}: {
  evtId: string;
  board: PbClassBoard;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 성공 뒤 — 보드 재조회 */
  onDone: () => Promise<void>;
}) {
  const [rows, setRows] = useState<SessOpenRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [measureLinked, setMeasureLinked] = useState(true);
  const [place, setPlace] = useState("");
  const [time, setTime] = useState(DEFAULT_TIME);
  const [durMin, setDurMin] = useState(DEFAULT_DUR_MIN);
  const [measureDate, setMeasureDate] = useState("");
  const [busy, setBusy] = useState(false);

  const evtSttDt = board.evt.sttDt;

  // 열 때마다 서버 초안을 새로 받는다 — 닫았다 여는 사이 다른 관리자가 연결했을 수 있다.
  // 부모가 열 때만 이 컴포넌트를 마운트하므로(닫으면 언마운트) 「마운트 = 열림」이고, 상태는 매번 새로 시작한다.
  // 예전엔 Drawer의 onOpenChange 안에서 불렀는데, Radix는 그걸 **닫힐 때만** 부르기 때문에 버튼으로 열면
  // 초안이 영영 안 불렸다.
  useEffect(() => {
    let cancelled = false;
    void getPbSessDrafts(evtId).then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        setLoadError(res.message ?? "초안을 불러오지 못했어요");
        return;
      }
      setRows(toRows(res.drafts));
      setMeasureLinked(res.measureLinked);
      // 공통 값은 초안이 이미 정한 값을 존중한다(없으면 기본값)
      setDurMin(res.drafts[0]?.durMin ?? DEFAULT_DUR_MIN);
      setTime(res.drafts[0]?.time ?? DEFAULT_TIME);
      setPlace(res.drafts[0]?.locTxt ?? "");
    });
    return () => {
      cancelled = true;
    };
  }, [evtId]);

  const handleOpenChange = (next: boolean) => onOpenChange(next);

  const updateRow = (next: SessOpenRow) =>
    setRows((cur) => cur?.map((r) => (r.key === next.key ? next : r)) ?? cur);

  /** 「전체 적용」 — 포함 여부와 상관없이 모든 줄에 채운다(체크를 나중에 켜도 값이 맞아 있게) */
  const applyAll = (patch: { locTxt?: string; time?: string }) =>
    setRows((cur) => cur?.map((r) => ({ ...r, draft: { ...r.draft, ...patch } })) ?? cur);

  const addMeasure = (date: string) => {
    setMeasureDate(date);
    if (!date) return;
    const draft = buildMeasureDraft({
      evtSttDt,
      plans: board.sessPlans,
      date,
      defaults: { time, durMin, locTxt: place },
    });
    setRows((cur) => {
      // 측정은 한 번뿐이라 날짜를 다시 고르면 기존 측정 줄을 갈아끼운다
      const rest = (cur ?? []).filter((r) => r.draft.sessType !== "MEASURE");
      return [...rest, { key: rowKeyOf(draft), include: true, draft }];
    });
  };

  const included = rows?.filter((r) => r.include) ?? [];
  const blocked = rows ? hasBlockingError(rows, evtSttDt) : true;
  const measureRow = rows?.find((r) => r.draft.sessType === "MEASURE");

  const handleSubmit = async () => {
    if (included.length === 0 || blocked) return;
    setBusy(true);
    try {
      const res = await createPbSessGatherings(
        evtId,
        included.map((r) => ({ ...r.draft, durMin })),
      );
      if (!res.ok) {
        // 실패하면 폼을 그대로 둔다 — 고친 장소·시간을 날리지 않는다
        toast.error(res.message ?? "벙을 열지 못했어요. 다시 시도해 주세요.");
        return;
      }
      toast.success(res.message ?? "벙을 열었어요");
      onOpenChange(false);
      await onDone();
    } catch {
      toast.error("벙을 열지 못했어요. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ResponsiveDrawer open={open} onOpenChange={handleOpenChange}>
      <ResponsiveDrawerContent
        dialogClassName="max-w-lg max-h-[90dvh] flex flex-col gap-0 p-0 overflow-hidden"
        drawerClassName="h-[95dvh] max-h-[95dvh]"
      >
        <ResponsiveDrawerHeader className="shrink-0 border-b border-border px-4 py-4 text-left">
          <ResponsiveDrawerTitle>공식훈련 벙 열기</ResponsiveDrawerTitle>
          <ResponsiveDrawerDescription>
            벙은 정기런으로 열려요. 알림은 따로 가지 않아요 — 다 열고 나서 공지해 주세요.
          </ResponsiveDrawerDescription>
        </ResponsiveDrawerHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4 pt-4">
          {rows === null && !loadError && (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-32 w-full rounded-2xl" />
              ))}
            </div>
          )}
          {loadError && <EmptyState variant="card" message={loadError} />}

          {rows && (
            <>
              <div className="flex flex-col gap-3 rounded-2xl bg-secondary/50 p-3">
                <Caption className="font-semibold text-foreground">공통</Caption>
                <div className="flex gap-2">
                  <Input
                    value={place}
                    placeholder="장소"
                    aria-label="공통 장소"
                    onChange={(e) => setPlace(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 shrink-0"
                    onClick={() => applyAll({ locTxt: place })}
                  >
                    전체 적용
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Input
                    type="time"
                    value={time}
                    aria-label="공통 시작 시간"
                    onChange={(e) => setTime(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 shrink-0"
                    onClick={() => applyAll({ time })}
                  >
                    전체 적용
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={10}
                    step={5}
                    value={durMin}
                    aria-label="진행 시간(분)"
                    onChange={(e) => setDurMin(Number(e.target.value) || 0)}
                  />
                  <Caption className="shrink-0">분 진행</Caption>
                </div>
              </div>

              {rows.length === 0 && <EmptyState variant="card" message="새로 열 공식훈련이 없어요." />}
              <SessOpenRowList rows={rows} evtSttDt={evtSttDt} plans={board.sessPlans} onChange={updateRow} />

              {!measureLinked && (
                <div className="flex flex-col gap-2 rounded-2xl border border-dashed border-border p-3">
                  <Caption className="font-semibold text-foreground">10K 측정 추가</Caption>
                  <Input
                    type="date"
                    value={measureDate}
                    aria-label="10K 측정 날짜"
                    onChange={(e) => addMeasure(e.target.value)}
                  />
                  {measureRow && (
                    <Caption>
                      {wkLabel(measureRow.draft.wkNo)}에 측정 줄을 추가했어요. 위 목록에서 고칠 수 있어요.
                    </Caption>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="shrink-0 border-t border-border p-4">
          <Button
            onClick={() => void handleSubmit()}
            disabled={busy || included.length === 0 || blocked}
            className="h-[52px] w-full gap-1.5 rounded-xl text-base font-semibold"
          >
            <CalendarPlus className="size-4" />
            {busy ? "여는 중..." : `벙 ${included.length}개 열기`}
          </Button>
        </div>
      </ResponsiveDrawerContent>
    </ResponsiveDrawer>
  );
}
