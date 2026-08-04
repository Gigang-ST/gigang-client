"use client";

import { useEffect, useState, useCallback, useMemo } from "react";

import {
  Plus,
  Search,
  Calendar,
  MapPin,
  Users,
  Trash2,
  Pencil,
  X,
  Trophy,
} from "lucide-react";
import { useQueryState, parseAsStringLiteral, parseAsString } from "nuqs";

import { sprtCdChipClassName } from "@/lib/comp-sprt-chip-class";
import {
  cmmCdRowsForGrp,
  eventTypeCodesForSprtFromCmmRows,
  sprtCdDisplayName,
  type CachedCmmCdRow,
} from "@/lib/queries/cmm-cd-cached";
import { sanitizeAsciiUpperCompEvtTypeInput } from "@/lib/comp-evt-type";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

import {
  deleteCompetition,
  updateCompetition,
  deleteRegistration,
} from "@/app/actions/admin/manage-competition";
import { createCompetition } from "@/app/actions/create-competition";

import { H2 } from "@/components/common/typography";
import { Badge } from "@/components/ui/badge";
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
import { Skeleton } from "@/components/ui/skeleton";


type Competition = {
  id: string;
  title: string;
  sport: string | null;
  start_date: string;
  end_date: string | null;
  location: string | null;
  event_types: string[] | null;
  source_url: string | null;
  registration_count: number;
};

/** DB 타입에 FK 미노출 시 nested `comp_reg_rel(count)` 결과를 수동으로 맞춘다. */
type TeamPlanRegCountRow = {
  comp_id: string;
  comp_reg_rel?: { count: number }[] | null;
};

type Registration = {
  id: string;
  role: string;
  event_type: string | null;
  member: { full_name: string | null } | null;
};

type Filter = "upcoming" | "past" | "all";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "upcoming", label: "다가오는" },
  { value: "past", label: "지난" },
  { value: "all", label: "전체" },
];

const modes = ["list", "create", "edit", "detail"] as const;

export function AdminCompetitionsClient({
  teamId,
  cmmCdRows,
}: {
  teamId: string;
  cmmCdRows: CachedCmmCdRow[];
}) {
  return <CompetitionsContent teamId={teamId} cmmCdRows={cmmCdRows} />;
}

function CompetitionsContent({
  teamId,
  cmmCdRows,
}: {
  teamId: string;
  cmmCdRows: CachedCmmCdRow[];
}) {
  const sportSelectOptions = useMemo(
    () => cmmCdRowsForGrp(cmmCdRows, "COMP_SPRT_CD"),
    [cmmCdRows],
  );
  const defaultSportCd = sportSelectOptions[0]?.cd ?? "road_run";

  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("upcoming");
  const [search, setSearch] = useState("");
  const [mode, setMode] = useQueryState(
    "mode",
    parseAsStringLiteral(modes).withDefault("list"),
  );
  const [selectedId, setSelectedId] = useQueryState(
    "id",
    parseAsString.withDefault(""),
  );
  const selected = competitions.find((c) => c.id === selectedId) ?? null;
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  /**
   * 참가자를 이미 불러온 대회 id. "로딩 중인가"를 별도 state로 들지 않고 이걸로 **파생**한다.
   *
   * 예전엔 `setRegLoading(true)`가 이펙트에서 동기로 불렸는데, 이펙트는 화면을 커밋한 *뒤에*
   * 돌기 때문에 그 사이 브라우저가 "참가자 0명"을 한 프레임 그릴 수 있었다. 파생하면 첫 렌더부터
   * 이미 "불러오는 중"이라 그 깜빡임이 구조적으로 안 생긴다.
   */
  const [regLoadedFor, setRegLoadedFor] = useState<string | null>(null);
  /** 폼을 이미 채운 대회 id — URL 직접 진입 보정이 사용자가 입력 중인 값을 덮어쓰지 않게 한다 */
  const [formSeededFor, setFormSeededFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [customEtInput, setCustomEtInput] = useState("");

  // 폼 상태
  const [form, setForm] = useState({
    title: "",
    sport: defaultSportCd,
    startDate: "",
    endDate: "",
    location: "",
    eventTypes: [] as string[],
    sourceUrl: "",
  });

  const loadCompetitions = useCallback(async () => {
    const supabase = createClient();
    const [{ data }, { data: planRows }] = await Promise.all([
      supabase
        .from("comp_mst")
        .select(
          "comp_id, comp_nm, comp_sprt_cd, stt_dt, end_dt, loc_nm, src_url, comp_evt_cfg(comp_evt_type)",
        )
        .eq("vers", 0)
        .eq("del_yn", false)
        .order("stt_dt", { ascending: false }),
      supabase
        .from("team_comp_plan_rel")
        .select("comp_id, comp_reg_rel(count)")
        .eq("team_id", teamId)
        .eq("vers", 0)
        .eq("del_yn", false),
    ]);

    const regCountByComp = new Map<string, number>();
    for (const row of (planRows ?? []) as unknown as TeamPlanRegCountRow[]) {
      const n = row.comp_reg_rel?.[0]?.count ?? 0;
      regCountByComp.set(row.comp_id, (regCountByComp.get(row.comp_id) ?? 0) + n);
    }

    setCompetitions(
      (data ?? []).map((c: Record<string, unknown>) => ({
        id: c.comp_id as string,
        title: c.comp_nm as string,
        sport: c.comp_sprt_cd as string | null,
        start_date: c.stt_dt as string,
        end_date: c.end_dt as string | null,
        location: c.loc_nm as string | null,
        event_types: ((c.comp_evt_cfg as { comp_evt_type: string }[] | null) ?? []).map((e) => e.comp_evt_type?.toUpperCase()),
        source_url: c.src_url as string | null,
        registration_count: regCountByComp.get(c.comp_id as string) ?? 0,
      })),
    );
    setLoading(false);
  }, [teamId]);

  // 마운트 시 1회 목록 조회.
  //
  // ⚠️ 아래 disable은 **규칙이 대는 이유가 여기엔 해당하지 않아서**다: `loadCompetitions`의
  // setState는 전부 `await Promise.all(...)` 뒤에 있어 동기 연쇄 렌더가 아니다. 규칙이 async
  // 함수 안을 못 들여다보고 "이펙트가 setState 든 함수를 부른다"만 보고 잡는다.
  // (같은 이유로 걸리는 자리가 아래 참가자 조회 이펙트에 하나 더 있다.)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 위 주석 참고
    loadCompetitions();
  }, [loadCompetitions]);

  const today = new Date().toISOString().split("T")[0];
  const filtered = competitions
    .filter((c) => {
      if (filter === "upcoming" && c.start_date < today) return false;
      if (filter === "past" && c.start_date >= today) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!c.title.toLowerCase().includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) =>
      filter === "upcoming"
        ? a.start_date.localeCompare(b.start_date)
        : b.start_date.localeCompare(a.start_date),
    );

  /**
   * `isStale`은 **응답이 늦게 도착했는지** 묻는다. 대회를 빠르게 갈아타면 앞선 요청이 뒤늦게
   * 끝나 새 대회의 화면에 옛 참가자를 덮어쓸 수 있다(그러면 `regLoadedFor`가 옛 id로 되돌아가
   * 로딩 표시가 다시 켜지고 조회가 한 번 더 나간다). 호출자(이펙트)가 cleanup에서 플래그를
   * 세우고, 여기선 state를 만지기 직전마다 물어본다.
   */
  const loadRegistrations = async (
    competitionId: string,
    isStale: () => boolean = () => false,
  ) => {
    const supabase = createClient();
    const { data: plans } = await supabase
      .from("team_comp_plan_rel")
      .select("team_comp_id")
      .eq("comp_id", competitionId)
      .eq("team_id", teamId)
      .eq("vers", 0)
      .eq("del_yn", false);
    const teamCompIds = (plans ?? []).map((p) => p.team_comp_id);
    if (teamCompIds.length === 0) {
      if (isStale()) return;
      setRegistrations([]);
      setRegLoadedFor(competitionId);
      return;
    }
    const { data } = await supabase
      .from("comp_reg_rel")
      .select("comp_reg_id, prt_role_cd, mem_id, comp_evt_id")
      .in("team_comp_id", teamCompIds)
      .eq("vers", 0)
      .eq("del_yn", false);
    const memIds = [...new Set((data ?? []).map((r) => r.mem_id).filter(Boolean))];
    const evtIds = [...new Set((data ?? []).map((r) => r.comp_evt_id).filter((v): v is string => Boolean(v)))];
    const { data: members } = memIds.length
      ? await supabase.from("mem_mst").select("mem_id, mem_nm").in("mem_id", memIds)
      : { data: [] as { mem_id: string; mem_nm: string | null }[] };
    const { data: evts } = evtIds.length
      ? await supabase.from("comp_evt_cfg").select("comp_evt_id, comp_evt_type").in("comp_evt_id", evtIds)
      : { data: [] as { comp_evt_id: string; comp_evt_type: string | null }[] };
    const memNameById = new Map((members ?? []).map((m) => [m.mem_id, m.mem_nm]));
    const evtCdById = new Map((evts ?? []).map((e) => [e.comp_evt_id, e.comp_evt_type]));
    const mapped = (data ?? []).map((r) => ({
      id: r.comp_reg_id,
      role: r.prt_role_cd,
      event_type: r.comp_evt_id ? (evtCdById.get(r.comp_evt_id) ?? null) : null,
      member: { full_name: memNameById.get(r.mem_id) ?? null },
    }));
    if (isStale()) return;
    setRegistrations(mapped);
    setRegLoadedFor(competitionId);
  };

  // URL로 직접 접근 시 대회를 찾을 수 없으면 목록으로 복귀
  useEffect(() => {
    if ((mode === "detail" || mode === "edit") && selectedId && !selected && !loading) {
      setMode("list");
      setSelectedId("");
    }
  }, [mode, selectedId, selected, loading, setMode, setSelectedId]);

  // URL로 edit 모드에 직접 들어온 경우 폼 채우기 — 그때는 목록이 아직 안 와서 `selected`가
  // null이라 `openEdit`이 못 채운다. 목록이 도착해 `selected`가 생기는 순간 여기서 메운다.
  //
  // **이펙트가 아니라 렌더 중에 한다.** 이펙트는 화면을 커밋한 뒤에 돌아서 빈 폼이 한 프레임
  // 스칠 수 있지만, 렌더 중 setState는 React가 공식 지원하는 패턴이라 중간 결과를 버리고
  // 즉시 다시 그린다(https://react.dev/learn/you-might-not-need-an-effect).
  // `formSeededFor`가 사용자가 입력 중인 값을 덮어쓰는 걸 막는다 — 대회당 한 번만 메운다.
  //
  // ⚠️ 편집 화면을 벗어나면 **반드시 시드를 푼다.** 안 그러면 같은 대회로 다시 들어왔을 때
  //    `formSeededFor === selected.id`라 재시드가 안 걸려 아까 입력하다 만 값이 그대로 뜬다.
  //    "취소" 버튼마다 개별로 푸는 건 부족하다 — `mode`가 URL 상태(nuqs)라 **브라우저 뒤로가기**로도
  //    edit에 되돌아오는데 그 경로엔 핸들러가 없다. 나가는 쪽이 아니라 "edit이 아니면 푼다"로
  //    두면 어떤 경로로 나갔든 다시 들어올 때 현재 대회 값으로 새로 채워진다.
  if (mode !== "edit" && formSeededFor !== null) {
    setFormSeededFor(null);
  }

  if (mode === "edit" && selected && formSeededFor !== selected.id) {
    setFormSeededFor(selected.id);
    setForm({
      title: selected.title,
      sport: selected.sport ?? defaultSportCd,
      startDate: selected.start_date,
      endDate: selected.end_date ?? "",
      location: selected.location ?? "",
      eventTypes: selected.event_types ?? [],
      sourceUrl: selected.source_url ?? "",
    });
  }

  // 참가자도 같은 사정 — URL로 detail에 직접 들어오면 `openDetail`이 안 거쳐진다.
  // 이건 네트워크 요청이라 렌더 중에 할 수 없어 이펙트로 남긴다. `regLoadedFor` 덕분에
  // 클릭으로 들어온 경우엔 다시 부르지 않는다(예전엔 openDetail과 이 이펙트가 겹쳐 **두 번** 돌았다).
  useEffect(() => {
    if (mode !== "detail" || !selected || regLoadedFor === selected.id) return;

    // 대회를 갈아타면 cleanup이 이 플래그를 세워, 늦게 온 앞선 응답이 새 화면을 덮지 못하게 한다.
    let stale = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setState가 전부 await 뒤라 동기 연쇄가 아니다(위 목록 조회와 같은 사정)
    void loadRegistrations(selected.id, () => stale);
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadRegistrations는 매 렌더 새로 만들어져 넣으면 무한루프가 된다
  }, [mode, selected, regLoadedFor]);

  const openDetail = (comp: Competition) => {
    setSelectedId(comp.id);
    setMode("detail");
    // 조회는 **위 이펙트 한 곳**이 맡는다. 여기서도 부르면 이펙트와 겹쳐 두 번 돌았다.
    // null로 되돌려 "아직 안 불러온 대회"로 만들면 이펙트가 받아서 조회하고, 그동안
    // `regLoading`(파생)이 켜져 이전 대회의 참가자 목록이 비치지 않는다.
    setRegLoadedFor(null);
  };

  const openEdit = (comp: Competition) => {
    setSelectedId(comp.id);
    setFormSeededFor(comp.id);
    setForm({
      title: comp.title,
      sport: comp.sport ?? defaultSportCd,
      startDate: comp.start_date,
      endDate: comp.end_date ?? "",
      location: comp.location ?? "",
      eventTypes: comp.event_types ?? [],
      sourceUrl: comp.source_url ?? "",
    });
    setMode("edit");
  };

  const openCreate = () => {
    setSelectedId("");
    setFormSeededFor(null);
    setForm({
      title: "",
      sport: sportSelectOptions[0]?.cd ?? "road_run",
      startDate: "",
      endDate: "",
      location: "",
      eventTypes: [],
      sourceUrl: "",
    });
    setMode("create");
  };

  /** 참가자 로딩 표시 — state가 아니라 파생값이라 첫 렌더부터 이미 "불러오는 중"이다 */
  const regLoading =
    mode === "detail" && selected != null && regLoadedFor !== selected.id;

  const formEventTypeCodes = eventTypeCodesForSprtFromCmmRows(cmmCdRows, form.sport);

  const toggleEventType = (et: string) => {
    setForm((prev) => ({
      ...prev,
      eventTypes: prev.eventTypes.includes(et)
        ? prev.eventTypes.filter((e) => e !== et)
        : [...prev.eventTypes, et],
    }));
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.startDate) {
      alert("대회명과 시작일은 필수입니다");
      return;
    }
    setSaving(true);

    if (mode === "create") {
      const result = await createCompetition({
        title: form.title,
        sport: form.sport,
        startDate: form.startDate,
        endDate: form.endDate || null,
        location: form.location,
        eventTypes: form.eventTypes,
        sourceUrl: form.sourceUrl,
      });
      if (!result.ok) {
        alert(result.message);
        setSaving(false);
        return;
      }
    } else if (mode === "edit" && selected) {
      const result = await updateCompetition(selected.id, {
        title: form.title,
        sport: form.sport,
        startDate: form.startDate,
        endDate: form.endDate || null,
        location: form.location,
        eventTypes: form.eventTypes,
        sourceUrl: form.sourceUrl,
      });
      if (!result.ok) {
        alert(result.message);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    setMode("list");
    setSelectedId("");
    loadCompetitions();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("대회를 삭제하시겠습니까? 참가 등록도 함께 삭제됩니다."))
      return;
    const result = await deleteCompetition(id);
    if (result.ok) {
      setMode("list");
      setSelectedId("");
      loadCompetitions();
    } else {
      alert(result.message);
    }
  };

  const handleDeleteRegistration = async (regId: string) => {
    if (!confirm("참가를 취소하시겠습니까?")) return;
    const result = await deleteRegistration(regId);
    if (result.ok) {
      setRegistrations((prev) => prev.filter((r) => r.id !== regId));
    } else {
      alert(result.message);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-4 px-6 pt-4">
        <Skeleton className="h-8 w-32 rounded" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  // 생성/수정 폼
  if (mode === "create" || mode === "edit") {
    return (
      <div className="flex flex-col gap-6 px-6 pb-6 pt-4">
        <div className="flex items-center justify-between">
          <H2>{mode === "create" ? "대회 등록" : "대회 수정"}</H2>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => { setMode("list"); setSelectedId(""); }}
            className="text-muted-foreground"
          >
            <X className="size-5" />
          </Button>
        </div>

        {/* 대회명 */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground">대회명</label>
          <Input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="대회 이름"
            className="h-12 rounded-xl border-[1.5px] text-[15px]"
          />
        </div>

        {/* 종목 */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground">종목</label>
          <Select
            value={form.sport}
            onValueChange={(v) =>
              { setForm({ ...form, sport: v, eventTypes: [] }); setCustomEtInput(""); }
            }
          >
            <SelectTrigger className="h-12 rounded-xl border-[1.5px] text-[15px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sportSelectOptions.map((s) => (
                <SelectItem key={s.cd} value={s.cd}>
                  {s.cd_nm}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 날짜 */}
        <div className="flex gap-3">
          <div className="flex flex-1 flex-col gap-2">
            <label className="text-sm font-medium text-foreground">
              시작일
            </label>
            <Input
              type="date"
              max="9999-12-31"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              className="h-12 rounded-xl border-[1.5px] text-[15px]"
            />
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <label className="text-sm font-medium text-foreground">
              종료일
            </label>
            <Input
              type="date"
              max="9999-12-31"
              value={form.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              className="h-12 rounded-xl border-[1.5px] text-[15px]"
            />
          </div>
        </div>

        {/* 장소 */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground">장소</label>
          <Input
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            placeholder="서울 여의도"
            className="h-12 rounded-xl border-[1.5px] text-[15px]"
          />
        </div>

        {/* 세부종목 */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground">
            세부종목
          </label>
          {/* 기본 목록 토글 */}
          <div className="flex flex-wrap gap-2">
            {formEventTypeCodes.map((et) => (
              <Button
                key={et}
                variant="outline"
                size="sm"
                onClick={() => toggleEventType(et)}
                className={cn(
                  "rounded-lg text-[13px] font-medium",
                  form.eventTypes.includes(et)
                    ? "border-primary bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary"
                    : "text-muted-foreground",
                )}
              >
                {et}
              </Button>
            ))}
          </div>
          {/* 직접 추가한 커스텀 코스 태그 */}
          {form.eventTypes.filter(t => !formEventTypeCodes.includes(t)).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {form.eventTypes.filter(t => !formEventTypeCodes.includes(t)).map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setForm({ ...form, eventTypes: form.eventTypes.filter(t2 => t2 !== type) })}
                  className="flex items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-medium text-primary-foreground"
                >
                  {type} ×
                </button>
              ))}
            </div>
          )}
          {/* 직접 입력 */}
          <div className="flex gap-1.5">
            <Input
              placeholder="직접 입력 (예: 12K, TRAIL100)"
              value={customEtInput}
              onChange={(e) => setCustomEtInput(sanitizeAsciiUpperCompEvtTypeInput(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const val = customEtInput.trim();
                  if (!val || form.eventTypes.includes(val)) return;
                  setForm({ ...form, eventTypes: [...form.eventTypes, val] });
                  setCustomEtInput("");
                }
              }}
              className="h-10 rounded-xl border-[1.5px] text-[13px]"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const val = customEtInput.trim();
                if (!val || form.eventTypes.includes(val)) return;
                setForm({ ...form, eventTypes: [...form.eventTypes, val] });
                setCustomEtInput("");
              }}
            >
              추가
            </Button>
          </div>
        </div>

        {/* URL */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground">
            대회 URL (선택)
          </label>
          <Input
            value={form.sourceUrl}
            onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })}
            placeholder="https://..."
            className="h-12 rounded-xl border-[1.5px] text-[15px]"
          />
        </div>

        {/* 저장 */}
        <Button
          onClick={handleSave}
          disabled={saving}
          className="h-[52px] w-full rounded-xl text-base font-semibold"
        >
          {saving
            ? "저장 중..."
            : mode === "create"
              ? "등록"
              : "수정"}
        </Button>
      </div>
    );
  }

  // 대회 상세 (참가자 포함)
  if (mode === "detail" && selected) {
    const sportChipClass = sprtCdChipClassName(selected.sport);
    const sportLabel = sprtCdDisplayName(cmmCdRows, selected.sport);
    const roleLabels: Record<string, string> = {
      participant: "참가",
      cheering: "응원",
      volunteer: "봉사",
    };

    return (
      <div className="flex flex-col gap-6 px-6 pb-6 pt-4">
        <div className="flex items-center justify-between">
          <H2>대회 상세</H2>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => { setMode("list"); setSelectedId(""); }}
            className="text-muted-foreground"
          >
            <X className="size-5" />
          </Button>
        </div>

        {/* 대회 정보 카드 */}
        <CardItem className="flex flex-col gap-3 p-5">
          <div className="flex items-center gap-2">
            <Badge className={cn("text-[11px]", sportChipClass)}>
              {sportLabel}
            </Badge>
            {selected.event_types?.map((et) => (
              <Badge key={et} variant="outline" className="text-[11px]">
                {et}
              </Badge>
            ))}
          </div>
          <h2 className="text-lg font-bold text-foreground">
            {selected.title}
          </h2>
          <div className="flex flex-col gap-2 text-[13px] text-muted-foreground">
            <div className="flex items-center gap-2">
              <Calendar className="size-3.5" />
              <span>
                {selected.start_date}
                {selected.end_date && ` ~ ${selected.end_date}`}
              </span>
            </div>
            {selected.location && (
              <div className="flex items-center gap-2">
                <MapPin className="size-3.5" />
                <span>{selected.location}</span>
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => openEdit(selected)}
              className="flex-1 rounded-xl py-3 text-[14px] font-medium"
            >
              <Pencil className="size-3.5" />
              수정
            </Button>
            <Button
              variant="outline"
              onClick={() => handleDelete(selected.id)}
              className="flex-1 rounded-xl py-3 text-[14px] font-medium text-destructive hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
              삭제
            </Button>
          </div>
        </CardItem>

        {/* 참가자 목록 */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-muted-foreground" />
            <span className="text-[15px] font-semibold text-foreground">
              참가자 ({registrations.length})
            </span>
          </div>

          {regLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-xl" />
            ))
          ) : registrations.length === 0 ? (
            <p className="py-6 text-center text-[14px] text-muted-foreground">
              참가자가 없습니다
            </p>
          ) : (
            registrations.map((reg) => (
              <div
                key={reg.id}
                className="flex items-center justify-between rounded-xl border-[1.5px] border-border px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className="text-[14px] font-medium text-foreground">
                    {reg.member?.full_name ?? "이름 없음"}
                  </span>
                  <Badge variant="secondary" className="text-[11px]">
                    {roleLabels[reg.role] ?? reg.role}
                  </Badge>
                  {reg.event_type && (
                    <Badge variant="outline" className="text-[11px]">
                      {reg.event_type}
                    </Badge>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleDeleteRegistration(reg.id)}
                  className="text-muted-foreground active:text-destructive"
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  // 목록
  return (
    <div className="flex flex-col gap-4 px-6 pb-6 pt-4">
      <div className="flex items-center justify-between">
        <H2>대회 관리</H2>
        <Button
          size="icon"
          onClick={openCreate}
          className="rounded-xl"
        >
          <Plus className="size-5" />
        </Button>
      </div>

      {/* 검색 */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="대회명 검색"
          className="h-12 rounded-xl border-[1.5px] pl-10 text-[15px]"
        />
      </div>

      {/* 필터 */}
      <div className="flex gap-0 rounded-xl bg-secondary p-1">
        {FILTERS.map((f) => (
          <Button
            key={f.value}
            variant="ghost"
            size="sm"
            onClick={() => setFilter(f.value)}
            className={cn(
              "flex-1 rounded-lg text-[13px] font-medium",
              filter === f.value
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "text-muted-foreground",
            )}
          >
            {f.label}
          </Button>
        ))}
      </div>

      <span className="text-[13px] text-muted-foreground">
        {filtered.length}개
      </span>

      {/* 대회 목록 */}
      <div className="flex flex-col gap-3">
        {filtered.map((comp) => {
          const sportChipClass = sprtCdChipClassName(comp.sport);
          const sportLabel = sprtCdDisplayName(cmmCdRows, comp.sport);
          return (
            <CardItem asChild key={comp.id} className="flex flex-col gap-2.5">
              <button
                onClick={() => openDetail(comp)}
                className="text-left transition-colors active:bg-secondary"
              >
              <div className="flex items-center gap-2">
                <Badge
                  className={cn(
                    "border-transparent text-[11px]",
                    sportChipClass,
                  )}
                >
                  {sportLabel}
                </Badge>
                {comp.start_date < today && (
                  <Badge variant="secondary" className="text-[11px]">
                    종료
                  </Badge>
                )}
              </div>
              <span className="text-[15px] font-semibold text-foreground">
                {comp.title}
              </span>
              <div className="flex items-center gap-4 text-[12px] text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Calendar className="size-3" />
                  <span>{comp.start_date}</span>
                </div>
                {comp.location && (
                  <div className="flex items-center gap-1">
                    <MapPin className="size-3" />
                    <span>{comp.location}</span>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <Users className="size-3" />
                  <span>{comp.registration_count}</span>
                </div>
              </div>
              </button>
            </CardItem>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-12">
          <Trophy className="size-12 text-muted-foreground/30" />
          <p className="text-[15px] text-muted-foreground">대회가 없습니다</p>
        </div>
      )}
    </div>
  );
}
