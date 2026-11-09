"use client";

import { useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import { Plus, X } from "lucide-react";

import { CFG_GROUPS, CFG_STATUS_LABEL, normalizeChannels, normalizeTeamLinks, type CfgStatus } from "@/lib/team-cfg/form";
import type { CfgGroup, CfgInput, TeamCfgCd } from "@/lib/team-cfg/registry";
import { cn } from "@/lib/utils";

import { resetTeamSetting, saveTeamSetting } from "@/app/actions/admin/team-settings";

import { Body, Caption, H2, Micro, SectionLabel } from "@/components/common/typography";
import { Button } from "@/components/ui/button";
import { CardItem } from "@/components/ui/card";
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
};

type OtherTeam = { teamCd: string; teamNm: string };

/**
 * 「팀 설정」 본문 — 사전 항목을 묶음별로 그리고, 항목마다 입력칸·저장·기본값으로 되돌리기를 둔다.
 * 입력칸 모양은 사전의 `input.kind` 가 정한다(새 모양은 아래 Editor 에 더한다).
 */
export function TeamSettingsClient({ items, otherTeams }: { items: TeamSettingItem[]; otherTeams: OtherTeam[] }) {
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
          <section key={group} className="flex flex-col gap-3">
            <SectionLabel>{label}</SectionLabel>
            {groupItems.map((item) => (
              <SettingCard key={item.cd} item={item} otherTeams={otherTeams} />
            ))}
          </section>
        );
      })}
    </div>
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

function SettingCard({ item, otherTeams }: { item: TeamSettingItem; otherTeams: OtherTeam[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; message: string | null }>, okText: string) => {
    setMessage(null);
    startTransition(async () => {
      const res = await fn();
      setMessage(res.ok ? { ok: true, text: okText } : { ok: false, text: res.message ?? "실패했습니다" });
      if (res.ok) router.refresh();
    });
  };
  const save = (value: unknown) => run(() => saveTeamSetting(item.cd, value), "저장했어요");
  const reset = () => run(() => resetTeamSetting(item.cd), "기본값으로 되돌렸어요");

  return (
    <CardItem className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <Body className="font-semibold">{item.label}</Body>
        <StatusBadge status={item.status} />
      </div>
      <Caption>{item.description}</Caption>

      <Editor item={item} otherTeams={otherTeams} pending={pending} onSave={save} />

      <div className="flex items-center justify-between gap-2">
        {message ? (
          <Caption className={message.ok ? "text-primary" : "text-destructive"}>{message.text}</Caption>
        ) : (
          <span />
        )}
        {item.status === "set" && (
          <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={reset} className="text-muted-foreground">
            기본값으로
          </Button>
        )}
      </div>
    </CardItem>
  );
}

function SaveButton({ pending, onClick }: { pending: boolean; onClick: () => void }) {
  return (
    <Button type="button" size="sm" disabled={pending} onClick={onClick} className="self-end">
      {pending ? "저장 중…" : "저장"}
    </Button>
  );
}

function Editor({
  item,
  otherTeams,
  pending,
  onSave,
}: {
  item: TeamSettingItem;
  otherTeams: OtherTeam[];
  pending: boolean;
  onSave: (value: unknown) => void;
}) {
  switch (item.input.kind) {
    case "boolean":
      return <BooleanEditor value={item.value === true} pending={pending} onSave={onSave} />;
    case "text":
      return <TextEditor value={(item.value as string | null) ?? ""} placeholder={item.input.placeholder} pending={pending} onSave={onSave} />;
    case "secret":
      return <SecretEditor isSet={item.status === "set"} placeholder={item.input.placeholder} pending={pending} onSave={onSave} />;
    case "bank":
      return <BankEditor value={item.value as BankValue | null} pending={pending} onSave={onSave} />;
    case "channels":
      return <ChannelsEditor value={(item.value as Record<string, string>) ?? {}} pending={pending} onSave={onSave} />;
    case "regular_template":
      return <TemplateEditor value={item.value as TemplateValue | null} pending={pending} onSave={onSave} />;
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

function BooleanEditor({ value, pending, onSave }: { value: boolean; pending: boolean; onSave: (v: unknown) => void }) {
  // 켜고 끄기는 누르는 즉시 저장한다 — 저장 버튼까지 누르게 하면 바꾼 줄 알고 나가 버린다
  return (
    <div className="flex items-center justify-between">
      <Body>{value ? "켜짐" : "꺼짐"}</Body>
      <Switch checked={value} disabled={pending} onCheckedChange={(v) => onSave(v)} aria-label="켜고 끄기" />
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
      <SaveButton pending={pending} onClick={() => onSave(text.trim())} />
    </div>
  );
}

function SecretEditor({
  isSet,
  placeholder,
  pending,
  onSave,
}: {
  isSet: boolean;
  placeholder?: string;
  pending: boolean;
  onSave: (v: unknown) => void;
}) {
  // 지금 값은 서버가 내려주지 않는다 — 새 값을 넣어 덮어쓰는 것만 된다
  const [text, setText] = useState("");
  return (
    <div className="flex flex-col gap-2">
      <Input
        type="password"
        autoComplete="off"
        value={text}
        placeholder={isSet ? "설정돼 있어요 — 바꾸려면 새 값을 입력" : placeholder}
        onChange={(e) => setText(e.target.value)}
      />
      <SaveButton
        pending={pending}
        onClick={() => {
          if (!text.trim()) return;
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
      <SaveButton pending={pending} onClick={() => onSave({ bank: bank.trim(), number: number.trim(), holder: holder.trim() })} />
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
      <SaveButton pending={pending} onClick={() => onSave({ title: title.trim(), default_time: time, desc })} />
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
