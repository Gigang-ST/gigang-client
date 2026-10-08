"use client";

import { useMemo, useState } from "react";

import { ArrowDown, ArrowUp, Pencil, Plus, Shuffle, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  assignPbParticipants,
  createPbGroup,
  deletePbGroup,
  updatePbGroup,
} from "@/app/actions/admin/manage-pb-class-game";
import { wkLabel } from "@/lib/pb-class";
import { PB_TRN_GROUPS, trnGroupNm } from "@/lib/pb-class-plan";
import type { PbGame, PbGameParticipant } from "@/lib/queries/pb-class-game";

import { Avatar } from "@/components/common/avatar";
import { EmptyState } from "@/components/common/empty-state";
import { Body, Caption, Micro } from "@/components/common/typography";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardItem } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import {
  AutoTrnGroupLabel,
  GroupDot,
  PB_GROUP_COLOR_NOS,
  PbGameLoadError,
  PbGameSkeleton,
  TrnGroupLabel,
} from "./pb-game-parts";
import { PbGroupDialog, type PbGroupFormValues } from "./pb-group-dialog";
import { usePbGame, type PbRun } from "./use-pb-game";

/**
 * 훈련팀 선택지 코드 — 표준 5개(`PB_TRN_GROUPS`) + 이미 배정돼 있는데 목록에 없는 코드.
 *
 * 훈련팀은 공식훈련을 나눠 뛰는 팀이라 게임팀과 별개 축이다. 운영진이 D1·D2처럼 쪼갠 코드가 DB에 있으면
 * Radix Select는 value와 맞는 항목이 없을 때 트리거를 비워 버려 「배정 안 됨」으로 오독하게 된다 —
 * 쓰이는 코드는 선택지에 같이 세워 이름(없으면 코드 그대로)이 보이게 한다.
 */
export function trnGroupCodes(used: readonly (string | null)[]): string[] {
  const std = PB_TRN_GROUPS.map((g) => g.cd);
  const extra = [...new Set(used.filter((c): c is string => !!c && !std.includes(c)))].sort();
  return [...std, ...extra];
}
/**
 * Radix Select는 빈 문자열 value를 못 쓴다 — null은 이 값으로 대신하고 저장 때 null로 되돌린다.
 * 훈련팀에선 null이 「자동」(목표·기록으로 정해짐), 게임팀에선 「없음」이다.
 */
const NONE = "__none__";

/**
 * 편성 저장값. **`trnGrpCd`는 운영진 고정값(원값)**이다 — 화면이 보여 주는 실제 팀(고정 ?? 자동)이 아니다.
 * 실제 팀으로 비교하면 자동인 사람이 전부 「바뀐 행」으로 잡히고, 저장하는 순간 자동 팀이 고정으로 굳는다.
 */
type Assign = { trnGrpCd: string | null; grpId: string | null };

const sameAssign = (a: Assign, b: Assign) => a.trnGrpCd === b.trnGrpCd && a.grpId === b.grpId;

/** 5K 기준기록 오름차순(빠른 순). 기록 없는 사람은 맨 뒤 */
const byBase5k = (a: PbGameParticipant, b: PbGameParticipant) => {
  const x = a.recs.BASE_5K?.sec ?? Number.POSITIVE_INFINITY;
  const y = b.recs.BASE_5K?.sec ?? Number.POSITIVE_INFINITY;
  if (x === y) return a.memNm.localeCompare(b.memNm, "ko");
  return x - y;
};

export function PbTeamsTab({ evtId }: { evtId: string }) {
  const { game, loading, error, reload, run, busyKey } = usePbGame(evtId);

  if (loading) return <PbGameSkeleton />;
  if (!game) return <PbGameLoadError message={error} onRetry={() => void reload()} />;
  return <TeamsBody game={game} evtId={evtId} run={run} busyKey={busyKey} />;
}

function TeamsBody({
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
  const { groups } = game;
  const locked = busyKey !== null;
  const approved = useMemo(() => game.participants.filter((p) => p.aprvYn), [game.participants]);
  const trnCodes = useMemo(() => trnGroupCodes(game.participants.map((p) => p.trnGrpFixedCd)), [game.participants]);
  const groupIds = useMemo(() => new Set(groups.map((g) => g.grpId)), [groups]);

  // 배정은 「서버 값 위에 덮은 변경분」만 로컬에 든다. 서버 값을 state로 복사해 두면 재조회 때마다
  // 동기화 이펙트가 필요하고, 그 틈에 사람이 고친 값이 날아간다 — 변경분만 들면 저장 후 비우는 것으로 끝난다.
  const [drafts, setDrafts] = useState<Record<string, Assign>>({});

  const baseOf = (p: PbGameParticipant): Assign => ({ trnGrpCd: p.trnGrpFixedCd, grpId: p.grpId });
  /** 지금 화면에 보이는 값 — 삭제돼 사라진 팀을 가리키는 변경분은 미배정으로 본다 */
  const viewOf = (p: PbGameParticipant): Assign => {
    const d = drafts[p.prtId] ?? baseOf(p);
    return { trnGrpCd: d.trnGrpCd, grpId: d.grpId && groupIds.has(d.grpId) ? d.grpId : null };
  };

  const setAssign = (p: PbGameParticipant, patch: Partial<Assign>) => {
    const next = { ...viewOf(p), ...patch };
    setDrafts((prev) => {
      const copy = { ...prev };
      // 서버 값과 같아지면 변경분에서 뺀다 — 「저장 n건」 표시가 거짓말을 안 하게
      if (sameAssign(next, baseOf(p))) delete copy[p.prtId];
      else copy[p.prtId] = next;
      return copy;
    });
  };

  const changed = approved.filter((p) => !sameAssign(viewOf(p), baseOf(p)));

  // 팀 인원 — 팀전 대상(늦은 합류 제외)만 센다. 늦은 합류자는 팀 평균에 안 들어가므로 인원에도 안 넣는다.
  const counts = new Map<string, number>(groups.map((g) => [g.grpId, 0]));
  let unassigned = 0;
  for (const p of approved) {
    if (p.late) continue;
    const gid = viewOf(p).grpId;
    if (gid) counts.set(gid, (counts.get(gid) ?? 0) + 1);
    else unassigned += 1;
  }
  const countValues = [...counts.values()];
  const gap = countValues.length >= 2 ? Math.max(...countValues) - Math.min(...countValues) : 0;

  const lateCnt = approved.filter((p) => p.late).length;

  /* ---------- 게임팀 CRUD ---------- */

  // 닫을 때 open만 내리고 나머지는 둔다 — 비우면 닫히는 애니메이션 동안 폼이 「추가」 모드로 깜빡 바뀐다
  const [dialog, setDialog] = useState<{
    open: boolean;
    mode: "create" | "edit";
    key: string;
    grpId?: string;
    index?: number;
  }>({ open: false, mode: "create", key: "init" });
  const [dialogSeq, setDialogSeq] = useState(0);

  const usedColorNos = (exceptGrpId?: string) =>
    groups.filter((g) => g.grpId !== exceptGrpId && g.colorNo != null).map((g) => g.colorNo as number);

  const openCreate = () => {
    setDialogSeq((n) => n + 1);
    setDialog({ open: true, mode: "create", key: `create:${dialogSeq + 1}` });
  };
  const openEdit = (grpId: string, index: number) => setDialog({ open: true, mode: "edit", key: `edit:${grpId}`, grpId, index });

  const editTarget = dialog.mode === "edit" ? groups.find((g) => g.grpId === dialog.grpId) : undefined;
  const createInitial: PbGroupFormValues = {
    grpNm: "",
    // 안 쓰는 색부터 고른다 — 같은 색이 겹치면 점수판에서 팀을 가를 수 없다
    colorNo: PB_GROUP_COLOR_NOS.find((n) => !usedColorNos().includes(n)) ?? 1,
  };

  const handleGroupSubmit = async (values: PbGroupFormValues) => {
    let ok: boolean;
    if (dialog.mode === "edit" && dialog.grpId !== undefined) {
      const { grpId, index = 0 } = dialog;
      // 순서는 목록 위치를 sortOrd로 쓴다 — 이동 버튼도 같은 규칙이라 둘이 어긋나지 않는다
      ok = await run(`group:edit:${grpId}`, () => updatePbGroup(grpId, { ...values, sortOrd: index }), "팀을 수정했어요");
    } else {
      ok = await run("group:create", () => createPbGroup(evtId, values), "팀을 만들었어요");
    }
    if (ok) setDialog((d) => ({ ...d, open: false }));
  };

  const handleDeleteGroup = (grpId: string, name: string) => {
    if (!confirm(`"${name}" 팀을 삭제할까요?\n이 팀의 배정도 함께 사라질 수 있어요.`)) return;
    void run(`group:delete:${grpId}`, () => deletePbGroup(grpId), "팀을 삭제했어요");
  };

  /**
   * 순서 이동 — 바꾼 두 팀만이 아니라 **전원의 sortOrd를 목록 위치로 다시 매긴다**.
   * 처음 만든 팀들의 sortOrd가 전부 같은 값(0)일 수 있어서, 둘만 바꾸면 나머지와 동률로 남아 순서가 흔들린다.
   */
  const moveGroup = (index: number, dir: -1 | 1) => {
    const to = index + dir;
    if (to < 0 || to >= groups.length) return;
    const next = [...groups];
    [next[index], next[to]] = [next[to], next[index]];
    void run(
      `group:move:${index}`,
      async () => {
        for (let i = 0; i < next.length; i += 1) {
          const g = next[i];
          const res = await updatePbGroup(g.grpId, { grpNm: g.grpNm, colorNo: g.colorNo ?? 1, sortOrd: i });
          if (!res.ok) return res;
        }
        return { ok: true, message: null };
      },
      "순서를 바꿨어요",
    );
  };

  /* ---------- 배정 ---------- */

  /**
   * 뱀 드래프트 — 미배정 팀전 대상자를 5K 기준기록 빠른 순으로 세워 1→n, n→1 으로 번갈아 나눈다.
   * 빠른 사람부터 한 줄로 배분하면 1번 팀만 계속 강해지므로 왕복(snake)으로 실력을 고르게 편다.
   * 로컬 변경분만 채운다 — 저장은 관리자가 직접 누른다(되돌릴 수 있게).
   */
  const snakeDraft = () => {
    if (groups.length === 0) {
      toast.error("게임팀을 먼저 만들어 주세요.");
      return;
    }
    const pool = approved.filter((p) => !p.late && viewOf(p).grpId === null).sort(byBase5k);
    if (pool.length === 0) {
      toast.info("배정할 미배정 인원이 없어요.");
      return;
    }
    const n = groups.length;
    setDrafts((prev) => {
      const copy = { ...prev };
      pool.forEach((p, i) => {
        const pos = i % n;
        const idx = Math.floor(i / n) % 2 === 0 ? pos : n - 1 - pos;
        const next = { ...viewOf(p), grpId: groups[idx].grpId };
        if (sameAssign(next, baseOf(p))) delete copy[p.prtId];
        else copy[p.prtId] = next;
      });
      return copy;
    });
    toast.success(`${pool.length}명을 채웠어요. 확인 후 「배정 저장」을 눌러 주세요.`);
  };

  const handleSave = async () => {
    const rows = changed.map((p) => {
      const v = viewOf(p);
      return { prtId: p.prtId, trnGrpCd: v.trnGrpCd, grpId: v.grpId };
    });
    const ok = await run("assign", () => assignPbParticipants(evtId, rows), "배정을 저장했어요");
    if (ok) setDrafts({});
  };

  return (
    <div className="flex flex-col gap-6">
      {/* 게임팀 */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Body className="font-semibold">게임팀</Body>
          <Button variant="outline" className="h-11 gap-1.5 rounded-xl" onClick={openCreate} disabled={locked}>
            <Plus className="size-4" />팀 추가
          </Button>
        </div>

        {groups.length === 0 ? (
          <EmptyState variant="card" message="아직 게임팀이 없어요. 팀을 추가해 주세요." />
        ) : (
          groups.map((g, i) => (
            <CardItem key={g.grpId} className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <GroupDot colorNo={g.colorNo} className="size-4" />
                <Body className="min-w-0 flex-1 truncate font-semibold">{g.grpNm}</Body>
                <Caption className="shrink-0 text-foreground">{counts.get(g.grpId) ?? 0}명</Caption>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  size="icon"
                  variant="outline"
                  className="size-11 rounded-lg"
                  disabled={locked || i === 0}
                  onClick={() => moveGroup(i, -1)}
                  aria-label={`${g.grpNm} 위로`}
                >
                  <ArrowUp className="size-4" />
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  className="size-11 rounded-lg"
                  disabled={locked || i === groups.length - 1}
                  onClick={() => moveGroup(i, 1)}
                  aria-label={`${g.grpNm} 아래로`}
                >
                  <ArrowDown className="size-4" />
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  className="size-11 rounded-lg"
                  disabled={locked}
                  onClick={() => openEdit(g.grpId, i)}
                  aria-label={`${g.grpNm} 수정`}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  className="size-11 rounded-lg text-destructive hover:text-destructive"
                  disabled={locked}
                  onClick={() => handleDeleteGroup(g.grpId, g.grpNm)}
                  aria-label={`${g.grpNm} 삭제`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </CardItem>
          ))
        )}
      </section>

      {/* 배정 */}
      <section className="flex flex-col gap-3">
        <Body className="font-semibold">팀 배정</Body>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {groups.map((g) => (
            <span key={g.grpId} className="inline-flex items-center gap-1.5">
              <GroupDot colorNo={g.colorNo} />
              <Caption className="text-foreground">
                {g.grpNm} {counts.get(g.grpId) ?? 0}
              </Caption>
            </span>
          ))}
          <Caption>미배정 {unassigned}</Caption>
          {lateCnt > 0 && <Caption>팀전 제외 {lateCnt}</Caption>}
        </div>

        {gap > 1 && (
          <div className="rounded-lg bg-warning/10 p-2.5">
            <Caption className="text-warning">
              팀 인원 차이가 {gap}명이에요. 팀 인원은 ±1 이내로 — 늦게 온 사람은 인원 적은 팀에 넣어 주세요.
            </Caption>
          </div>
        )}

        <Button
          variant="outline"
          className="h-11 gap-1.5 rounded-xl"
          onClick={snakeDraft}
          disabled={locked || groups.length === 0}
        >
          <Shuffle className="size-4" />뱀 드래프트로 채우기
        </Button>
        <Caption>미배정 인원을 {wkLabel(1)} 5K 기록 빠른 순으로 세워 팀에 왕복 배분해요. 저장 전까지 바뀌지 않아요.</Caption>
        <Caption className="break-keep">
          훈련팀은 「자동」이면 목표와 최근 5K 기록(내 P)으로 정해지고, 기록이 바뀌면 따라 옮겨요. 다른 팀을 고르면 그 팀으로
          고정돼요.
        </Caption>

        {approved.length === 0 ? (
          <EmptyState variant="card" message="승인된 참가자가 없어요." />
        ) : (
          <div className="flex flex-col gap-2">
            {approved.map((p) => {
              const v = viewOf(p);
              const dirty = !sameAssign(v, baseOf(p));
              return (
                <CardItem
                  key={p.prtId}
                  className={dirty ? "flex flex-col gap-2.5 border-primary p-3" : "flex flex-col gap-2.5 p-3"}
                >
                  <div className="flex items-center gap-2">
                    <Avatar src={p.avatarUrl} seed={p.memId} size="sm" />
                    <Body className="min-w-0 truncate font-semibold">{p.memNm}</Body>
                    <Micro className="shrink-0">{wkLabel(p.joinWkNo)}</Micro>
                    {p.late && (
                      <Badge variant="outline" className="shrink-0">
                        팀전 제외
                      </Badge>
                    )}
                  </div>
                  {/* 라벨을 위가 아니라 왼쪽에 둔다 — 훈련팀 이름이 「첫 10K · 60분 이하 · E」처럼 길어서
                      반칸(약 150px) 트리거에는 안 들어간다. 한 줄씩 쌓으면 이름이 전부 읽힌다 */}
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <Micro className="w-12 shrink-0">훈련팀</Micro>
                      <Select
                        value={v.trnGrpCd ?? NONE}
                        onValueChange={(val) => setAssign(p, { trnGrpCd: val === NONE ? null : val })}
                        disabled={locked}
                      >
                        <SelectTrigger className="h-11 min-w-0 flex-1 rounded-lg" aria-label={`${p.memNm} 훈련팀`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {/* 자동이 기본이라 맨 위 — 고르는 건 예외(인원 맞추기·쪼갠 반)일 때뿐이다 */}
                          <SelectItem value={NONE}>
                            <AutoTrnGroupLabel cd={p.trnGrpAutoCd} />
                          </SelectItem>
                          {trnCodes.map((c) => (
                            <SelectItem key={c} value={c}>
                              <TrnGroupLabel cd={c} />
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {/* 고정한 사람은 기록이 올라도 안 옮겨 간다 — 자동이면 어디였을지 옆에 두어 되돌릴지 판단하게 한다.
                        들여쓰기는 라벨 칸(w-12) + 간격(gap-2)만큼 — 셀렉트 글자와 세로줄을 맞춘다 */}
                    {v.trnGrpCd !== null && (
                      <Micro className="-mt-1 pl-14">
                        고정 · 자동이면 {trnGroupNm(p.trnGrpAutoCd) ?? "기록 전"}
                      </Micro>
                    )}
                    <div className="flex items-center gap-2">
                      <Micro className="w-12 shrink-0">게임팀</Micro>
                      <Select
                        value={v.grpId ?? NONE}
                        onValueChange={(val) => setAssign(p, { grpId: val === NONE ? null : val })}
                        // 늦은 합류자는 팀전에서 빠진다 — 배정해도 점수에 안 들어가니 아예 못 고르게 한다
                        disabled={locked || p.late}
                      >
                        <SelectTrigger className="h-11 min-w-0 flex-1 rounded-lg" aria-label={`${p.memNm} 게임팀`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {groups.map((g) => (
                            <SelectItem key={g.grpId} value={g.grpId}>
                              <span className="flex items-center gap-2">
                                <GroupDot colorNo={g.colorNo} />
                                {g.grpNm}
                              </span>
                            </SelectItem>
                          ))}
                          <SelectItem value={NONE}>없음</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardItem>
              );
            })}
          </div>
        )}

        <Button
          onClick={() => void handleSave()}
          disabled={locked || changed.length === 0}
          className="h-[52px] w-full rounded-xl text-base font-semibold"
        >
          {busyKey === "assign" ? "저장 중..." : changed.length > 0 ? `배정 저장 (${changed.length}명)` : "배정 저장"}
        </Button>
      </section>

      <PbGroupDialog
        open={dialog.open}
        onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))}
        mode={dialog.mode}
        formKey={dialog.key}
        initial={
          editTarget
            ? { grpNm: editTarget.grpNm, colorNo: editTarget.colorNo ?? createInitial.colorNo }
            : createInitial
        }
        usedColorNos={usedColorNos(editTarget?.grpId)}
        busy={busyKey === "group:create" || (busyKey?.startsWith("group:edit:") ?? false)}
        onSubmit={(values) => void handleGroupSubmit(values)}
      />
    </div>
  );
}
