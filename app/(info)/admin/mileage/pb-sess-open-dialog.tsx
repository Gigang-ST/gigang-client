"use client";

import { useEffect, useState } from "react";

import { CalendarPlus } from "lucide-react";
import { toast } from "sonner";

import { createPbSessGatherings, getPbSessDrafts } from "@/app/actions/admin/manage-pb-class";
import { weekNoOf, wkLabel } from "@/lib/pb-class";
import {
  buildMeasureDraft,
  draftStartIso,
  PB_SESS_DEFAULT_DUR_MIN,
  PB_SESS_DEFAULT_TIME,
  type SessOpenOnly,
} from "@/lib/pb-class-sessions";
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

const DEFAULT_TIME = PB_SESS_DEFAULT_TIME;
const DEFAULT_DUR_MIN = PB_SESS_DEFAULT_DUR_MIN;

/**
 * 공식훈련 벙 열기 — 서버가 만든 초안을 오너가 눈으로 보고 장소·시간을 고친 뒤 만든다.
 * 「연결」이 아니라 「열기」다: 벙을 새로 만들면서 곧바로 이 프로젝트에 건다(오너 지시).
 *
 * `only`가 있으면 그 주차 한 칸만 여는 창이다(주 흐름: 매주 그 주 벙을 열 때 쓴다). 없으면 남은 전부를 한 번에.
 * 두 모드는 같은 초안·같은 줄 컴포넌트·같은 `createPbSessGatherings` 를 쓴다 — 필드 정의가 둘이 되지 않게.
 */
export function PbSessOpenDialog({
  evtId,
  board,
  only,
  open,
  onOpenChange,
  onDone,
}: {
  evtId: string;
  board: PbClassBoard;
  only?: SessOpenOnly;
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
      const picked = only
        ? only.sessType === "MEASURE"
          ? res.measureDraft
            ? [res.measureDraft]
            : []
          : res.drafts.filter((d) => d.wkNo === only.wkNo)
        : res.drafts;
      setRows(toRows(picked));
      setMeasureLinked(res.measureLinked);
      // 공통 값은 초안이 이미 정한 값을 존중한다(없으면 기본값)
      const first = picked[0] ?? res.measureDraft;
      setDurMin(first?.durMin ?? DEFAULT_DUR_MIN);
      setTime(first?.time ?? DEFAULT_TIME);
      setPlace(first?.locTxt ?? "");
    });
    return () => {
      cancelled = true;
    };
    // only 는 마운트 시점 값으로 충분하다 — 부모가 열 때마다 새로 마운트한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evtId]);

  const handleOpenChange = (next: boolean) => onOpenChange(next);

  const updateRow = (next: SessOpenRow) => {
    // 측정 줄의 주차는 날짜에서 나온다 — 날짜·시간을 고치면 같이 다시 계산한다.
    // 안 그러면 서버가 「초안은 N주차」로 거절한다(자리표시자 날짜를 바꾸는 게 정상 흐름이다).
    // key 는 그대로 둔다(줄 식별자라 주차가 바뀌어도 같은 줄이다).
    let fixed = next;
    if (next.draft.sessType === "MEASURE" && /^\d{4}-\d{2}-\d{2}$/.test(next.draft.date) && /^\d{2}:\d{2}$/.test(next.draft.time)) {
      const wkNo = weekNoOf(draftStartIso(next.draft), evtSttDt);
      fixed = { ...next, draft: { ...next.draft, wkNo } };
    }
    setRows((cur) => cur?.map((r) => (r.key === fixed.key ? fixed : r)) ?? cur);
  };

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

  const title = !only
    ? "공식훈련 벙 열기"
    : only.sessType === "MEASURE"
      ? "10K 측정 벙 열기"
      : `${wkLabel(only.wkNo)} 훈련벙 열기`;

  return (
    <ResponsiveDrawer open={open} onOpenChange={handleOpenChange}>
      <ResponsiveDrawerContent
        dialogClassName="max-w-lg max-h-[90dvh] flex flex-col gap-0 p-0 overflow-hidden"
        drawerClassName="h-[95dvh] max-h-[95dvh]"
      >
        <ResponsiveDrawerHeader className="shrink-0 border-b border-border px-4 py-4 text-left">
          <ResponsiveDrawerTitle>{title}</ResponsiveDrawerTitle>
          <ResponsiveDrawerDescription>
            {/* 한 주차만 열면 서버가 노티봇으로 단톡방에 공지한다. 한꺼번에 열면 도배라 안 보낸다(createPbSessGatherings) */}
            {only
              ? "벙은 정기런으로 열려요. 열면 노티봇이 단톡방에 공지해요."
              : "벙은 정기런으로 열려요. 한꺼번에 열면 단톡방 공지는 안 가요 — 주차마다 벙 공유의 「단톡방에 알림」으로 올려 주세요."}
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

          {rows && only && (
            <>
              {rows.length === 0 && <EmptyState variant="card" message="이미 벙이 열려 있어요." />}
              <SessOpenRowList
                rows={rows}
                evtSttDt={evtSttDt}
                plans={board.sessPlans}
                single
                onChange={updateRow}
              />
              {rows.length > 0 && (
                <div className="flex items-center gap-2 rounded-2xl bg-secondary/50 p-3">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={10}
                    step={5}
                    value={durMin}
                    aria-label="소요 시간(분)"
                    onChange={(e) => setDurMin(Number(e.target.value) || 0)}
                  />
                  <Caption className="shrink-0">분 진행</Caption>
                </div>
              )}
            </>
          )}

          {rows && !only && (
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
            {busy ? "여는 중..." : only ? "열기" : `벙 ${included.length}개 열기`}
          </Button>
        </div>
      </ResponsiveDrawerContent>
    </ResponsiveDrawer>
  );
}
