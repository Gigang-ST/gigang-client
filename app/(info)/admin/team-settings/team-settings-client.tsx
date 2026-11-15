"use client";

import { useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import { ChevronDown, ChevronRight, ChevronUp, Plus, X } from "lucide-react";
import { toast } from "sonner";

import {
  CFG_GROUPS,
  CFG_STATUS_LABEL,
  EMPTY_SUMMARY,
  isDefaultCfgValue,
  normalizeChannels,
  normalizeTeamLinks,
  type CfgStatus,
} from "@/lib/team-cfg/form";
import type { CfgGroup, CfgInput, TeamCfgCd } from "@/lib/team-cfg/registry";
import { cn } from "@/lib/utils";

import { resetTeamSetting, saveTeamSetting } from "@/app/actions/admin/team-settings";

import {
  ResponsiveDrawer,
  ResponsiveDrawerContent,
  ResponsiveDrawerDescription,
  ResponsiveDrawerHeader,
  ResponsiveDrawerTitle,
} from "@/components/common/responsive-drawer";
import { Body, Caption, H2, Micro, SectionLabel } from "@/components/common/typography";
import { Button } from "@/components/ui/button";
import { CardItem } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

export type TeamSettingItem = {
  cd: TeamCfgCd;
  label: string;
  description: string;
  group: CfgGroup;
  input: CfgInput;
  status: CfgStatus;
  /** 지금 동작하는 값. 비밀값은 null(브라우저로 내보내지 않는다) */
  value: unknown;
  /** 목록 한 줄에 보일 요약(서버가 만든다 — 비밀값은 "설정됨"만) */
  summary: string;
  /** 사전의 기본값 — 「기본값으로」가 입력칸에 채우는 값. 비밀값은 null */
  defaultValue: unknown;
  /** owner 만 바꾸는 설정(계좌·카톡방) — owner 가 아닌 관리자에겐 잠근다(서버 액션도 막는다) */
  ownerOnly: boolean;
};

type OtherTeam = { teamCd: string; teamNm: string };

/**
 * 「팀 설정」 본문 — **요약 목록 + 눌러서 편집**. 한 줄에 이름과 지금 값 요약만 두고, 누르면 아래에서 시트가 올라와
 * 설명·입력칸·저장·기본값으로가 그 안에 있다. 설정이 늘어도 목록은 줄만 쌓여 정신없어지지 않는다.
 * 켜고 끄기는 줄에서 바로 바꾼다(시트를 열 만큼의 일이 아니다).
 * 입력칸 모양은 사전의 `input.kind` 가 정한다(새 모양은 아래 Editor 에 더한다).
 */
export function TeamSettingsClient({
  items,
  otherTeams,
  isOwner,
}: {
  items: TeamSettingItem[];
  otherTeams: OtherTeam[];
  /** 이 팀 owner 인가 — 아니면 owner 전용 설정 줄을 잠근다 */
  isOwner: boolean;
}) {
  const [openCd, setOpenCd] = useState<TeamCfgCd | null>(null);
  const openItem = items.find((i) => i.cd === openCd) ?? null;

  return (
    <div className="flex flex-col gap-7 px-6 pb-10 pt-4">
      <div className="flex flex-col gap-1">
        <H2>팀 설정</H2>
        <Caption>이 크루에만 적용돼요. 저장하면 최대 1분 안에 모든 화면에 반영돼요.</Caption>
      </div>

      {CFG_GROUPS.map(({ group, label }) => {
        const groupItems = items.filter((i) => i.group === group);
        if (groupItems.length === 0) return null;
        return (
          <section key={group} className="flex flex-col gap-2">
            <SectionLabel>{label}</SectionLabel>
            <CardItem className="flex flex-col p-0">
              {groupItems.map((item, idx) => (
                <SettingRow
                  key={item.cd}
                  item={item}
                  first={idx === 0}
                  locked={item.ownerOnly && !isOwner}
                  onOpen={() => setOpenCd(item.cd)}
                />
              ))}
            </CardItem>
          </section>
        );
      })}

      {openItem && (
        <SettingSheet
          // 다른 항목을 열면 입력 상태를 새로 잡는다
          key={openItem.cd}
          item={openItem}
          otherTeams={otherTeams}
          onClose={() => setOpenCd(null)}
        />
      )}
    </div>
  );
}

/** 저장·되돌리기 공통 — 결과를 토스트로 알리고 화면을 새 값으로 다시 그린다 */
function useSettingAction(cd: TeamCfgCd) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message: string | null }>, okText: string, onOk?: () => void) =>
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.message ?? "실패했습니다");
        return;
      }
      toast.success(okText);
      onOk?.();
      router.refresh();
    });
  return {
    pending,
    save: (value: unknown, onOk?: () => void) => run(() => saveTeamSetting(cd, value), "저장했어요", onOk),
    reset: (onOk?: () => void) => run(() => resetTeamSetting(cd), "기본값으로 되돌렸어요", onOk),
  };
}

/** 목록 한 줄 — 이름 + 지금 값 요약. 켜고 끄기는 스위치를 줄에 바로 둔다 */
function SettingRow({
  item,
  first,
  locked,
  onOpen,
}: {
  item: TeamSettingItem;
  first: boolean;
  /** owner 전용 설정인데 owner 가 아니다 — 값만 보이고 눌리지 않는다 */
  locked: boolean;
  onOpen: () => void;
}) {
  const { pending, save } = useSettingAction(item.cd);
  const rowClass = cn(
    "flex min-h-[52px] w-full items-center gap-3 px-4 py-3 text-left",
    !first && "border-t border-border",
  );

  if (locked) {
    return (
      <div className={rowClass}>
        <div className="flex min-w-0 flex-1 flex-col">
          <Body className="font-medium">{item.label}</Body>
          <Micro>owner만 바꿀 수 있어요</Micro>
        </div>
        <Caption className="min-w-0 truncate text-right">{item.summary}</Caption>
      </div>
    );
  }

  if (item.input.kind === "boolean") {
    return (
      <div className={rowClass}>
        <Body className="flex-1 font-medium">{item.label}</Body>
        <Caption>{item.summary}</Caption>
        <Switch
          checked={item.value === true}
          disabled={pending}
          onCheckedChange={(v) => save(v)}
          aria-label={`${item.label} 켜고 끄기`}
        />
      </div>
    );
  }

  const empty = item.summary === EMPTY_SUMMARY;
  return (
    <button type="button" onClick={onOpen} className={cn(rowClass, "transition-colors active:bg-secondary")}>
      <Body className="shrink-0 font-medium">{item.label}</Body>
      <Caption className={cn("min-w-0 flex-1 truncate text-right", empty && "text-muted-foreground/60")}>
        {item.summary}
      </Caption>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

function StatusBadge({ status }: { status: CfgStatus }) {
  return (
    <Micro
      className={cn(
        "shrink-0 rounded-full border px-2 py-0.5",
        status === "set" ? "border-primary/40 bg-primary/10 text-primary" : "border-border",
      )}
    >
      {CFG_STATUS_LABEL[status]}
    </Micro>
  );
}

/**
 * 편집 시트 — 설명·입력칸·저장·기본값으로. 저장되면 닫힌다.
 *
 * 「기본값으로」는 **입력칸만 기본값으로 채운다** — 저장은 「저장」을 눌러야 한다(누르자마자 지워져 실제로 기강
 * 채널이 날아갔다). 저장할 값이 기본값과 같으면 값을 쓰지 않고 이 크루 설정을 지워 기본값으로 돌린다 —
 * 칸을 다 비우고 저장해도 같다.
 */
function SettingSheet({
  item,
  otherTeams,
  onClose,
}: {
  item: TeamSettingItem;
  otherTeams: OtherTeam[];
  onClose: () => void;
}) {
  const { pending, save, reset } = useSettingAction(item.cd);
  // 입력칸의 시작값. 「기본값으로」는 이것만 바꾸고 편집기를 다시 그린다(저장은 안 한다)
  const [base, setBase] = useState<unknown>(item.value);
  const [filledDefault, setFilledDefault] = useState(false);
  const [editorKey, setEditorKey] = useState(0);

  const handleSave = (value: unknown) => {
    if (isDefaultCfgValue(value, item.defaultValue)) {
      // 기본값과 같다 — 이 크루가 정한 값이 있으면 지우고, 없으면 바꿀 게 없다
      if (item.status === "set") reset(onClose);
      else onClose();
      return;
    }
    save(value, onClose);
  };

  return (
    <ResponsiveDrawer open onOpenChange={(open) => !open && onClose()}>
      <ResponsiveDrawerContent className="flex max-h-[90svh] flex-col gap-0" dialogClassName="max-w-md">
        <ResponsiveDrawerHeader className="px-4 py-4 text-left">
          <div className="flex items-center justify-between gap-2">
            <ResponsiveDrawerTitle>{item.label}</ResponsiveDrawerTitle>
            <StatusBadge status={item.status} />
          </div>
          <ResponsiveDrawerDescription>{item.description}</ResponsiveDrawerDescription>
        </ResponsiveDrawerHeader>

        <div className="flex flex-col gap-3 overflow-y-auto px-4 pb-6">
          {filledDefault && (
            <Caption className="text-primary">기본값으로 채웠어요. 저장을 눌러야 반영돼요.</Caption>
          )}
          <Editor
            key={editorKey}
            item={{ ...item, value: base }}
            cleared={filledDefault}
            otherTeams={otherTeams}
            pending={pending}
            onSave={handleSave}
          />
          {item.status === "set" && !filledDefault && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => {
                setBase(item.defaultValue);
                setFilledDefault(true);
                setEditorKey((k) => k + 1);
              }}
              className="self-center text-muted-foreground"
            >
              기본값으로
            </Button>
          )}
        </div>
      </ResponsiveDrawerContent>
    </ResponsiveDrawer>
  );
}

function SaveButton({ pending, disabled, onClick }: { pending: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <Button type="button" disabled={pending || disabled} onClick={onClick} className="mt-1 w-full">
      {pending ? "저장 중…" : "저장"}
    </Button>
  );
}

function Editor({
  item,
  cleared,
  otherTeams,
  pending,
  onSave,
}: {
  item: TeamSettingItem;
  /** 「기본값으로」를 눌렀다 — 비밀값 칸은 저장하면 지워진다고 안내한다 */
  cleared: boolean;
  otherTeams: OtherTeam[];
  pending: boolean;
  onSave: (value: unknown) => void;
}) {
  switch (item.input.kind) {
    case "boolean":
      // 켜고 끄기는 목록 줄에서 바로 바꾼다 — 시트로 오지 않는다
      return null;
    case "text":
      return <TextEditor value={(item.value as string | null) ?? ""} placeholder={item.input.placeholder} pending={pending} onSave={onSave} />;
    case "secret":
      return (
        <SecretEditor
          isSet={item.status === "set"}
          cleared={cleared}
          placeholder={item.input.placeholder}
          pending={pending}
          onSave={onSave}
        />
      );
    case "bank":
      return <BankEditor value={item.value as BankValue | null} pending={pending} onSave={onSave} />;
    case "channels":
      return <ChannelsEditor value={(item.value as Record<string, string>) ?? {}} pending={pending} onSave={onSave} />;
    case "regular_template":
      return <TemplateEditor value={item.value as TemplateValue | null} pending={pending} onSave={onSave} />;
    case "choices":
      return (
        <ChoicesEditor
          options={item.input.options}
          orderable={item.input.orderable ?? false}
          value={Array.isArray(item.value) ? (item.value as string[]) : []}
          pending={pending}
          onSave={onSave}
        />
      );
    case "choice":
      return (
        <ChoiceEditor
          options={item.input.options}
          value={typeof item.value === "string" ? item.value : ""}
          pending={pending}
          onSave={onSave}
        />
      );
    case "team_links":
      return (
        <TeamLinksEditor
          value={(item.value as { team_cd: string; name: string }[]) ?? []}
          otherTeams={otherTeams}
          pending={pending}
          onSave={onSave}
        />
      );
  }
}

/* ─── 편집기 ─── */

/**
 * 여러 개 고르기 — 하나도 안 고르면 저장을 막는다.
 * `orderable` 이면 줄마다 위아래 버튼이 서고, 보이는 줄 순서 그대로(고른 것만) 저장한다. 고른 줄이 위에, 안 고른 줄이
 * 아래에 처음 놓인다. 아니면 보기 순서대로 저장한다(누른 순서와 무관).
 */
function ChoicesEditor({
  options,
  orderable,
  value,
  pending,
  onSave,
}: {
  options: readonly { value: string; label: string }[];
  orderable: boolean;
  value: string[];
  pending: boolean;
  onSave: (v: unknown) => void;
}) {
  const [picked, setPicked] = useState<string[]>(value);
  const [rows, setRows] = useState<string[]>(() =>
    orderable
      ? [...value.filter((v) => options.some((o) => o.value === v)), ...options.map((o) => o.value).filter((v) => !value.includes(v))]
      : options.map((o) => o.value),
  );
  const ordered = rows.filter((v) => picked.includes(v));
  const toggle = (v: string) => setPicked((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
  const move = (i: number, d: -1 | 1) =>
    setRows((prev) => {
      const next = [...prev];
      [next[i], next[i + d]] = [next[i + d], next[i]];
      return next;
    });
  const labelOf = (v: string) => options.find((o) => o.value === v)?.label ?? v;
  return (
    <div className="flex flex-col gap-1">
      {orderable && <Caption>위에 둔 종목이 먼저 나와요.</Caption>}
      {rows.map((v, i) => (
        <div key={v} className="flex min-h-11 items-center gap-2">
          <Label className="flex flex-1 cursor-pointer items-center gap-3 font-normal">
            <Checkbox checked={picked.includes(v)} onCheckedChange={() => toggle(v)} />
            <Body>{labelOf(v)}</Body>
          </Label>
          {orderable && (
            <>
              <Button type="button" variant="ghost" size="icon" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`${labelOf(v)} 위로`}>
                <ChevronUp className="size-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon" disabled={i === rows.length - 1} onClick={() => move(i, 1)} aria-label={`${labelOf(v)} 아래로`}>
                <ChevronDown className="size-4" />
              </Button>
            </>
          )}
        </div>
      ))}
      {ordered.length === 0 && <Caption className="text-destructive">하나는 골라야 해요</Caption>}
      <SaveButton pending={pending} disabled={ordered.length === 0} onClick={() => onSave(ordered)} />
    </div>
  );
}

/** 하나 고르기 — 고른 줄에 체크가 선다 */
function ChoiceEditor({
  options,
  value,
  pending,
  onSave,
}: {
  options: readonly { value: string; label: string }[];
  value: string;
  pending: boolean;
  onSave: (v: unknown) => void;
}) {
  const [picked, setPicked] = useState(value);
  return (
    <div className="flex flex-col gap-1" role="radiogroup">
      {options.map((o) => (
        <Label key={o.value} className="flex min-h-11 cursor-pointer items-center gap-3 font-normal">
          <Checkbox
            checked={picked === o.value}
            onCheckedChange={() => setPicked(o.value)}
            role="radio"
            aria-checked={picked === o.value}
          />
          <Body>{o.label}</Body>
        </Label>
      ))}
      <SaveButton pending={pending} disabled={!picked} onClick={() => onSave(picked)} />
    </div>
  );
}

function TextEditor({
  value,
  placeholder,
  pending,
  onSave,
}: {
  value: string;
  placeholder?: string;
  pending: boolean;
  onSave: (v: unknown) => void;
}) {
  const [text, setText] = useState(value);
  return (
    <div className="flex flex-col gap-2">
      <Input value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} />
      <SaveButton pending={pending} onClick={() => onSave(text.trim() || null)} />
    </div>
  );
}

function SecretEditor({
  isSet,
  cleared,
  placeholder,
  pending,
  onSave,
}: {
  isSet: boolean;
  cleared: boolean;
  placeholder?: string;
  pending: boolean;
  onSave: (v: unknown) => void;
}) {
  // 지금 값은 서버가 내려주지 않는다 — 새 값을 넣어 덮어쓰는 것만 된다.
  // 「기본값으로」를 누른 뒤 빈 채로 저장하면 지운다(null — 시트가 기본값과 같다고 보고 설정을 지운다)
  const [text, setText] = useState("");
  return (
    <div className="flex flex-col gap-2">
      <Input
        type="password"
        autoComplete="off"
        value={text}
        placeholder={
          cleared ? "비워 두고 저장하면 지워져요" : isSet ? "설정돼 있어요 — 바꾸려면 새 값을 입력" : placeholder
        }
        onChange={(e) => setText(e.target.value)}
      />
      <SaveButton
        pending={pending}
        onClick={() => {
          if (!text.trim()) {
            if (cleared) onSave(null);
            return;
          }
          onSave(text.trim());
          setText("");
        }}
      />
    </div>
  );
}

type BankValue = { bank: string; number: string; holder: string };

function BankEditor({ value, pending, onSave }: { value: BankValue | null; pending: boolean; onSave: (v: unknown) => void }) {
  const [bank, setBank] = useState(value?.bank ?? "");
  const [number, setNumber] = useState(value?.number ?? "");
  const [holder, setHolder] = useState(value?.holder ?? "");
  return (
    <div className="flex flex-col gap-2">
      <LabeledInput label="은행" value={bank} onChange={setBank} placeholder="예: 카카오뱅크" />
      <LabeledInput label="계좌번호" value={number} onChange={setNumber} placeholder="예: 3333-00-0000000" />
      <LabeledInput label="예금주" value={holder} onChange={setHolder} placeholder="예: 홍길동(크루장)" />
      <SaveButton
        pending={pending}
        onClick={() =>
          onSave(
            !bank.trim() && !number.trim() && !holder.trim()
              ? null
              : { bank: bank.trim(), number: number.trim(), holder: holder.trim() },
          )
        }
      />
    </div>
  );
}

const CHANNEL_FIELDS: { key: string; label: string }[] = [
  { key: "kakao_open_chat", label: "카카오톡 오픈채팅" },
  { key: "instagram", label: "인스타그램" },
  { key: "somoim", label: "소모임" },
  { key: "garmin", label: "가민 그룹" },
];

function ChannelsEditor({
  value,
  pending,
  onSave,
}: {
  value: Record<string, string>;
  pending: boolean;
  onSave: (v: unknown) => void;
}) {
  const [form, setForm] = useState<Record<string, string>>(() =>
    Object.fromEntries(CHANNEL_FIELDS.map((f) => [f.key, value[f.key] ?? ""])),
  );
  return (
    <div className="flex flex-col gap-2">
      {CHANNEL_FIELDS.map((f) => (
        <LabeledInput
          key={f.key}
          label={f.label}
          value={form[f.key]}
          placeholder="https://… (비우면 안 보여요)"
          onChange={(v) => setForm((prev) => ({ ...prev, [f.key]: v }))}
        />
      ))}
      <SaveButton pending={pending} onClick={() => onSave(normalizeChannels(form))} />
    </div>
  );
}

type TemplateValue = { title: string; default_time: string; desc: string };

function TemplateEditor({
  value,
  pending,
  onSave,
}: {
  value: TemplateValue | null;
  pending: boolean;
  onSave: (v: unknown) => void;
}) {
  const [title, setTitle] = useState(value?.title ?? "");
  const [time, setTime] = useState(value?.default_time ?? "19:30");
  const [desc, setDesc] = useState(value?.desc ?? "");
  return (
    <div className="flex flex-col gap-2">
      <LabeledInput label="제목" value={title} onChange={setTitle} placeholder="예: 🔥 정기런" />
      <div className="flex flex-col gap-1">
        <Label>시작 시각</Label>
        <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1">
        <Label>비고</Label>
        <Textarea value={desc} rows={8} onChange={(e) => setDesc(e.target.value)} />
      </div>
      <SaveButton
        pending={pending}
        onClick={() => onSave(!title.trim() && !desc.trim() ? null : { title: title.trim(), default_time: time, desc })}
      />
    </div>
  );
}

function TeamLinksEditor({
  value,
  otherTeams,
  pending,
  onSave,
}: {
  value: { team_cd: string; name: string }[];
  otherTeams: OtherTeam[];
  pending: boolean;
  onSave: (v: unknown) => void;
}) {
  const [rows, setRows] = useState(value);
  const update = (i: number, patch: Partial<{ team_cd: string; name: string }>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={r.team_cd}
            onChange={(e) => {
              const t = otherTeams.find((o) => o.teamCd === e.target.value);
              update(i, { team_cd: e.target.value, name: r.name || t?.teamNm || "" });
            }}
          >
            <option value="">팀 선택</option>
            {otherTeams.map((t) => (
              <option key={t.teamCd} value={t.teamCd}>
                {t.teamNm}
              </option>
            ))}
          </select>
          <Input value={r.name} placeholder="안내에 쓸 이름" onChange={(e) => update(i, { name: e.target.value })} />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="이 줄 빼기"
            onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
          >
            <X className="size-4" />
          </Button>
        </div>
      ))}
      {otherTeams.length > 0 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => setRows((prev) => [...prev, { team_cd: "", name: "" }])}
        >
          <Plus className="size-4" /> 팀 추가
        </Button>
      )}
      <SaveButton pending={pending} onClick={() => onSave(normalizeTeamLinks(rows))} />
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label>{label}</Label>
      <Input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
