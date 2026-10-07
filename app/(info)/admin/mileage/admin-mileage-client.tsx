"use client";

import { useEffect, useState, useCallback, useRef } from "react";

import { Plus } from "lucide-react";
import { useQueryState, parseAsString, parseAsStringLiteral } from "nuqs";

import { PB_CLASS_TYPE } from "@/lib/pb-class";
import { createClient } from "@/lib/supabase/client";

import { EmptyState } from "@/components/common/empty-state";
import { SegmentControl } from "@/components/common/segment-control";
import { H2 } from "@/components/common/typography";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

import { GoalTab } from "./goal-tab";
import { MultiplierTab } from "./multiplier-tab";
import { ParticipantsTab } from "./participants-tab";
import { PbParticipantsTab } from "./pb-participants-tab";
import { PbRecordsTab } from "./pb-records-tab";
import { PbScoreTab } from "./pb-score-tab";
import { PbSessPlanTab } from "./pb-sess-plan-tab";
import { PbSessionsTab } from "./pb-sessions-tab";
import { PbTeamsTab } from "./pb-teams-tab";
import { ProjectInfoTab } from "./project-info-tab";

type Project = {
  evt_id: string;
  evt_nm: string;
  evt_type_cd: string;
  stt_dt: string;
  end_dt: string;
  stts_enm: "READY" | "ACTIVE" | "CLOSED";
  desc_txt: string | null;
};

const STATUS_BADGE: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" }
> = {
  READY: { label: "준비중", variant: "secondary" },
  ACTIVE: { label: "진행중", variant: "default" },
  CLOSED: { label: "종료", variant: "outline" },
};

const tabs = [
  "info",
  "multiplier",
  "goal",
  "participants",
  "sessions",
  "plans",
  "teams",
  "records",
  "score",
] as const;
type Tab = (typeof tabs)[number];

// 탭은 프로젝트 타입이 정한다 — 배율·목표는 마일리지런 개념이고 회차(공식훈련 벙 연결)는 PB 클래스 개념이다.
const MILEAGE_TAB_SEGMENTS: { value: Tab; label: string }[] = [
  { value: "info", label: "정보" },
  { value: "multiplier", label: "배율" },
  { value: "goal", label: "목표" },
  { value: "participants", label: "참여자" },
];

const PB_TAB_SEGMENTS: { value: Tab; label: string }[] = [
  { value: "info", label: "정보" },
  { value: "sessions", label: "회차" },
  // 회차(벙 연결)와 붙여 둔다 — 「몇 주차에 어떤 훈련을 하나」가 회차 설정의 연장이라서
  { value: "plans", label: "훈련표" },
  { value: "participants", label: "참여자" },
  // 2·3단계 — 게임팀 배정, 목표·기록, 점수판·배점
  { value: "teams", label: "팀" },
  { value: "records", label: "기록" },
  { value: "score", label: "점수" },
];

/** 셀렉터 한 줄 — 이름 + 상태 배지. 닫힌 상태의 트리거도 이 내용을 그대로 비추므로 지난 프로젝트에도 배지를 둔다 */
function ProjectOption({ project: p }: { project: Project }) {
  const badge = STATUS_BADGE[p.stts_enm] ?? STATUS_BADGE.READY;
  return (
    <SelectItem value={p.evt_id}>
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate">{p.evt_nm}</span>
        <span
          className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
            badge.variant === "default"
              ? "bg-primary text-primary-foreground"
              : badge.variant === "outline"
                ? "border border-border text-muted-foreground"
                : "bg-secondary text-secondary-foreground"
          }`}
        >
          {badge.label}
        </span>
      </span>
    </SelectItem>
  );
}

/**
 * 처음 열 때 보여 줄 프로젝트 — 진행 중 → 준비 중 → (그 밖의 안 끝난 것) → 첫 번째.
 *
 * 끝난 프로젝트는 지우지 않고 「지난 프로젝트」로 쌓이기 때문에, 예전처럼 `list[0]`(가장 최근 생성)을
 * 고르면 새 프로젝트를 만든 뒤 지난 프로젝트가 기본으로 열릴 수 있다. 일하는 대상은 거의 늘 안 끝난 쪽이다.
 */
function pickDefaultProject(list: Project[]): Project | null {
  return (
    list.find((p) => p.stts_enm === "ACTIVE") ??
    list.find((p) => p.stts_enm === "READY") ??
    list.find((p) => p.stts_enm !== "CLOSED") ??
    list[0] ??
    null
  );
}

export function AdminMileageClient({ teamId }: { teamId: string }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const [projectId, setProjectId] = useQueryState(
    "project",
    parseAsString.withDefault(""),
  );
  const [tab, setTab] = useQueryState(
    "tab",
    parseAsStringLiteral(tabs).withDefault("info"),
  );

  // stale 클로저 방지용 ref
  const projectIdRef = useRef(projectId);
  useEffect(() => {
    projectIdRef.current = projectId;
  }, [projectId]);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("evt_team_mst")
        .select(
          "evt_id, evt_nm, evt_type_cd, stt_dt, end_dt, stts_enm, desc_txt",
        )
        .eq("team_id", teamId)
        .order("created_at", { ascending: false });

      const list = (data ?? []) as Project[];
      setProjects(list);
      return list;
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  // 초기 로드: project 쿼리파람 없으면 자동 선택
   
   
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadProjects().then((list) => {
      const first = pickDefaultProject(list);
      if (!projectIdRef.current && first) setProjectId(first.evt_id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 가로로 밀리는 PB 탭 줄 — `?tab=`으로 바로 들어왔거나 오른쪽 탭을 눌러 선택된 탭이 화면 밖이면
  // 가운데로 끌어온다. 안 하면 "어느 탭인지" 안 보이는 채로 본문만 바뀐다.
  // (early return보다 앞에 둬야 훅 순서가 안 깨져서 activeTab 대신 DOM의 선택 상태를 읽는다)
  const tabRowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    tabRowRef.current
      ?.querySelector<HTMLElement>('[aria-pressed="true"]')
      ?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [tab, projectId, loading]);

  const selectedProject = projects.find((p) => p.evt_id === projectId) ?? null;
  // 셀렉터 그룹 — 끝난 프로젝트는 지우지 않고 「지난 프로젝트」에 쌓인다. 진행 중이 준비 중보다 위.
  const openProjects = projects
    .filter((p) => p.stts_enm !== "CLOSED")
    .sort((a, b) => Number(b.stts_enm === "ACTIVE") - Number(a.stts_enm === "ACTIVE"));
  const closedProjects = projects.filter((p) => p.stts_enm === "CLOSED");

  const handleNewProject = () => {
    setProjectId("");
    setTab("info");
  };

  const handleSaved = useCallback(
    async (newEvtId?: string) => {
      const list = await loadProjects();
      const first = pickDefaultProject(list);
      if (newEvtId) {
        setProjectId(newEvtId);
      } else if (!projectIdRef.current && first) {
        setProjectId(first.evt_id);
      }
    },
    [loadProjects, setProjectId],
  );

  const handleCancel = useCallback(() => {
    const first = pickDefaultProject(projects);
    if (first) {
      setProjectId(first.evt_id);
      setTab("info");
    }
  }, [projects, setProjectId, setTab]);

  const handleDeleted = useCallback(async () => {
    const list = await loadProjects();
    setProjectId(pickDefaultProject(list)?.evt_id ?? "");
    setTab("info");
  }, [loadProjects, setProjectId, setTab]);

  if (loading) {
    return (
      <div className="flex flex-col gap-4 px-6 pt-4">
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-10 w-full rounded-xl" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  const isCreating = projectId === "";
  const isPb = selectedProject?.evt_type_cd === PB_CLASS_TYPE;
  const tabSegments = isPb ? PB_TAB_SEGMENTS : MILEAGE_TAB_SEGMENTS;
  // URL에 남은 ?tab= 이 이 프로젝트에 없는 탭이면(예: PB 프로젝트로 옮겨 온 multiplier) 정보 탭으로 떨어진다.
  // 빈 화면 대신 항상 존재하는 탭 하나를 보여 주려는 가드다.
  const activeTab: Tab = tabSegments.some((t) => t.value === tab) ? tab : "info";

  return (
    <div className="flex flex-col gap-4 pb-6 pt-4">
      <div className="px-6">
        <H2>프로젝트 관리</H2>
      </div>

      {/* 프로젝트 셀렉터 */}
      <div className="flex items-center gap-2 px-6">
        <div className="flex-1">
          {projects.length > 0 ? (
            <Select
              value={projectId || "__none__"}
              onValueChange={(v) => {
                if (v !== "__none__") {
                  setProjectId(v);
                  setTab("info");
                }
              }}
            >
              <SelectTrigger className="h-12 min-w-0 rounded-xl border-[1.5px] text-[15px] [&>span]:min-w-0">
                <SelectValue placeholder="프로젝트 선택" />
              </SelectTrigger>
              <SelectContent>
                {isCreating && (
                  <SelectItem value="__none__">새 프로젝트 생성 중</SelectItem>
                )}
                {openProjects.length > 0 && (
                  <SelectGroup>
                    <SelectLabel className="text-muted-foreground">진행 중 · 준비 중</SelectLabel>
                    {openProjects.map((p) => (
                      <ProjectOption key={p.evt_id} project={p} />
                    ))}
                  </SelectGroup>
                )}
                {closedProjects.length > 0 && (
                  <SelectGroup>
                    <SelectLabel className="text-muted-foreground">지난 프로젝트</SelectLabel>
                    {closedProjects.map((p) => (
                      <ProjectOption key={p.evt_id} project={p} />
                    ))}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
          ) : (
            <div className="flex h-12 items-center rounded-xl border-[1.5px] border-dashed border-border px-4">
              <span className="text-[15px] text-muted-foreground">
                프로젝트가 없습니다
              </span>
            </div>
          )}
        </div>
        <Button
          size="icon"
          variant="outline"
          onClick={handleNewProject}
          className="size-12 shrink-0 rounded-xl"
          aria-label="새 프로젝트 생성"
        >
          <Plus className="size-5" />
        </Button>
      </div>

      {/* 탭 */}
      <div ref={tabRowRef} className="px-6">
        <SegmentControl
          segments={tabSegments}
          value={activeTab}
          onValueChange={(v) => setTab(v as Tab)}
          // PB는 탭이 7개라 375px에서 글자가 두 줄로 꺾인다 — 줄바꿈을 막고 넘치면 가로로 밀게 한다
          // (스크롤바는 숨긴다. 오른쪽 탭이 반쯤 잘려 보이는 것이 "더 있다"는 신호다)
          className={
            isPb
              ? "scrollbar-none overflow-x-auto [&>button]:shrink-0 [&>button]:whitespace-nowrap [&>button]:px-3"
              : undefined
          }
        />
      </div>

      {/* 탭 콘텐츠 */}
      {activeTab === "info" && (
        <div className="px-6">
          <ProjectInfoTab
            key={isCreating ? "create" : projectId || "create"}
            project={isCreating ? null : selectedProject}
            onSaved={handleSaved}
            onCancel={handleCancel}
            onDeleted={handleDeleted}
          />
        </div>
      )}

      {activeTab !== "info" && !projectId && (
        <div className="px-6">
          <EmptyState
            variant="card"
            message="먼저 프로젝트를 선택하거나 생성하세요."
          />
        </div>
      )}

      {activeTab === "multiplier" && projectId && (
        <div className="px-6">
          <MultiplierTab evtId={projectId} />
        </div>
      )}

      {activeTab === "goal" && projectId && (
        <div className="px-6">
          <GoalTab evtId={projectId} />
        </div>
      )}

      {activeTab === "sessions" && projectId && (
        <div className="px-6">
          <PbSessionsTab key={projectId} evtId={projectId} />
        </div>
      )}

      {activeTab === "plans" && projectId && (
        <div className="px-6">
          <PbSessPlanTab key={projectId} evtId={projectId} />
        </div>
      )}

      {activeTab === "teams" && projectId && (
        <div className="px-6">
          <PbTeamsTab key={projectId} evtId={projectId} />
        </div>
      )}

      {activeTab === "records" && projectId && (
        <div className="px-6">
          <PbRecordsTab key={projectId} evtId={projectId} />
        </div>
      )}

      {activeTab === "score" && projectId && (
        <div className="px-6">
          <PbScoreTab key={projectId} evtId={projectId} />
        </div>
      )}

      {activeTab === "participants" && projectId && (
        <div className="px-6">
          {isPb ? (
            <PbParticipantsTab key={projectId} evtId={projectId} teamId={teamId} />
          ) : (
            <ParticipantsTab evtId={projectId} />
          )}
        </div>
      )}
    </div>
  );
}
