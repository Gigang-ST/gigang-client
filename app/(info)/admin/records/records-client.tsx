"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Plus, Search, Timer } from "lucide-react";

import { deleteRecord, updateRecord } from "@/app/actions/admin/manage-record";
import { adminSaveRaceRecord } from "@/app/actions/save-race-record";
import { EmptyState } from "@/components/common/empty-state";
import { Caption, H2 } from "@/components/common/typography";
import { RaceRecordDialog } from "@/components/profile/race-record-dialog";
import type { MemberStatus } from "@/components/races/types";
import { Button } from "@/components/ui/button";
import { CardItem } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { todayKST } from "@/lib/dayjs";
import { normalizeCompEvtTypeKey } from "@/lib/comp-evt-type";
import type { CachedCmmCdRow } from "@/lib/queries/cmm-cd-cached";
import { createClient } from "@/lib/supabase/client";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { cn } from "@/lib/utils";

import { adminRecordEventLabel } from "./record-event-label";
import { RecordDetailDrawer } from "./record-detail-drawer";
import { RecordMemberPicker } from "./record-member-picker";
import { RecordRow } from "./record-row";
import {
  ALL,
  eventOptions,
  filterRecords,
  findRecordIssues,
  periodOptions,
  RECORD_SORT_OPTIONS,
  sortRecords,
  type AdminRecordRow,
  type RecordSort,
} from "./records-view";

/** 기록 등록 대상 후보(활동 중 회원). `label`은 동명이인이면 구분 값이 붙은 표시 이름. */
export type RecordMemberOption = {
  memId: string;
  name: string;
  label: string;
};

/** 한 번에 그리는 줄 수 — 넘치면 「더 보기」. 300건 가까운 목록을 한 번에 그리지 않는다 */
const PAGE_SIZE = 100;

export function RecordsClient({
  teamId,
  members,
  cmmCdRows,
  registrantStatus,
}: {
  teamId: string;
  members: RecordMemberOption[];
  cmmCdRows: CachedCmmCdRow[];
  /** 「대회 추가」용 — 관리자 본인 상태 */
  registrantStatus: MemberStatus;
}) {
  const [records, setRecords] = useState<AdminRecordRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [event, setEvent] = useState<string>(ALL);
  const [period, setPeriod] = useState<string>(ALL);
  const [sort, setSort] = useState<RecordSort>("created");
  const [issuesOnly, setIssuesOnly] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // 기록 등록: 회원 고르기 → 회원 기록 입력 다이얼로그(본인 등록과 같은 화면)
  const [pickerOpen, setPickerOpen] = useState(false);
  const [target, setTarget] = useState<RecordMemberOption | null>(null);

  // 전부 읽는다. 예전엔 대회일 순 200건에서 잘라서, 지난 대회 기록을 대신 등록하면 저장은 됐는데
  // 목록에 안 보였다(prd 263건 — 이미 63건이 잘려 있었다). 기록은 시간이 갈수록 느는 조회라 끝까지
  // 읽는다(§대량 조회). 정렬은 화면이 고르므로 여기선 등록 최신순으로만 받는다. 실패하면 빈 목록 대신 알린다.
  const loadRecords = useCallback(async () => {
    const supabase = createClient();
    let data;
    try {
      data = await fetchAllRows(
        () =>
          supabase
            .from("rec_race_hist")
            .select(
              "race_result_id, mem_id, comp_id, crt_at, comp_evt_cfg!fk_rec_race_hist__comp_evt_cfg_pair(comp_evt_type), comp_mst!fk_rec_race_hist__comp_mst(comp_sprt_cd), rec_time_sec, race_nm, race_dt, mem_mst!fk_rec_race_hist__mem_mst!inner(mem_nm, team_mem_rel!inner(team_id, vers, del_yn))",
            )
            .eq("del_yn", false)
            .eq("vers", 0)
            // 대회 기록은 사람 것이라 팀 칸이 없다 — 이 팀 회원의 기록만 보인다(수정·삭제 권한
            // recordOwnerInTeam 과 같은 기준). 두 팀 소속자의 기록은 양쪽 관리자에게 다 보인다(의도).
            .eq("mem_mst.team_mem_rel.team_id", teamId)
            .eq("mem_mst.team_mem_rel.vers", 0)
            .eq("mem_mst.team_mem_rel.del_yn", false)
            .order("crt_at", { ascending: false })
            .order("race_result_id"),
        { label: "admin-records:rec_race_hist" },
      );
    } catch (e) {
      console.error(e);
      setLoadError(true);
      setLoading(false);
      return;
    }
    setLoadError(false);
    setRecords(
      data.map((r): AdminRecordRow => {
        const sprtCd = (Array.isArray(r.comp_mst) ? r.comp_mst[0] : r.comp_mst)?.comp_sprt_cd ?? null;
        const evtType = (Array.isArray(r.comp_evt_cfg) ? r.comp_evt_cfg[0] : r.comp_evt_cfg)?.comp_evt_type ?? "";
        return {
          id: r.race_result_id,
          memId: r.mem_id,
          memNm: (Array.isArray(r.mem_mst) ? r.mem_mst[0] : r.mem_mst)?.mem_nm ?? null,
          compId: r.comp_id,
          sprtCd,
          evtCd: normalizeCompEvtTypeKey(evtType),
          // 스포츠까지 붙여 찍는다 — 코드만이면 철인 FULL 과 마라톤 FULL 이 같은 배지라 섞여도 못 가린다(#581).
          // 검색·종목 필터도 이 문자열을 본다.
          eventLabel: adminRecordEventLabel(cmmCdRows, sprtCd, evtType),
          recordTimeSec: r.rec_time_sec,
          raceName: r.race_nm,
          raceDate: r.race_dt,
          createdAt: r.crt_at,
        };
      }),
    );
    setLoading(false);
  }, [teamId, cmmCdRows]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadRecords();
  }, [loadRecords]);

  // 이상 판정은 **전체** 기록으로 한다 — 거른 목록으로 하면 중복 짝 한쪽이 걸러질 때 배지가 사라진다
  const issues = useMemo(() => findRecordIssues(records), [records]);
  const events = useMemo(() => eventOptions(records), [records]);
  const periods = useMemo(() => periodOptions(records), [records]);
  const shown = useMemo(
    () => sortRecords(filterRecords(records, { search, event, period, issuesOnly }, issues, todayKST()), sort),
    [records, search, event, period, issuesOnly, issues, sort],
  );
  const selected = selectedId ? (records.find((r) => r.id === selectedId) ?? null) : null;

  // 조건이 바뀌면 처음 한 쪽부터 다시 보인다
  const resetLimit = () => setLimit(PAGE_SIZE);

  const handleDelete = async (record: AdminRecordRow): Promise<boolean> => {
    if (!confirm("기록을 삭제하시겠습니까?")) return false;
    const result = await deleteRecord(record.id);
    if (!result.ok) {
      alert(result.message);
      return false;
    }
    setRecords((prev) => prev.filter((r) => r.id !== record.id));
    setSelectedId(null);
    return true;
  };

  const handleUpdateTime = async (record: AdminRecordRow, timeSec: number): Promise<boolean> => {
    const result = await updateRecord(record.id, {
      recordTimeSec: timeSec,
      raceName: record.raceName ?? "",
      raceDate: record.raceDate ?? "",
    });
    if (!result.ok) {
      alert(result.message);
      return false;
    }
    setRecords((prev) => prev.map((r) => (r.id === record.id ? { ...r, recordTimeSec: timeSec } : r)));
    return true;
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-3 px-6 pt-4">
        <Skeleton className="h-8 w-32 rounded" />
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-9 w-full rounded-md" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-6 pb-6 pt-4">
      <div className="flex items-center justify-between">
        <H2>기록 관리</H2>
        <Button size="sm" onClick={() => setPickerOpen(true)}>
          <Plus className="size-4" />
          기록 등록
        </Button>
      </div>

      {/* 검색 */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            resetLimit();
          }}
          placeholder="이름, 대회명, 종목 검색"
          className="h-10 rounded-xl pl-9"
        />
      </div>

      {/* 종목 · 기간 · 정렬 */}
      <div className="grid grid-cols-3 gap-2">
        <FilterSelect
          label="종목"
          value={event}
          options={events}
          onChange={(v) => {
            setEvent(v);
            resetLimit();
          }}
        />
        <FilterSelect
          label="기간"
          value={period}
          options={periods}
          onChange={(v) => {
            setPeriod(v);
            resetLimit();
          }}
        />
        <FilterSelect
          label="정렬"
          value={sort}
          options={RECORD_SORT_OPTIONS}
          onChange={(v) => {
            setSort(v as RecordSort);
            resetLimit();
          }}
        />
      </div>

      <div className="flex items-center justify-between">
        <Caption>
          <span className="font-semibold text-foreground">{shown.length}</span>건
          {shown.length !== records.length && ` / 전체 ${records.length}건`}
        </Caption>
        {issues.size > 0 && (
          <button
            type="button"
            aria-pressed={issuesOnly}
            onClick={() => {
              setIssuesOnly((v) => !v);
              resetLimit();
            }}
            className={cn(
              "flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
              issuesOnly
                ? "border-warning bg-warning text-warning-foreground"
                : "border-warning/50 text-warning",
            )}
          >
            <AlertTriangle className="size-3.5" />
            확인 필요 {issues.size}건
          </button>
        )}
      </div>

      {loadError ? (
        <p className="py-12 text-center text-[15px] text-destructive">
          기록을 불러오지 못했어요. 새로고침해 주세요.
        </p>
      ) : shown.length === 0 ? (
        <EmptyState variant="card" icon={Timer} message="조건에 맞는 기록이 없습니다." />
      ) : (
        <>
          <CardItem className="flex flex-col divide-y divide-border overflow-hidden p-0">
            {shown.slice(0, limit).map((r) => (
              <RecordRow key={r.id} record={r} issues={issues.get(r.id)} onSelect={() => setSelectedId(r.id)} />
            ))}
          </CardItem>
          {shown.length > limit && (
            <Button variant="outline" onClick={() => setLimit((n) => n + PAGE_SIZE)}>
              더 보기 ({shown.length - limit}건 남음)
            </Button>
          )}
        </>
      )}

      <RecordDetailDrawer
        record={selected}
        issues={selected ? issues.get(selected.id) : undefined}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
        onUpdateTime={handleUpdateTime}
        onDelete={handleDelete}
      />

      <RecordMemberPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        members={members}
        onSelect={(m) => {
          setPickerOpen(false);
          setTarget(m);
        }}
      />

      {target && (
        <RaceRecordDialog
          key={target.memId}
          memberId={target.memId}
          teamId={teamId}
          cmmCdRows={cmmCdRows}
          open
          onOpenChange={(open) => {
            if (!open) setTarget(null);
          }}
          competitionRegisterMemberStatus={registrantStatus}
          title={`${target.label}님 기록 등록`}
          saveRecord={(input) => adminSaveRaceRecord(target.memId, input)}
          onSaved={() => {
            setTarget(null);
            void loadRecords();
          }}
        />
      )}
    </div>
  );
}

/** 필터 한 칸 — 폭이 좁아(390px 에서 약 110px) 선택값만 보이고, 무슨 칸인지는 스크린리더 라벨이 말한다 */
function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="h-9 px-2.5 text-xs md:text-xs [&>span]:truncate">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
