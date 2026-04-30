"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Save } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { createTitle, updateTitle } from "@/app/actions/admin/manage-title";
import { H2 } from "@/components/common/typography";
import { Button } from "@/components/ui/button";
import { CardItem } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CachedCmmCdRow } from "@/lib/queries/cmm-cd-cached";
import { cmmCdRowsForGrp } from "@/lib/queries/cmm-cd-cached";

type TitleRow = {
  ttl_id: string;
  ttl_nm: string;
  ttl_kind_enm: "auto" | "awarded";
  ttl_ctgr_cd: string;
  ttl_desc: string | null;
  ttl_rank: number;
  base_pt: number;
  sort_ord: number;
  use_yn: boolean;
  cond_rule_json: unknown | null;
};

type TitleForm = {
  ttlNm: string;
  ttlKindEnm: "auto" | "awarded";
  ttlCtgrCd: string;
  ttlDesc: string;
  ttlRank: string;
  basePt: string;
  sortOrd: string;
  useYn: "true" | "false";
  condRuleJson: string;
};

const TITLE_KIND_OPTIONS: { value: "auto" | "awarded"; label: string }[] = [
  { value: "auto", label: "자동" },
  { value: "awarded", label: "수여" },
];

function toForm(row: TitleRow): TitleForm {
  return {
    ttlNm: row.ttl_nm ?? "",
    ttlKindEnm: row.ttl_kind_enm,
    ttlCtgrCd: row.ttl_ctgr_cd ?? "",
    ttlDesc: row.ttl_desc ?? "",
    ttlRank: String(row.ttl_rank ?? 0),
    basePt: String(row.base_pt ?? 0),
    sortOrd: String(row.sort_ord ?? 100),
    useYn: row.use_yn ? "true" : "false",
    condRuleJson: row.cond_rule_json ? JSON.stringify(row.cond_rule_json) : "",
  };
}

function buildEmptyForm(defaultCategory: string): TitleForm {
  return {
    ttlNm: "",
    ttlKindEnm: "auto",
    ttlCtgrCd: defaultCategory,
    ttlDesc: "",
    ttlRank: "0",
    basePt: "0",
    sortOrd: "100",
    useYn: "true",
    condRuleJson: "",
  };
}

export function AdminTitlesClient({
  teamId,
  cmmCdRows,
}: {
  teamId: string;
  cmmCdRows: CachedCmmCdRow[];
}) {
  const categoryOptions = useMemo(
    () => cmmCdRowsForGrp(cmmCdRows, "TTL_CTGR_CD"),
    [cmmCdRows],
  );
  const defaultCategory = categoryOptions[0]?.cd ?? "awarded";

  const [rows, setRows] = useState<TitleRow[]>([]);
  const [forms, setForms] = useState<Record<string, TitleForm>>({});
  const [newForm, setNewForm] = useState<TitleForm>(() =>
    buildEmptyForm(defaultCategory),
  );
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedId, setSelectedId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const loadTitles = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("ttl_mst")
      .select(
        "ttl_id, ttl_nm, ttl_kind_enm, ttl_ctgr_cd, ttl_desc, ttl_rank, base_pt, sort_ord, use_yn, cond_rule_json",
      )
      .eq("team_id", teamId)
      .eq("vers", 0)
      .eq("del_yn", false)
      .order("sort_ord", { ascending: true })
      .order("ttl_rank", { ascending: true });

    const nextRows = (data ?? []) as TitleRow[];
    setRows(nextRows);
    setForms(
      Object.fromEntries(nextRows.map((row) => [row.ttl_id, toForm(row)])),
    );
    setSelectedId((prev) => {
      if (nextRows.length === 0) return "";
      if (prev && nextRows.some((row) => row.ttl_id === prev)) return prev;
      return nextRows[0].ttl_id;
    });
    setLoading(false);
  }, [teamId]);

  useEffect(() => {
    void loadTitles();
  }, [loadTitles]);

  const updateFormField = (
    ttlId: string,
    key: keyof TitleForm,
    value: string,
  ) => {
    setForms((prev) => ({
      ...prev,
      [ttlId]: {
        ...prev[ttlId],
        [key]: value,
      },
    }));
  };

  const saveRow = async (ttlId: string) => {
    const form = forms[ttlId];
    if (!form) return;
    setSavingId(ttlId);
    const result = await updateTitle(ttlId, form);
    if (!result.ok) {
      alert(result.message ?? "칭호 수정에 실패했습니다.");
      setSavingId(null);
      return;
    }
    await loadTitles();
    setSavingId(null);
  };

  const createRow = async () => {
    setCreating(true);
    const result = await createTitle(newForm);
    if (!result.ok) {
      alert(result.message ?? "칭호 등록에 실패했습니다.");
      setCreating(false);
      return;
    }
    setNewForm(buildEmptyForm(defaultCategory));
    setShowCreateForm(false);
    await loadTitles();
    setCreating(false);
  };

  const selectedRow = rows.find((row) => row.ttl_id === selectedId) ?? null;
  const selectedForm = selectedRow ? forms[selectedRow.ttl_id] ?? toForm(selectedRow) : null;

  return (
    <div className="flex flex-col gap-4 px-6 pb-6 pt-4">
      <div className="flex items-center justify-between">
        <H2>칭호 관리</H2>
        <Button
          size="sm"
          onClick={() => {
            setShowCreateForm((prev) => !prev);
            setNewForm(buildEmptyForm(defaultCategory));
          }}
          className="h-8 rounded-lg"
        >
          <Plus className="size-4" />
          신규
        </Button>
      </div>

      {showCreateForm && (
        <CardItem className="flex flex-col gap-3">
          <p className="text-sm font-semibold text-foreground">신규 칭호 등록</p>
          <TitleFormFields
            form={newForm}
            categoryOptions={categoryOptions}
            onChange={(key, value) =>
              setNewForm((prev) => ({ ...prev, [key]: value }))
            }
          />
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setShowCreateForm(false)}
              className="h-10 rounded-lg"
            >
              취소
            </Button>
            <Button
              onClick={createRow}
              disabled={creating}
              className="h-10 rounded-lg"
            >
              <Plus className="size-4" />
              {creating ? "등록 중..." : "등록"}
            </Button>
          </div>
        </CardItem>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">불러오는 중...</p>
      ) : (
        <CardItem className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] table-fixed border-collapse text-[11px] [font-variant-numeric:tabular-nums]">
              <colgroup>
                <col style={{ width: "34%" }} />
                <col style={{ width: "11%" }} />
                <col style={{ width: "17%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "10%" }} />
              </colgroup>
              <thead className="bg-muted/40">
                <tr className="border-b">
                  <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">칭호명</th>
                  <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">유형</th>
                  <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">카테고리</th>
                  <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">등급</th>
                  <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">점수</th>
                  <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">정렬</th>
                  <th className="px-2 py-1.5 text-center font-medium text-muted-foreground">사용</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-2 py-6 text-center text-xs text-muted-foreground"
                    >
                      등록된 칭호가 없습니다.
                    </td>
                  </tr>
                ) : rows.map((row) => {
                  const active = row.ttl_id === selectedId;
                  return (
                    <tr
                      key={row.ttl_id}
                      onClick={() => setSelectedId(row.ttl_id)}
                      className={`cursor-pointer border-b transition-colors hover:bg-muted/30 ${
                        active ? "bg-primary/5" : ""
                      }`}
                    >
                      <td className="truncate px-2 py-1.5 font-medium text-foreground">{row.ttl_nm}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{row.ttl_kind_enm === "auto" ? "자동" : "수여"}</td>
                      <td className="truncate px-2 py-1.5 text-muted-foreground">{categoryOptions.find((c) => c.cd === row.ttl_ctgr_cd)?.cd_nm ?? row.ttl_ctgr_cd}</td>
                      <td className="px-2 py-1.5 text-right text-muted-foreground">{row.ttl_rank}</td>
                      <td className="px-2 py-1.5 text-right text-muted-foreground">{row.base_pt}</td>
                      <td className="px-2 py-1.5 text-right text-muted-foreground">{row.sort_ord}</td>
                      <td className="px-2 py-1.5 text-center text-muted-foreground">{row.use_yn ? "사용" : "미사용"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardItem>
      )}

      {selectedRow && selectedForm && (
        <CardItem className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">
              선택 칭호 수정: {selectedRow.ttl_nm}
            </p>
            <Button
              size="sm"
              onClick={() => saveRow(selectedRow.ttl_id)}
              disabled={savingId === selectedRow.ttl_id}
              className="h-8 rounded-lg"
            >
              <Save className="size-3.5" />
              {savingId === selectedRow.ttl_id ? "저장 중..." : "저장"}
            </Button>
          </div>
          <TitleFormFields
            form={selectedForm}
            categoryOptions={categoryOptions}
            onChange={(key, value) =>
              updateFormField(selectedRow.ttl_id, key, value)
            }
          />
        </CardItem>
      )}
    </div>
  );
}

function TitleFormFields({
  form,
  categoryOptions,
  onChange,
}: {
  form: TitleForm;
  categoryOptions: { cd: string; cd_nm: string }[];
  onChange: (key: keyof TitleForm, value: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <LabeledInput
        label="칭호명"
        value={form.ttlNm}
        onChange={(v) => onChange("ttlNm", v)}
      />

      <LabeledSelect
        label="칭호 유형"
        value={form.ttlKindEnm}
        onChange={(v) => onChange("ttlKindEnm", v)}
        items={TITLE_KIND_OPTIONS.map((item) => ({
          value: item.value,
          label: item.label,
        }))}
      />

      <LabeledSelect
        label="카테고리"
        value={form.ttlCtgrCd}
        onChange={(v) => onChange("ttlCtgrCd", v)}
        items={categoryOptions.map((item) => ({
          value: item.cd,
          label: item.cd_nm,
        }))}
      />

      <LabeledSelect
        label="사용 여부"
        value={form.useYn}
        onChange={(v) => onChange("useYn", v)}
        items={[
          { value: "true", label: "사용" },
          { value: "false", label: "미사용" },
        ]}
      />

      <LabeledInput
        label="등급"
        type="number"
        value={form.ttlRank}
        onChange={(v) => onChange("ttlRank", v)}
      />

      <LabeledInput
        label="기본 점수"
        type="number"
        value={form.basePt}
        onChange={(v) => onChange("basePt", v)}
      />

      <LabeledInput
        label="정렬 순서"
        type="number"
        value={form.sortOrd}
        onChange={(v) => onChange("sortOrd", v)}
      />

      <LabeledInput
        label="설명"
        value={form.ttlDesc}
        onChange={(v) => onChange("ttlDesc", v)}
      />

      <div className="sm:col-span-2">
        <LabeledInput
          label="자동 조건(JSON)"
          value={form.condRuleJson}
          onChange={(v) => onChange("condRuleJson", v)}
          placeholder='예: {"full_pb_sec":12600}'
        />
      </div>
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "number";
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 rounded-lg"
      />
    </div>
  );
}

function LabeledSelect({
  label,
  value,
  onChange,
  items,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  items: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-10 rounded-lg">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
