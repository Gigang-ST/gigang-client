"use client";

import { useMemo, useState, useTransition } from "react";

import { Check, ChevronsUpDown, Plus } from "lucide-react";

import { dayjs } from "@/lib/dayjs";
import { duplicateNames, memberLabel } from "@/lib/dues/homonyms";
import { cn } from "@/lib/utils";

import { createExemption } from "@/app/actions/dues/create-exemption";
import {
  addExemptionHist,
  updateExemptionHist,
  deleteExemptionHist,
} from "@/app/actions/dues/manage-exemption-hist";
import { updateExemption, deleteExemption } from "@/app/actions/dues/manage-exemptions";

import { SegmentControl } from "@/components/common/segment-control";
import { Caption, SectionLabel } from "@/components/common/typography";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Member = { mem_id: string; mem_nm: string; birth_dt: string | null };

type ExemptionRow = {
  exm_cfg_id: string;
  mem_id: string;
  mem_nm: string;
  birth_dt: string | null;
  exm_tp_enm: "full" | "part";
  exm_amt: number | null;
  aply_stt_dt: string;
  aply_end_dt: string;
  rsn_txt: string;
  reg_by_mem_nm: string | null;
};

type HistRow = {
  exm_hist_id: string;
  mem_id: string;
  mem_nm: string;
  birth_dt: string | null;
  aply_ym: string;
  exm_amt: number;
  grant_src_enm: "manual" | "rule_attd" | "rule_attd_quest";
  rsn_txt: string;
  aprv_by_mem_nm: string | null;
};

// ─── 날짜 유틸 ───────────────────────────────────────────
function ymToStartDt(ym: string) { return `${ym}-01`; }
function ymToEndDt(ym: string) {
  if (!ym) return "2099-12-31";
  return dayjs(ym).endOf("month").format("YYYY-MM-DD");
}
function dtToYm(dt: string) {
  if (!dt || dt >= "2099-12-01") return "";
  return dt.slice(0, 7);
}
function displayYm(dt: string) {
  const ym = dtToYm(dt);
  return ym ? ym.replace("-", ".") : "무기한";
}

// ─── 공통 콤보박스 ────────────────────────────────────────
function MemberCombobox({
  members,
  value,
  dupNames,
  onSelect,
}: {
  members: Member[];
  value: string;
  dupNames: Set<string>;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = members.find((m) => m.mem_id === value);
  const labelOf = (m: Member) => memberLabel({ name: m.mem_nm, birthDt: m.birth_dt }, dupNames);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
          {selected ? labelOf(selected) : "회원 검색..."}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command>
          <CommandInput placeholder="이름 검색..." />
          <CommandList>
            <CommandEmpty>결과 없음</CommandEmpty>
            <CommandGroup>
              {members.map((m) => (
                <CommandItem key={m.mem_id} value={`${m.mem_nm} ${m.mem_id}`} onSelect={() => { onSelect(m.mem_id); setOpen(false); }}>
                  <Check className={cn("mr-2 h-4 w-4", value === m.mem_id ? "opacity-100" : "opacity-0")} />
                  {labelOf(m)}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────
export function DuesExemptionsClient({
  exemptions: initialExemptions,
  hists: initialHists,
  members,
}: {
  exemptions: ExemptionRow[];
  hists: HistRow[];
  members: Member[];
}) {
  const [tab, setTab] = useState<"rules" | "hists">("rules");
  const dupNames = useMemo(() => duplicateNames(members.map((m) => ({ name: m.mem_nm }))), [members]);

  return (
    <div className="flex flex-col gap-4 px-6 pb-6 pt-2">
      <SegmentControl
        segments={[
          { value: "rules", label: "면제 규칙" },
          { value: "hists", label: "면제 이력" },
        ]}
        value={tab}
        onValueChange={(v) => setTab(v as "rules" | "hists")}
      />
      {tab === "rules" ? (
        <ExemptionRulesTab exemptions={initialExemptions} members={members} dupNames={dupNames} />
      ) : (
        <ExemptionHistsTab hists={initialHists} members={members} dupNames={dupNames} />
      )}
    </div>
  );
}

// ─── 탭 1: 면제 규칙 ──────────────────────────────────────
type RuleFormState = {
  memId: string;
  exmTpEnm: "full" | "part";
  exmAmt: string;
  aplySttYm: string;
  aplyEndYm: string;
  rsnTxt: string;
};

function defaultRuleForm(): RuleFormState {
  return { memId: "", exmTpEnm: "full", exmAmt: "", aplySttYm: dayjs().format("YYYY-MM"), aplyEndYm: "", rsnTxt: "" };
}

function ExemptionRulesTab({
  exemptions: init,
  members,
  dupNames,
}: {
  exemptions: ExemptionRow[];
  members: Member[];
  dupNames: Set<string>;
}) {
  const [isPending, startTransition] = useTransition();
  const [rows, setRows] = useState(init);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ExemptionRow | null>(null);
  const [form, setForm] = useState<RuleFormState>(defaultRuleForm());

  function openEdit(row: ExemptionRow) {
    setForm({
      memId: row.mem_id,
      exmTpEnm: row.exm_tp_enm,
      exmAmt: row.exm_amt?.toString() ?? "",
      aplySttYm: dtToYm(row.aply_stt_dt) || row.aply_stt_dt.slice(0, 7),
      aplyEndYm: dtToYm(row.aply_end_dt),
      rsnTxt: row.rsn_txt,
    });
    setEditTarget(row);
  }

  function handleAdd() {
    startTransition(async () => {
      const res = await createExemption({
        memId: form.memId,
        exmTpEnm: form.exmTpEnm,
        exmAmt: form.exmTpEnm === "part" ? Number(form.exmAmt) : undefined,
        aplySttDt: ymToStartDt(form.aplySttYm),
        aplyEndDt: ymToEndDt(form.aplyEndYm),
        rsnTxt: form.rsnTxt,
      });
      if (res.ok) { setAddOpen(false); window.location.reload(); }
      else alert(res.message);
    });
  }

  function handleEdit() {
    if (!editTarget) return;
    startTransition(async () => {
      const res = await updateExemption({
        exmCfgId: editTarget.exm_cfg_id,
        exmTpEnm: form.exmTpEnm,
        exmAmt: form.exmTpEnm === "part" ? Number(form.exmAmt) : undefined,
        aplySttDt: ymToStartDt(form.aplySttYm),
        aplyEndDt: ymToEndDt(form.aplyEndYm),
        rsnTxt: form.rsnTxt,
      });
      if (res.ok) {
        setRows((prev) => prev.map((e) => e.exm_cfg_id === editTarget.exm_cfg_id
          ? { ...e, exm_tp_enm: form.exmTpEnm, exm_amt: form.exmTpEnm === "part" ? Number(form.exmAmt) : null, aply_stt_dt: ymToStartDt(form.aplySttYm), aply_end_dt: ymToEndDt(form.aplyEndYm), rsn_txt: form.rsnTxt }
          : e));
        setEditTarget(null);
      } else alert(res.message);
    });
  }

  function handleDelete() {
    if (!editTarget) return;
    if (!confirm(`${editTarget.mem_nm}의 면제 규칙을 삭제하시겠습니까?`)) return;
    startTransition(async () => {
      const res = await deleteExemption(editTarget.exm_cfg_id);
      if (res.ok) { setRows((prev) => prev.filter((e) => e.exm_cfg_id !== editTarget.exm_cfg_id)); setEditTarget(null); }
      else alert(res.message);
    });
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <SectionLabel>면제 규칙 ({rows.length}건)</SectionLabel>
        <Button size="sm" className="gap-1.5" onClick={() => { setForm(defaultRuleForm()); setAddOpen(true); }}>
          <Plus className="h-4 w-4" />추가
        </Button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              {["이름", "유형", "금액", "시작", "종료", "사유", "등록자"].map((h) => (
                <TableHead key={h} className="text-center text-xs whitespace-nowrap">{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={7} className="py-8 text-center"><Caption className="text-muted-foreground">등록된 면제 규칙이 없습니다.</Caption></TableCell></TableRow>
            )}
            {rows.map((row) => (
              <TableRow key={row.exm_cfg_id} className="cursor-pointer hover:bg-muted/50" onClick={() => openEdit(row)}>
                <TableCell className="text-center"><Caption className="text-xs font-semibold whitespace-nowrap">{memberLabel({ name: row.mem_nm, birthDt: row.birth_dt }, dupNames)}</Caption></TableCell>
                <TableCell className="text-center"><Caption className="text-xs whitespace-nowrap">{row.exm_tp_enm === "full" ? "전액" : "부분"}</Caption></TableCell>
                <TableCell className="text-center"><Caption className="text-xs whitespace-nowrap">{row.exm_tp_enm === "full" ? "전액" : `${row.exm_amt?.toLocaleString()}원`}</Caption></TableCell>
                <TableCell className="text-center"><Caption className="text-xs whitespace-nowrap">{displayYm(row.aply_stt_dt)}</Caption></TableCell>
                <TableCell className="text-center"><Caption className="text-xs whitespace-nowrap">{displayYm(row.aply_end_dt)}</Caption></TableCell>
                <TableCell className="max-w-[120px]"><Caption className="text-xs line-clamp-2">{row.rsn_txt}</Caption></TableCell>
                <TableCell className="text-center"><Caption className="text-xs text-muted-foreground whitespace-nowrap">{row.reg_by_mem_nm ?? "-"}</Caption></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={addOpen} onOpenChange={(o) => !o && setAddOpen(false)}>
        <DialogContent>
          <DialogHeader><DialogTitle>면제 규칙 등록</DialogTitle></DialogHeader>
          <RuleForm form={form} onChange={setForm} members={members} dupNames={dupNames} showMemberSelect />
          <Button onClick={handleAdd} disabled={isPending || !form.memId || !form.rsnTxt || !form.aplySttYm}>
            {isPending ? <LoadingSpinner /> : "등록"}
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editTarget?.mem_nm} 면제 규칙 수정</DialogTitle></DialogHeader>
          <RuleForm form={form} onChange={setForm} members={members} dupNames={dupNames} />
          <div className="flex gap-2">
            <Button className="flex-1" onClick={handleEdit} disabled={isPending || !form.rsnTxt || !form.aplySttYm}>
              {isPending ? <LoadingSpinner /> : "저장"}
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isPending}>삭제</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RuleForm({
  form,
  onChange,
  members,
  dupNames,
  showMemberSelect = false,
}: {
  form: RuleFormState;
  onChange: React.Dispatch<React.SetStateAction<RuleFormState>>;
  members: Member[];
  dupNames: Set<string>;
  showMemberSelect?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4 pt-1">
      {showMemberSelect && (
        <div className="flex flex-col gap-1.5">
          <Label>회원</Label>
          <MemberCombobox members={members} value={form.memId} dupNames={dupNames} onSelect={(id) => onChange((f) => ({ ...f, memId: id }))} />
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label>면제 유형</Label>
        <Select value={form.exmTpEnm} onValueChange={(v) => onChange((f) => ({ ...f, exmTpEnm: v as "full" | "part" }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="full">전액 면제</SelectItem>
            <SelectItem value="part">부분 면제</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {form.exmTpEnm === "part" && (
        <div className="flex flex-col gap-1.5">
          <Label>면제 금액 (원)</Label>
          <Input type="number" value={form.exmAmt} onChange={(e) => onChange((f) => ({ ...f, exmAmt: e.target.value }))} placeholder="2000" />
        </div>
      )}
      <div className="flex gap-2">
        <div className="flex flex-col gap-1.5 flex-1">
          <Label>시작 월 <span className="text-destructive">*</span></Label>
          <Input type="month" value={form.aplySttYm} onChange={(e) => onChange((f) => ({ ...f, aplySttYm: e.target.value }))} />
        </div>
        <div className="flex flex-col gap-1.5 flex-1">
          <Label>종료 월 <span className="text-muted-foreground text-xs">(비우면 무기한)</span></Label>
          <Input type="month" value={form.aplyEndYm} onChange={(e) => onChange((f) => ({ ...f, aplyEndYm: e.target.value }))} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>사유 <span className="text-destructive">*</span></Label>
        <Input value={form.rsnTxt} onChange={(e) => onChange((f) => ({ ...f, rsnTxt: e.target.value }))} placeholder="장기 부상, 타지역 이사 등" />
      </div>
    </div>
  );
}

// ─── 탭 2: 면제 이력 ──────────────────────────────────────
type HistFormState = {
  memId: string;
  aplyYm: string;
  exmAmt: string;
  rsnTxt: string;
};

function defaultHistForm(): HistFormState {
  return { memId: "", aplyYm: dayjs().format("YYYY-MM"), exmAmt: "", rsnTxt: "" };
}

function ExemptionHistsTab({
  hists: init,
  members,
  dupNames,
}: {
  hists: HistRow[];
  members: Member[];
  dupNames: Set<string>;
}) {
  const [isPending, startTransition] = useTransition();
  const [rows, setRows] = useState(init);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<HistRow | null>(null);
  const [form, setForm] = useState<HistFormState>(defaultHistForm());

  function openEdit(row: HistRow) {
    setForm({ memId: row.mem_id, aplyYm: row.aply_ym, exmAmt: row.exm_amt.toString(), rsnTxt: row.rsn_txt });
    setEditTarget(row);
  }

  function handleAdd() {
    startTransition(async () => {
      const res = await addExemptionHist({
        memId: form.memId,
        aplyYm: form.aplyYm,
        exmAmt: Number(form.exmAmt),
        rsnTxt: form.rsnTxt || undefined,
      });
      if (res.ok) { setAddOpen(false); window.location.reload(); }
      else alert(res.message);
    });
  }

  function handleEdit() {
    if (!editTarget) return;
    startTransition(async () => {
      const res = await updateExemptionHist({
        exmHistId: editTarget.exm_hist_id,
        exmAmt: Number(form.exmAmt),
        rsnTxt: form.rsnTxt || undefined,
      });
      if (res.ok) {
        setRows((prev) => prev.map((r) => r.exm_hist_id === editTarget.exm_hist_id
          ? { ...r, exm_amt: Number(form.exmAmt), rsn_txt: form.rsnTxt }
          : r));
        setEditTarget(null);
      } else alert(res.message);
    });
  }

  function handleDelete() {
    if (!editTarget) return;
    if (!confirm(`${editTarget.mem_nm} ${editTarget.aply_ym.replace("-", ".")} 면제 이력을 삭제하시겠습니까?`)) return;
    startTransition(async () => {
      const res = await deleteExemptionHist(editTarget.exm_hist_id);
      if (res.ok) { setRows((prev) => prev.filter((r) => r.exm_hist_id !== editTarget.exm_hist_id)); setEditTarget(null); }
      else alert(res.message);
    });
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <SectionLabel>면제 이력 ({rows.length}건)</SectionLabel>
        <Button size="sm" className="gap-1.5" onClick={() => { setForm(defaultHistForm()); setAddOpen(true); }}>
          <Plus className="h-4 w-4" />추가
        </Button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              {["이름", "적용 월", "면제 금액", "출처", "사유", "등록자"].map((h) => (
                <TableHead key={h} className="text-center text-xs whitespace-nowrap">{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={6} className="py-8 text-center"><Caption className="text-muted-foreground">면제 이력이 없습니다.</Caption></TableCell></TableRow>
            )}
            {rows.map((row) => (
              <TableRow key={row.exm_hist_id} className="cursor-pointer hover:bg-muted/50" onClick={() => openEdit(row)}>
                <TableCell className="text-center"><Caption className="text-xs font-semibold whitespace-nowrap">{memberLabel({ name: row.mem_nm, birthDt: row.birth_dt }, dupNames)}</Caption></TableCell>
                <TableCell className="text-center"><Caption className="text-xs whitespace-nowrap">{row.aply_ym.replace("-", ".")}</Caption></TableCell>
                <TableCell className="text-center"><Caption className="text-xs whitespace-nowrap">{row.exm_amt.toLocaleString()}원</Caption></TableCell>
                <TableCell className="text-center">
                  <Caption className={cn("text-xs whitespace-nowrap", row.grant_src_enm === "manual" ? "text-primary" : row.grant_src_enm === "rule_attd_quest" ? "text-success" : "text-muted-foreground")}>
                    {row.grant_src_enm === "manual" ? "수동" : row.grant_src_enm === "rule_attd_quest" ? "참여" : "규칙"}
                  </Caption>
                </TableCell>
                <TableCell className="max-w-[120px]"><Caption className="text-xs line-clamp-2">{row.rsn_txt || "-"}</Caption></TableCell>
                <TableCell className="text-center"><Caption className="text-xs text-muted-foreground whitespace-nowrap">{row.aprv_by_mem_nm ?? "-"}</Caption></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* 추가 다이얼로그 */}
      <Dialog open={addOpen} onOpenChange={(o) => !o && setAddOpen(false)}>
        <DialogContent>
          <DialogHeader><DialogTitle>면제 이력 추가</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-4 pt-1">
            <div className="flex flex-col gap-1.5">
              <Label>회원</Label>
              <MemberCombobox members={members} value={form.memId} dupNames={dupNames} onSelect={(id) => setForm((f) => ({ ...f, memId: id }))} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>적용 월 <span className="text-destructive">*</span></Label>
              <Input type="month" value={form.aplyYm} onChange={(e) => setForm((f) => ({ ...f, aplyYm: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>면제 금액 (원) <span className="text-destructive">*</span></Label>
              <Input type="number" value={form.exmAmt} onChange={(e) => setForm((f) => ({ ...f, exmAmt: e.target.value }))} placeholder="2000" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>사유</Label>
              <Input value={form.rsnTxt} onChange={(e) => setForm((f) => ({ ...f, rsnTxt: e.target.value }))} placeholder="정산 예외 처리 등" />
            </div>
          </div>
          <Button onClick={handleAdd} disabled={isPending || !form.memId || !form.aplyYm || !form.exmAmt}>
            {isPending ? <LoadingSpinner /> : "추가"}
          </Button>
        </DialogContent>
      </Dialog>

      {/* 수정 다이얼로그 */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editTarget?.mem_nm} {editTarget?.aply_ym.replace("-", ".")} 이력 수정</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 pt-1">
            <div className="flex flex-col gap-1.5">
              <Label>면제 금액 (원) <span className="text-destructive">*</span></Label>
              <Input type="number" value={form.exmAmt} onChange={(e) => setForm((f) => ({ ...f, exmAmt: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>사유</Label>
              <Input value={form.rsnTxt} onChange={(e) => setForm((f) => ({ ...f, rsnTxt: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={handleEdit} disabled={isPending || !form.exmAmt}>
              {isPending ? <LoadingSpinner /> : "저장"}
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isPending}>삭제</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
