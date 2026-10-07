"use client";

import { useState } from "react";

import { Check, Pencil, Plus, Trash2 } from "lucide-react";

import {
  createPbMission,
  deletePbMission,
  seedPbDefaultMissions,
  setPbMissionResult,
  updatePbMission,
} from "@/app/actions/admin/manage-pb-class-game";
import { midImprovedRatio, PB_DEFAULT_MISSIONS } from "@/lib/pb-class-score";
import type { PbGame } from "@/lib/queries/pb-class-game";
import { cn } from "@/lib/utils";

import {
  ResponsiveDrawer,
  ResponsiveDrawerContent,
  ResponsiveDrawerDescription,
  ResponsiveDrawerHeader,
  ResponsiveDrawerTitle,
} from "@/components/common/responsive-drawer";
import { Body, Caption } from "@/components/common/typography";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardItem } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { GroupDot } from "./pb-game-parts";
import type { PbRun } from "./use-pb-game";

type Mission = PbGame["missions"][number];

/** 주차 없는 미션(측정 일정)은 Select value로 이 문자열을 쓴다 — 빈 문자열은 Radix가 못 쓴다 */
const MEASURE = "__measure__";

type MissionValues = { wkNo: number | null; msnNm: string; pt: number };

function MissionForm({
  initial,
  maxWk,
  busy,
  submitLabel,
  onSubmit,
}: {
  initial: { wkNo: number | null; msnNm: string; pt: string };
  maxWk: number;
  busy: boolean;
  submitLabel: string;
  onSubmit: (values: MissionValues) => void;
}) {
  const [wk, setWk] = useState(initial.wkNo === null ? MEASURE : String(initial.wkNo));
  const [name, setName] = useState(initial.msnNm);
  const [pt, setPt] = useState(initial.pt);

  const ptNum = /^\d+$/.test(pt.trim()) ? Number(pt.trim()) : Number.NaN;
  const valid = name.trim().length > 0 && Number.isInteger(ptNum);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4 pt-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">주차</span>
          <Select value={wk} onValueChange={setWk}>
            <SelectTrigger className="h-12 rounded-xl border-[1.5px] text-[15px]" aria-label="미션 주차">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: maxWk }, (_, i) => i + 1).map((n) => (
                <SelectItem key={n} value={String(n)}>
                  W{n}
                </SelectItem>
              ))}
              <SelectItem value={MEASURE}>측정 일정 (주차 없음)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="pb-msn-name" className="text-sm font-medium text-foreground">
            미션
          </label>
          <Input
            id="pb-msn-name"
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 팀 전원 단체사진"
            className="h-12 rounded-xl border-[1.5px] text-[15px]"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="pb-msn-pt" className="text-sm font-medium text-foreground">
            성공 시 팀 점수
          </label>
          <div className="flex items-center gap-2">
            <Input
              id="pb-msn-pt"
              type="number"
              inputMode="numeric"
              min={0}
              value={pt}
              onChange={(e) => setPt(e.target.value)}
              className="h-12 rounded-xl border-[1.5px] text-[15px]"
            />
            <Caption className="w-10 shrink-0">점</Caption>
          </div>
        </div>
      </div>
      <div className="shrink-0 border-t border-border p-4">
        <Button
          disabled={!valid || busy}
          onClick={() => onSubmit({ wkNo: wk === MEASURE ? null : Number(wk), msnNm: name.trim(), pt: ptNum })}
          className="h-[52px] w-full rounded-xl text-base font-semibold"
        >
          {busy ? "저장 중..." : submitLabel}
        </Button>
      </div>
    </div>
  );
}

/** 팀 미션 — 팀별 성공 토글, 추가·수정·삭제, 기본 7개 불러오기 */
export function PbMissionSection({
  game,
  evtId,
  run,
  busyKey,
}: {
  game: PbGame;
  evtId: string;
  run: PbRun;
  busyKey: string | null;
}) {
  const { groups, missions, rule } = game;
  const locked = busyKey !== null;
  // 닫을 때 open만 내린다 — 값까지 비우면 닫히는 동안 폼이 「추가」로 깜빡 바뀐다
  const [dialog, setDialog] = useState<{ open: boolean; key: string; target: Mission | null }>({
    open: false,
    key: "init",
    target: null,
  });
  const [dialogSeq, setDialogSeq] = useState(0);

  // 주차 순(측정=주차 없음은 맨 뒤), 같은 주차는 sortOrd 순
  const sorted = [...missions].sort(
    (a, b) => (a.wkNo ?? Number.POSITIVE_INFINITY) - (b.wkNo ?? Number.POSITIVE_INFINITY) || a.sortOrd - b.sortOrd,
  );

  const openCreate = () => {
    setDialogSeq((n) => n + 1);
    setDialog({ open: true, key: `create:${dialogSeq + 1}`, target: null });
  };
  const openEdit = (m: Mission) => setDialog({ open: true, key: `edit:${m.msnId}`, target: m });

  const handleSubmit = async (values: MissionValues) => {
    const t = dialog.target;
    const ok = t
      ? await run(`msn:edit:${t.msnId}`, () => updatePbMission(t.msnId, { ...values, sortOrd: t.sortOrd }), "미션을 수정했어요")
      : await run("msn:create", () => createPbMission(evtId, values), "미션을 추가했어요");
    if (ok) setDialog((d) => ({ ...d, open: false }));
  };

  const handleDelete = (m: Mission) => {
    if (!confirm(`"${m.msnNm}" 미션을 삭제할까요?\n팀별 성공 기록도 함께 사라져요.`)) return;
    void run(`msn:delete:${m.msnId}`, () => deletePbMission(m.msnId), "미션을 삭제했어요");
  };

  const handleSeed = () => {
    if (!confirm(`기본 미션 ${PB_DEFAULT_MISSIONS.length}개를 불러올까요?`)) return;
    void run("msn:seed", () => seedPbDefaultMissions(evtId), "기본 미션을 불러왔어요");
  };

  /** W6 중간점검 미션 판정 보조 — 팀별 「기준기록 대비 빨라짐 n/m명」. 판정은 관리자가 한다 */
  const midHint = (m: Mission) => {
    if (m.wkNo !== rule.midWkNo) return null;
    const rows = groups.map((g) => ({
      g,
      ratio: midImprovedRatio(game.participants.filter((p) => p.aprvYn && p.grpId === g.grpId)),
    }));
    return (
      <Caption>
        기준기록 대비 빨라짐 —{" "}
        {rows.map(({ g, ratio }, i) => (
          <span key={g.grpId}>
            {i > 0 && " · "}
            {g.grpNm} {ratio ? `${ratio.improved}/${ratio.eligible}명` : "대상 없음"}
          </span>
        ))}
      </Caption>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <Caption className="text-foreground">미션 {missions.length}개</Caption>
        <Button variant="outline" className="h-11 gap-1.5 rounded-xl" onClick={openCreate} disabled={locked}>
          <Plus className="size-4" />미션 추가
        </Button>
      </div>

      {missions.length === 0 && (
        <CardItem variant="dashed" className="flex flex-col items-center gap-3">
          <Caption>등록된 미션이 없어요.</Caption>
          <Button className="h-11 rounded-xl" onClick={handleSeed} disabled={locked}>
            기본 미션 {PB_DEFAULT_MISSIONS.length}개 불러오기
          </Button>
        </CardItem>
      )}

      {sorted.map((m) => (
        <CardItem key={m.msnId} className="flex flex-col gap-3">
          <div className="flex items-start gap-2">
            <Badge variant={m.wkNo === null ? "default" : "outline"} className="shrink-0">
              {m.wkNo === null ? "측정" : `W${m.wkNo}`}
            </Badge>
            <Body className="min-w-0 flex-1 font-semibold">{m.msnNm}</Body>
            <Caption className="shrink-0 font-semibold text-foreground">+{m.pt}점</Caption>
          </div>

          {groups.length === 0 ? (
            <Caption>게임팀을 먼저 만들어 주세요.</Caption>
          ) : (
            <div className="flex flex-wrap gap-2">
              {groups.map((g) => {
                const succ = m.succGrpIds.includes(g.grpId);
                return (
                  <button
                    key={g.grpId}
                    type="button"
                    aria-pressed={succ}
                    disabled={locked}
                    onClick={() =>
                      void run(
                        `msn:result:${m.msnId}:${g.grpId}`,
                        () => setPbMissionResult(m.msnId, g.grpId, !succ),
                        succ ? "성공을 취소했어요" : "성공으로 기록했어요",
                      )
                    }
                    className={cn(
                      "inline-flex h-11 items-center gap-1.5 rounded-xl border-[1.5px] px-3 transition-colors disabled:opacity-50",
                      succ ? "border-success bg-success/10" : "border-border",
                    )}
                  >
                    <GroupDot colorNo={g.colorNo} />
                    <Caption className="text-foreground">{g.grpNm}</Caption>
                    {succ && <Check className="size-4 text-success" aria-hidden />}
                  </button>
                );
              })}
            </div>
          )}

          {midHint(m)}

          <div className="flex justify-end gap-2">
            <Button
              size="icon"
              variant="outline"
              className="size-11 rounded-lg"
              disabled={locked}
              onClick={() => openEdit(m)}
              aria-label={`${m.msnNm} 수정`}
            >
              <Pencil className="size-4" />
            </Button>
            <Button
              size="icon"
              variant="outline"
              className="size-11 rounded-lg text-destructive hover:text-destructive"
              disabled={locked}
              onClick={() => handleDelete(m)}
              aria-label={`${m.msnNm} 삭제`}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </CardItem>
      ))}

      <ResponsiveDrawer open={dialog.open} onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))}>
        <ResponsiveDrawerContent
          dialogClassName="max-w-md max-h-[85dvh] flex flex-col gap-0 p-0 overflow-hidden"
          drawerClassName="max-h-[85dvh]"
        >
          <ResponsiveDrawerHeader className="shrink-0 border-b border-border px-4 py-4 text-left">
            <ResponsiveDrawerTitle>{dialog.target ? "미션 수정" : "미션 추가"}</ResponsiveDrawerTitle>
            <ResponsiveDrawerDescription>
              팀이 성공하면 팀 점수에 더해져요. 성공 여부는 미션 카드에서 팀별로 눌러 기록해요.
            </ResponsiveDrawerDescription>
          </ResponsiveDrawerHeader>
          <MissionForm
            key={dialog.key}
            initial={{
              wkNo: dialog.target ? dialog.target.wkNo : 1,
              msnNm: dialog.target?.msnNm ?? "",
              pt: String(dialog.target?.pt ?? 10),
            }}
            maxWk={Math.max(1, game.cfg.totSessCnt - 1, dialog.target?.wkNo ?? 0)}
            busy={busyKey === "msn:create" || (busyKey?.startsWith("msn:edit:") ?? false)}
            submitLabel={dialog.target ? "저장" : "추가"}
            onSubmit={(values) => void handleSubmit(values)}
          />
        </ResponsiveDrawerContent>
      </ResponsiveDrawer>
    </div>
  );
}
