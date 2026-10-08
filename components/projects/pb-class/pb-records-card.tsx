"use client";

import { useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import { toast } from "sonner";

import { setMyPbRecord } from "@/app/actions/pb-class";
import { wkLabel } from "@/lib/pb-class";
import { formatSec, parseTimeInput, type PbRecType, type PbRecValue } from "@/lib/pb-class-score";

import { Caption } from "@/components/common/typography";
import { Button } from "@/components/ui/button";
import { CardItem } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PbZone } from "./pb-zone";

/** 10K 10분 미만은 사람이 낼 수 있는 기록이 아니다 — "55"를 초로 읽어 저장하는 오타만 막는 바닥값 */
const RECORD_FLOOR_SEC = 600;

type PbRecordsCardProps = {
  evtId: string;
  recs: Partial<Record<PbRecType, PbRecValue>>;
  joinWkNo: number;
  late: boolean;
  /** 중간점검 주차 — 중간 합류자의 기준기록이 이 주의 5K 라서 문구에 쓴다 */
  midWkNo: number;
  /** 종료된 프로젝트(보관용) — 기록 올리기·고치기·지우기 버튼을 전부 거둔다 */
  readOnly?: boolean;
};

/**
 * 회원 화면의 기록 이름. 코어의 `PB_REC_TYPE_LABEL`은 중간점검 주차를 6으로 못박은 기본 문구라
 * 회원에겐 rule 값(`midWkNo`)으로 풀어 쓴다 — 관리자가 중간점검 주차를 옮기면 화면도 따라간다.
 * 회원 화면엔 W 표기를 쓰지 않는다(오너 지시) — 「W6」이 아니라 「6주차」.
 */
export function pbRecLabel(t: PbRecType, midWkNo: number, midIsBase = false): string {
  switch (t) {
    case "BASE_5K":
      return "1주차 5K · 기준기록";
    case "MID_5K":
      return midIsBase ? `${wkLabel(midWkNo)} 5K · 기준기록` : `${wkLabel(midWkNo)} 5K · 중간점검`;
    case "FINAL_10K":
      return "10K 측정 · 최종";
    case "DAEGU_10K":
      return "대구마라톤 10K";
  }
}

/**
 * 합류 시점별로 **본인이 올릴 수 있는 기록**. 점수 계산이 그렇게 갈리기 때문이고, 서버 액션도 같은
 * 규칙으로 막는다(여기서 줄을 안 세우는 건 안내일 뿐이다).
 * - 1주차 정식: 기준(1주차 5K) · 중간(6주차 5K) · 최종 10K · 대구
 * - 2~5주차 합류: 1주차 기록이 없다 — 6주차 5K가 곧 기준기록이라 그 줄을 「기준」으로 부른다
 * - 6주차~ 늦은 합류: 기록 점수가 없다 — 최종 10K(목표 달성 배지용)와 대구만 남는다
 */
export function pbRecTypesOf(joinWkNo: number, late: boolean): PbRecType[] {
  if (late) return ["FINAL_10K", "DAEGU_10K"];
  if (joinWkNo === 1) return ["BASE_5K", "MID_5K", "FINAL_10K", "DAEGU_10K"];
  return ["MID_5K", "FINAL_10K", "DAEGU_10K"];
}

/** 읽기 전용 기록 한 줄 — 보관용(종료된 프로젝트)에서 쓴다 */
function ReadOnlyRow({ label, rec, last }: { label: string; rec: PbRecValue | undefined; last: boolean }) {
  return (
    <div className={cn("flex min-h-12 items-center justify-between gap-3 py-2", !last && "border-b border-border")}>
      <Caption>{label}</Caption>
      {rec ? (
        <span className="text-sm font-medium tabular-nums text-foreground">{formatSec(rec.sec)}</span>
      ) : (
        <Caption className="text-muted-foreground/70">기록 없음</Caption>
      )}
    </div>
  );
}

/**
 * 기록 입력 폼 — 입력칸 + 저장, 그 아래 지우기·취소.
 *
 * 줄이 네 개라 입력칸을 줄마다 상시로 세우면 카드가 입력창 네 개로 도배된다. 그래서 줄의 「올리기·고치기」를
 * 눌러야 이 폼이 열린다. 지우기·취소는 둘째 줄로 내린다 — 295px 안쪽 폭에 입력칸+저장+취소+지우기를
 * 한 줄에 넣으면 입력칸이 손가락 한 마디로 줄어든다.
 */
export function PbRecordForm({
  label,
  rec,
  pending,
  error,
  onSave,
  onClear,
  onCancel,
}: {
  label: string;
  rec: PbRecValue | undefined;
  pending: boolean;
  error: string | null;
  onSave: (draft: string) => void;
  onClear: () => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(rec ? formatSec(rec.sec) : "");

  return (
    <form
      className="flex flex-col gap-1 pb-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(draft);
      }}
    >
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="예) 24:30 또는 2430"
          aria-label={label}
          aria-invalid={error !== null}
          autoComplete="off"
          autoFocus
          className="h-11 flex-1"
        />
        <Button type="submit" disabled={pending} className="h-11 rounded-xl px-5">
          {pending ? "저장 중" : rec ? "저장" : "올리기"}
        </Button>
      </div>
      {error && (
        <Caption role="alert" className="text-destructive">
          {error}
        </Caption>
      )}
      <div className="flex items-center justify-end gap-1">
        {/* 지우기는 올려 둔 기록이 있을 때만 — 지울 게 없는 폼에 서 있으면 취소와 헷갈린다 */}
        {rec && (
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            className="mr-auto h-11 rounded-xl px-3 text-destructive hover:text-destructive"
            onClick={onClear}
          >
            지우기
          </Button>
        )}
        <Button type="button" variant="ghost" disabled={pending} className="h-11 rounded-xl px-3" onClick={onCancel}>
          취소
        </Button>
      </div>
    </form>
  );
}

/**
 * 기록 한 줄 — 값(있으면)과 「올리기·고치기」. 누르면 줄 아래로 폼이 펼쳐진다.
 *
 * 5K·10K·대구 **전부 본인이 직접 올린다**(오너 지시 2026-10-07: "기록을 왜 운영진이 적어 — 자기가 적어").
 * 올리면 바로 점수에 들어가므로 「확인 대기」 같은 중간 상태가 없다. 확정·권한은 서버 액션이 다시
 * 판정한다 — 여기서 버튼을 감추는 건 안내일 뿐이다.
 */
function RecordRow({
  evtId,
  type,
  label,
  rec,
  last,
}: {
  evtId: string;
  type: PbRecType;
  label: string;
  rec: PbRecValue | undefined;
  last: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function run(next: number | null, doneMessage: string) {
    startTransition(async () => {
      try {
        const res = await setMyPbRecord(evtId, type, next);
        if (!res.ok) {
          setError(res.message ?? "저장하지 못했어요. 다시 시도해 주세요.");
          return;
        }
        toast.success(res.message ?? doneMessage);
        setEditing(false);
        setError(null);
        router.refresh();
      } catch {
        toast.error("저장하지 못했어요. 다시 시도해 주세요.");
      }
    });
  }

  function save(draft: string) {
    const sec = parseTimeInput(draft);
    if (sec === null || sec < RECORD_FLOOR_SEC) {
      setError("분:초 또는 시:분:초로 입력해 주세요 (예: 24:30)");
      return;
    }
    setError(null);
    run(sec, "기록을 올렸어요. 바로 점수에 반영돼요.");
  }

  return (
    <div className={cn("flex flex-col", !last && "border-b border-border")}>
      <div className="flex min-h-14 items-center justify-between gap-3 py-2">
        <Caption>{label}</Caption>
        <span className="flex items-center gap-1">
          {rec && <span className="text-sm font-medium tabular-nums text-foreground">{formatSec(rec.sec)}</span>}
          {!editing && (
            <Button
              type="button"
              variant={rec ? "ghost" : "outline"}
              // 같은 말이 줄마다 반복되므로 스크린리더엔 어느 기록인지 함께 읽힌다
              aria-label={`${label} ${rec ? "고치기" : "올리기"}`}
              className={cn("h-10 rounded-xl", rec ? "px-3 text-primary hover:text-primary" : "px-4")}
              onClick={() => {
                setError(null);
                setEditing(true);
              }}
            >
              {rec ? "고치기" : "올리기"}
            </Button>
          )}
        </span>
      </div>

      {editing && (
        <PbRecordForm
          label={label}
          rec={rec}
          pending={pending}
          error={error}
          onSave={save}
          onClear={() => run(null, "기록을 지웠어요")}
          onCancel={() => {
            setEditing(false);
            setError(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * 내 기록 — 5K·10K·대구마라톤 기록을 **본인이 직접** 올린다. 올리면 바로 점수에 반영된다.
 *
 * 보여 주는 줄은 합류 시점에 따라 갈린다(`pbRecTypesOf`). 종료된 프로젝트(보관용)는 값만 보여 주고
 * 입력 어포던스를 전부 거둔다.
 */
export function PbRecordsCard({ evtId, recs, joinWkNo, late, midWkNo, readOnly = false }: PbRecordsCardProps) {
  const midIsBase = !late && joinWkNo > 1;
  const types = pbRecTypesOf(joinWkNo, late);

  return (
    <PbZone
      label="Records"
      lead={readOnly ? "이 프로젝트에 남은 기록이에요" : "기록은 직접 올려요 — 올리면 바로 점수에 반영돼요"}
    >
      <CardItem className="flex flex-col py-1">
        {types.map((t, i) => {
          const label = pbRecLabel(t, midWkNo, midIsBase);
          const last = i === types.length - 1;
          return readOnly ? (
            <ReadOnlyRow key={t} label={label} rec={recs[t]} last={last} />
          ) : (
            <RecordRow key={t} evtId={evtId} type={t} label={label} rec={recs[t]} last={last} />
          );
        })}
      </CardItem>
      {midIsBase && (
        <Caption className="leading-relaxed">
          {wkLabel(joinWkNo)} 합류라 기준기록은 {wkLabel(midWkNo)} 5K 기록이에요.
        </Caption>
      )}
      {late && (
        <Caption className="leading-relaxed">
          늦은 합류는 기록 점수가 없어요. 10K 기록이 목표 이내면 「목표 달성」 배지를 받아요.
        </Caption>
      )}
    </PbZone>
  );
}
