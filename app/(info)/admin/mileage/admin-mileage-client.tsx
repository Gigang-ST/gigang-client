"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useQueryState, parseAsString, parseAsStringLiteral } from "nuqs";
import { createClient } from "@/lib/supabase/client";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { SegmentControl } from "@/components/common/segment-control";
import { EmptyState } from "@/components/common/empty-state";
import { ProjectInfoTab } from "./project-info-tab";
import { MultiplierTab } from "./multiplier-tab";
import { GoalTab } from "./goal-tab";
import { ParticipantsTab } from "./participants-tab";

type Project = {
  evt_id: string;
  evt_nm: string;
  evt_type_cd: string;
  stt_dt: string;
  end_dt: string;
  stts_enm: string;
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

const tabs = ["info", "multiplier", "goal", "participants"] as const;
type Tab = (typeof tabs)[number];

const TAB_SEGMENTS = [
  { value: "info", label: "정보" },
  { value: "multiplier", label: "배율" },
  { value: "goal", label: "목표" },
  { value: "participants", label: "참여자" },
];

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
    setLoading(false);
    return list;
  }, [teamId]);

  // 초기 로드: project 쿼리파람 없으면 자동 선택
  useEffect(() => {
    loadProjects().then((list) => {
      if (!projectIdRef.current && list.length > 0) {
        const active = list.find((p) => p.stts_enm === "ACTIVE");
        setProjectId((active ?? list[0]).evt_id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedProject = projects.find((p) => p.evt_id === projectId) ?? null;

  const handleNewProject = () => {
    setProjectId("");
    setTab("info");
  };

  const handleSaved = useCallback(
    async (newEvtId?: string) => {
      const list = await loadProjects();
      if (newEvtId) {
        setProjectId(newEvtId);
      } else if (!projectIdRef.current && list.length > 0) {
        setProjectId(list[0].evt_id);
      }
    },
    [loadProjects, setProjectId],
  );

  const handleCancel = useCallback(() => {
    if (projects.length > 0) {
      const active = projects.find((p) => p.stts_enm === "ACTIVE");
      setProjectId((active ?? projects[0]).evt_id);
      setTab("info");
    }
  }, [projects, setProjectId, setTab]);

  const handleDeleted = useCallback(async () => {
    const list = await loadProjects();
    if (list.length > 0) {
      const active = list.find((p) => p.stts_enm === "ACTIVE");
      setProjectId((active ?? list[0]).evt_id);
    } else {
      setProjectId("");
    }
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

  return (
    <div className="flex flex-col gap-4 pb-6 pt-4">
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
              <SelectTrigger className="h-12 rounded-xl border-[1.5px] text-[15px]">
                <SelectValue placeholder="프로젝트 선택" />
              </SelectTrigger>
              <SelectContent>
                {isCreating && (
                  <SelectItem value="__none__">새 프로젝트 생성 중</SelectItem>
                )}
                {projects.map((p) => {
                  const badge = STATUS_BADGE[p.stts_enm] ?? STATUS_BADGE.READY;
                  return (
                    <SelectItem key={p.evt_id} value={p.evt_id}>
                      <span className="flex items-center gap-2">
                        <span>{p.evt_nm}</span>
                        <span
                          className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
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
                })}
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
      <div className="px-6">
        <SegmentControl
          segments={TAB_SEGMENTS}
          value={tab}
          onValueChange={(v) => setTab(v as Tab)}
        />
      </div>

      {/* 탭 콘텐츠 */}
      {tab === "info" && (
        <div className="px-6">
          <ProjectInfoTab
            key={projectId || "create"}
            project={isCreating ? null : selectedProject}
            onSaved={handleSaved}
            onCancel={handleCancel}
            onDeleted={handleDeleted}
          />
        </div>
      )}

      {tab !== "info" && !projectId && (
        <div className="px-6">
          <EmptyState
            variant="card"
            message="먼저 프로젝트를 선택하거나 생성하세요."
          />
        </div>
      )}

      {tab === "multiplier" && projectId && (
        <div className="px-6">
          <MultiplierTab evtId={projectId} />
        </div>
      )}

      {tab === "goal" && projectId && (
        <div className="px-6">
          <GoalTab evtId={projectId} />
        </div>
      )}

      {tab === "participants" && projectId && (
        <div className="px-6">
          <ParticipantsTab evtId={projectId} />
        </div>
      )}
    </div>
  );
}
