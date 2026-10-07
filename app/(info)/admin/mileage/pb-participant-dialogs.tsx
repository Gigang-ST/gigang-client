"use client";

import { useEffect, useMemo, useState } from "react";

import { ChevronsUpDown, Plus } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { feesForJoinWeek, requiredAttdCnt, wkLabel, type PbClassCfg } from "@/lib/pb-class";
import type { PbParticipant } from "@/lib/queries/pb-class";

import { Avatar } from "@/components/common/avatar";
import {
  ResponsiveDrawer,
  ResponsiveDrawerContent,
  ResponsiveDrawerDescription,
  ResponsiveDrawerHeader,
  ResponsiveDrawerTitle,
} from "@/components/common/responsive-drawer";
import { Caption } from "@/components/common/typography";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** 정수 입력 → 숫자. 비었거나 숫자가 아니면 NaN(저장 버튼이 막는다) */
function toInt(v: string): number {
  return /^\d+$/.test(v.trim()) ? Number(v.trim()) : Number.NaN;
}

function NumberField({
  id,
  label,
  unit,
  value,
  onChange,
  min = 0,
}: {
  id: string;
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  min?: number;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-12 rounded-xl border-[1.5px] text-[15px]"
        />
        <Caption className="w-10 shrink-0">{unit}</Caption>
      </div>
    </div>
  );
}

/** 합류 주차에 따른 전액 기준 안내 한 줄 — 입력하는 동안 "이 주차면 몇 회가 기준인지"를 바로 보여 준다 */
function RequiredHint({ joinWkNo, cfg }: { joinWkNo: number; cfg: PbClassCfg }) {
  if (!Number.isInteger(joinWkNo) || joinWkNo < 1) return null;
  const required = requiredAttdCnt(joinWkNo, cfg);
  return (
    <Caption>
      {required === null
        ? `${wkLabel(joinWkNo)} 합류는 보증금 없이 참가비만 내요. 환급 대상이 아니에요.`
        : `${wkLabel(joinWkNo)} 합류의 전액 환급 기준은 ${required}회 출석이에요.`}
    </Caption>
  );
}

/* ------------------------------------------------------------------ */
/* 수정                                                                */
/* ------------------------------------------------------------------ */

export type PbParticipantEditValues = { joinWkNo: number; depositAmt: number; entryFeeAmt: number };

function EditForm({
  participant,
  cfg,
  busy,
  onSubmit,
}: {
  participant: PbParticipant;
  cfg: PbClassCfg;
  busy: boolean;
  onSubmit: (values: PbParticipantEditValues) => void;
}) {
  const [joinWk, setJoinWk] = useState(String(participant.joinWkNo));
  const [deposit, setDeposit] = useState(String(participant.depositAmt));
  const [entryFee, setEntryFee] = useState(String(participant.entryFeeAmt));

  // 합류 주차를 바꾸면 그 주차의 정가로 금액을 다시 채운다(늦은 합류면 보증금 0).
  // 협의한 금액이 따로 있으면 이어서 직접 고치면 된다.
  const handleJoinWk = (v: string) => {
    setJoinWk(v);
    const n = toInt(v);
    if (Number.isInteger(n) && n >= 1) {
      // 이미 마일리지런 할인을 받은 사람이면 새 주차에서도 할인을 이어 준다 — 정가로 되돌리면
      // 주차만 바꿨는데 보증금이 슬그머니 올라간다(늦은 합류로 가면 어차피 0이다)
      const fees = feesForJoinWeek(n, cfg, { mlgAlumni: participant.depositDcAmt > 0 });
      setDeposit(String(fees.depositAmt));
      setEntryFee(String(fees.entryFeeAmt));
    }
  };

  const joinWkNo = toInt(joinWk);
  const valid =
    Number.isInteger(joinWkNo) &&
    joinWkNo >= 1 &&
    Number.isInteger(toInt(deposit)) &&
    Number.isInteger(toInt(entryFee));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4 pt-4">
        <NumberField id="pb-edit-wk" label="합류 주차" unit="주차" value={joinWk} onChange={handleJoinWk} min={1} />
        <RequiredHint joinWkNo={joinWkNo} cfg={cfg} />
        <NumberField id="pb-edit-deposit" label="보증금" unit="원" value={deposit} onChange={setDeposit} />
        <NumberField id="pb-edit-fee" label="참가비" unit="원" value={entryFee} onChange={setEntryFee} />
      </div>
      <div className="shrink-0 border-t border-border p-4">
        <Button
          disabled={!valid || busy}
          onClick={() =>
            onSubmit({ joinWkNo, depositAmt: toInt(deposit), entryFeeAmt: toInt(entryFee) })
          }
          className="h-[52px] w-full rounded-xl text-base font-semibold"
        >
          {busy ? "저장 중..." : "저장"}
        </Button>
      </div>
    </div>
  );
}

/**
 * 참가자 수정 — 합류 주차·보증금·참가비.
 * `participant`는 닫는 동안에도 유지한다(null로 비우면 닫히는 애니메이션 중 시트가 텅 빈 채 내려간다).
 */
export function PbParticipantEditDialog({
  open,
  onOpenChange,
  participant,
  cfg,
  busy,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  participant: PbParticipant | null;
  cfg: PbClassCfg;
  busy: boolean;
  onSubmit: (prtId: string, values: PbParticipantEditValues) => void;
}) {
  return (
    <ResponsiveDrawer open={open} onOpenChange={onOpenChange}>
      <ResponsiveDrawerContent
        dialogClassName="max-w-md max-h-[85dvh] flex flex-col gap-0 p-0 overflow-hidden"
        drawerClassName="max-h-[85dvh]"
      >
        <ResponsiveDrawerHeader className="shrink-0 border-b border-border px-4 py-4 text-left">
          <ResponsiveDrawerTitle>{participant?.memNm ?? "참가자"} 수정</ResponsiveDrawerTitle>
          <ResponsiveDrawerDescription>
            합류 주차를 바꾸면 그 주차 기준 금액으로 다시 채워져요.
          </ResponsiveDrawerDescription>
        </ResponsiveDrawerHeader>
        {participant && (
          <EditForm
            key={participant.prtId}
            participant={participant}
            cfg={cfg}
            busy={busy}
            onSubmit={(values) => onSubmit(participant.prtId, values)}
          />
        )}
      </ResponsiveDrawerContent>
    </ResponsiveDrawer>
  );
}

/* ------------------------------------------------------------------ */
/* 추가                                                                */
/* ------------------------------------------------------------------ */

type ActiveMember = { mem_id: string; mem_nm: string | null; avatar_url: string | null };

function AddForm({
  teamId,
  cfg,
  excludeMemIds,
  defaultJoinWkNo,
  busy,
  onSubmit,
}: {
  teamId: string;
  cfg: PbClassCfg;
  excludeMemIds: Set<string>;
  defaultJoinWkNo: number;
  busy: boolean;
  onSubmit: (memId: string, joinWkNo: number) => void;
}) {
  const [members, setMembers] = useState<ActiveMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [picked, setPicked] = useState<ActiveMember | null>(null);
  const [joinWk, setJoinWk] = useState(String(defaultJoinWkNo));

  // 활동 멤버 목록 — 모임 관리의 참가자 추가와 같은 조회(팀 활동 멤버)
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("team_mem_rel")
        .select("mem_id, mem_mst!inner(mem_id, mem_nm, avatar_url)")
        .eq("team_id", teamId)
        .eq("vers", 0)
        .eq("del_yn", false)
        .eq("mem_st_cd", "active")
        .eq("mem_mst.vers", 0)
        .eq("mem_mst.del_yn", false);
      if (cancelled) return;
      setMembers(
        (data ?? []).map((row) => {
          const m = Array.isArray(row.mem_mst) ? row.mem_mst[0] : row.mem_mst;
          return {
            mem_id: row.mem_id,
            mem_nm: m?.mem_nm ?? null,
            avatar_url: m?.avatar_url ?? null,
          };
        }),
      );
      setLoadingMembers(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  // 이미 참가 중인 사람은 고를 수 없다(한 프로젝트에 한 행)
  const available = useMemo(
    () =>
      members
        .filter((m) => !excludeMemIds.has(m.mem_id))
        .sort((a, b) => (a.mem_nm ?? "").localeCompare(b.mem_nm ?? "", "ko")),
    [members, excludeMemIds],
  );

  const joinWkNo = toInt(joinWk);
  const validWk = Number.isInteger(joinWkNo) && joinWkNo >= 1;
  const fees = validWk ? feesForJoinWeek(joinWkNo, cfg) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4 pt-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">멤버</span>
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                role="combobox"
                aria-expanded={pickerOpen}
                disabled={loadingMembers}
                className="h-12 w-full justify-between rounded-xl font-normal"
              >
                {picked ? (
                  <span className="flex min-w-0 items-center gap-2 text-foreground">
                    <Avatar src={picked.avatar_url} seed={picked.mem_id} size="xs" />
                    <span className="truncate">{picked.mem_nm ?? "이름 없음"}</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    {loadingMembers ? "멤버 불러오는 중…" : "이름 검색…"}
                  </span>
                )}
                <ChevronsUpDown className="ml-1 size-3.5 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
              <Command>
                <CommandInput placeholder="이름 검색…" />
                <CommandList>
                  <CommandEmpty>
                    {available.length === 0 ? "추가할 수 있는 멤버가 없습니다" : "검색 결과가 없습니다"}
                  </CommandEmpty>
                  <CommandGroup>
                    {available.map((m) => (
                      <CommandItem
                        key={m.mem_id}
                        value={`${m.mem_nm ?? "이름 없음"} ${m.mem_id}`}
                        onSelect={() => {
                          setPicked(m);
                          setPickerOpen(false);
                        }}
                      >
                        <Avatar src={m.avatar_url} seed={m.mem_id} size="xs" className="mr-2" />
                        {m.mem_nm ?? "이름 없음"}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        <NumberField id="pb-add-wk" label="합류 주차" unit="주차" value={joinWk} onChange={setJoinWk} min={1} />
        <RequiredHint joinWkNo={joinWkNo} cfg={cfg} />
        {fees && (
          <Caption>
            납부액은 보증금 {fees.depositAmt.toLocaleString()}원 + 참가비 {fees.entryFeeAmt.toLocaleString()}원이에요.
            추가 후 참여자 목록의 수정에서 바꿀 수 있어요.
          </Caption>
        )}
        {/* 서버가 마일리지런 참가 이력을 보고 정한다 — 여기선 고를 수 없다는 것만 알려 준다.
            할인이 0원이거나 늦은 합류(보증금 자체가 없음)면 해당 없는 말이라 안 띄운다 */}
        {fees && fees.depositAmt > 0 && cfg.mlgDcAmt > 0 && (
          <Caption>마일리지런 참가자면 할인이 자동으로 적용돼요 (보증금 −{cfg.mlgDcAmt.toLocaleString()}원).</Caption>
        )}
      </div>
      <div className="shrink-0 border-t border-border p-4">
        <Button
          disabled={!picked || !validWk || busy}
          onClick={() => picked && onSubmit(picked.mem_id, joinWkNo)}
          className="h-[52px] w-full gap-1.5 rounded-xl text-base font-semibold"
        >
          <Plus className="size-4" />
          {busy ? "추가 중..." : "참가자 추가"}
        </Button>
      </div>
    </div>
  );
}

/**
 * 관리자 직접 추가 — 카톡·계좌로 먼저 받은 사람을 앱 신청 없이 올린다(1단계 지연 대비책).
 * 폼은 열 때마다 새로 마운트돼(Radix가 닫히면 내용을 내린다) 이전에 고른 멤버가 남지 않는다.
 */
export function PbParticipantAddDialog({
  open,
  onOpenChange,
  teamId,
  cfg,
  excludeMemIds,
  defaultJoinWkNo,
  busy,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
  cfg: PbClassCfg;
  excludeMemIds: Set<string>;
  defaultJoinWkNo: number;
  busy: boolean;
  onSubmit: (memId: string, joinWkNo: number) => void;
}) {
  return (
    <ResponsiveDrawer open={open} onOpenChange={onOpenChange}>
      <ResponsiveDrawerContent
        dialogClassName="max-w-md max-h-[85dvh] flex flex-col gap-0 p-0 overflow-hidden"
        drawerClassName="max-h-[85dvh]"
      >
        <ResponsiveDrawerHeader className="shrink-0 border-b border-border px-4 py-4 text-left">
          <ResponsiveDrawerTitle>참가자 추가</ResponsiveDrawerTitle>
          <ResponsiveDrawerDescription>
            앱 신청 없이 운영진이 직접 참가자를 올려요.
          </ResponsiveDrawerDescription>
        </ResponsiveDrawerHeader>
        <AddForm
          teamId={teamId}
          cfg={cfg}
          excludeMemIds={excludeMemIds}
          defaultJoinWkNo={defaultJoinWkNo}
          busy={busy}
          onSubmit={onSubmit}
        />
      </ResponsiveDrawerContent>
    </ResponsiveDrawer>
  );
}
