"use client";

import { useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import { toast } from "sonner";

import { setMyDaeguRecord } from "@/app/actions/pb-class";
import { wkLabel } from "@/lib/pb-class";
import { formatSec, parseTimeInput, type PbRecType, type PbRecValue } from "@/lib/pb-class-score";

import { Caption } from "@/components/common/typography";
import { Badge } from "@/components/ui/badge";
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
  /** 종료된 프로젝트(보관용) — 대구 기록 입력·수정 버튼을 전부 거둔다 */
  readOnly?: boolean;
};

/**
 * 회원 화면의 기록 이름. 코어의 `PB_REC_TYPE_LABEL`은 관리자 표의 짧은 이름(「W6 5K TT」)이라
 * 회원에겐 「6주차」로 풀어 쓴다(오너 지시 — 회원 화면엔 W 표기를 쓰지 않는다). 중간점검 주차는 rule 값이다.
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

/** 운영진 입력이라는 표시와 확인 대기 배지를 한 곳에서 — 값 옆에 같은 모양으로 붙는다 */
function PendingBadge() {
  return (
    <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning">
      확인 대기
    </Badge>
  );
}

/** 읽기 전용 기록 한 줄 — 값이 없으면 숫자 자리 대신 누가 넣는지 말한다 */
function ReadOnlyRow({ label, rec, last = false }: { label: string; rec: PbRecValue | undefined; last?: boolean }) {
  return (
    <div className={cn("flex min-h-11 items-center justify-between gap-3 py-2.5", !last && "border-b border-border")}>
      <Caption>{label}</Caption>
      {rec ? (
        <span className="flex items-center gap-2 text-sm font-medium tabular-nums text-foreground">
          {formatSec(rec.sec)}
          {!rec.cnfm && <PendingBadge />}
        </span>
      ) : (
        <Caption className="text-muted-foreground/70">{last ? "기록 없음" : "운영진이 입력해요"}</Caption>
      )}
    </div>
  );
}

/**
 * 대구마라톤 10K — 이 기록만 본인이 직접 올린다(대회는 운영진이 현장에 없으므로).
 * 올리면 「확인 대기」이고, 운영진이 확인하면 확정돼 더는 못 고친다.
 * 확정 여부는 서버가 다시 판정한다 — 여기서 버튼을 감추는 건 안내일 뿐이다.
 */
function DaeguRow({ evtId, rec }: { evtId: string; rec: PbRecValue | undefined }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const label = pbRecLabel("DAEGU_10K", 0);
  const locked = rec?.cnfm === true;
  const showForm = !rec || editing;

  function run(next: number | null, doneMessage: string) {
    startTransition(async () => {
      try {
        const res = await setMyDaeguRecord(evtId, next);
        if (!res.ok) {
          setError(res.message ?? "저장하지 못했어요. 다시 시도해 주세요.");
          return;
        }
        toast.success(res.message ?? doneMessage);
        setEditing(false);
        setDraft("");
        router.refresh();
      } catch {
        toast.error("저장하지 못했어요. 다시 시도해 주세요.");
      }
    });
  }

  function save() {
    const sec = parseTimeInput(draft);
    if (sec === null || sec < RECORD_FLOOR_SEC) {
      setError("분:초 또는 시:분:초로 입력해 주세요 (예: 52:30)");
      return;
    }
    setError(null);
    run(sec, "기록을 올렸어요. 운영진이 확인하면 확정돼요.");
  }

  function openEdit() {
    setDraft(rec ? formatSec(rec.sec) : "");
    setError(null);
    setEditing(true);
  }

  return (
    <div className="flex flex-col gap-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <Caption>{label}</Caption>
        {rec && !showForm && (
          <span className="flex items-center gap-2 text-sm font-medium tabular-nums text-foreground">
            {formatSec(rec.sec)}
            {rec.cnfm ? <Caption>확인됨</Caption> : <PendingBadge />}
          </span>
        )}
      </div>

      {rec && !showForm && !locked && (
        <div className="flex gap-2">
          <Button variant="outline" className="h-11 flex-1 rounded-xl" onClick={openEdit} disabled={pending}>
            고치기
          </Button>
          {/* 확인 전 기록만 지울 수 있다 — 확정된 기록은 운영진 몫이라 이 버튼이 아예 없다 */}
          <Button
            variant="ghost"
            className="h-11 rounded-xl px-4"
            onClick={() => run(null, "기록을 지웠어요")}
            disabled={pending}
          >
            지우기
          </Button>
        </div>
      )}

      {showForm && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="flex gap-2">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="예) 52:30 또는 5230"
              aria-label={label}
              aria-invalid={error !== null}
              autoComplete="off"
              className="h-11 flex-1"
            />
            <Button type="submit" disabled={pending} className="h-11 rounded-xl px-5">
              {pending ? "저장 중" : rec ? "저장" : "올리기"}
            </Button>
            {editing && (
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                className="h-11 rounded-xl px-3"
                onClick={() => setEditing(false)}
              >
                취소
              </Button>
            )}
          </div>
          {error && (
            <Caption role="alert" className="text-destructive">
              {error}
            </Caption>
          )}
        </form>
      )}
    </div>
  );
}

/**
 * 내 기록 — 5K·10K 측정 기록은 운영진이 넣고(읽기 전용), 대구마라톤 10K만 본인이 올린다.
 *
 * 보여 주는 줄은 합류 시점에 따라 갈린다. 점수 계산이 그렇게 갈리기 때문이다:
 * - W1 정식: 기준(W1 5K) · 중간(W6 5K) · 최종 10K
 * - W2~W5 합류: W1 기록이 없다 — W6 5K가 곧 기준기록이라 그 줄을 「기준」으로 부른다
 * - W6+ 늦은 합류: 기록 점수가 없다 — 최종 10K만 남는다(목표 달성 배지용)
 */
export function PbRecordsCard({ evtId, recs, joinWkNo, late, midWkNo, readOnly = false }: PbRecordsCardProps) {
  const midIsBase = !late && joinWkNo > 1;
  const types: PbRecType[] = late
    ? ["FINAL_10K"]
    : joinWkNo === 1
      ? ["BASE_5K", "MID_5K", "FINAL_10K"]
      : ["MID_5K", "FINAL_10K"];

  return (
    <PbZone label="Records" lead="재는 날의 기록은 운영진이 적어요">
      <CardItem className="flex flex-col py-1">
        {types.map((t) => (
          <ReadOnlyRow
            key={t}
            label={pbRecLabel(t, midWkNo, midIsBase)}
            rec={recs[t]}
          />
        ))}
        {readOnly ? (
          <ReadOnlyRow label={pbRecLabel("DAEGU_10K", midWkNo)} rec={recs.DAEGU_10K} last />
        ) : (
          <DaeguRow evtId={evtId} rec={recs.DAEGU_10K} />
        )}
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
