"use client";

import { useEffect, useState, useCallback } from "react";
import {
  getProjects,
  createProject,
  updateProject,
  deleteProject,
  type Project,
} from "@/app/actions/admin/manage-project";
import {
  FolderKanban,
  Plus,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [actioning, setActioning] = useState(false);

  // 폼 상태
  const [formName, setFormName] = useState("");
  const [formStartMonth, setFormStartMonth] = useState("");
  const [formEndMonth, setFormEndMonth] = useState("");

  const loadData = useCallback(async () => {
    const result = await getProjects();
    if (result.ok) {
      setProjects(result.data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const resetForm = () => {
    setFormName("");
    setFormStartMonth("");
    setFormEndMonth("");
    setEditingProject(null);
    setShowForm(false);
  };

  const openCreateForm = () => {
    resetForm();
    setShowForm(true);
  };

  const openEditForm = (project: Project) => {
    setEditingProject(project);
    setFormName(project.name);
    // date 값에서 yyyy-MM 형태 추출
    setFormStartMonth(project.start_month.slice(0, 7));
    setFormEndMonth(project.end_month.slice(0, 7));
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!formName.trim() || !formStartMonth || !formEndMonth) return;

    if (formEndMonth < formStartMonth) {
      alert("종료월은 시작월 이후여야 합니다");
      return;
    }

    // month input은 yyyy-MM 형태이므로 -01 을 붙여 date로 변환
    const startMonth = `${formStartMonth}-01`;
    const endMonth = `${formEndMonth}-01`;

    setActioning(true);

    if (editingProject) {
      const result = await updateProject(editingProject.id, {
        name: formName,
        start_month: startMonth,
        end_month: endMonth,
      });
      if (result.ok) {
        setProjects((prev) =>
          prev.map((p) =>
            p.id === editingProject.id
              ? {
                  ...p,
                  name: formName.trim(),
                  start_month: startMonth,
                  end_month: endMonth,
                }
              : p,
          ),
        );
        resetForm();
      } else {
        alert(result.message);
      }
    } else {
      const result = await createProject({
        name: formName,
        start_month: startMonth,
        end_month: endMonth,
      });
      if (result.ok) {
        await loadData();
        resetForm();
      } else {
        alert(result.message);
      }
    }

    setActioning(false);
  };

  const handleToggleStatus = async (project: Project) => {
    const newStatus = project.status === "active" ? "ended" : "active";
    setActioning(true);
    const result = await updateProject(project.id, { status: newStatus });
    if (result.ok) {
      setProjects((prev) =>
        prev.map((p) =>
          p.id === project.id ? { ...p, status: newStatus } : p,
        ),
      );
    } else {
      alert(result.message);
    }
    setActioning(false);
  };

  const handleDelete = async (project: Project) => {
    if (!confirm(`"${project.name}" 프로젝트를 삭제하시겠습니까?`)) return;
    setActioning(true);
    const result = await deleteProject(project.id);
    if (result.ok) {
      setProjects((prev) => prev.filter((p) => p.id !== project.id));
    } else {
      alert(result.message);
    }
    setActioning(false);
  };

  const formatMonth = (date: string) => {
    const d = new Date(date + "T00:00:00");
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-4 px-6 pt-4">
        <Skeleton className="h-8 w-40 rounded" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-6 pb-6 pt-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-bold tracking-tight text-foreground">
          프로젝트 관리
        </h1>
        <button
          onClick={openCreateForm}
          className="flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-[13px] font-medium text-primary-foreground transition-colors active:bg-primary/90"
        >
          <Plus className="size-4" />
          추가
        </button>
      </div>

      {/* 프로젝트 수 */}
      <span className="text-[13px] text-muted-foreground">
        전체 {projects.length}개 · 활성{" "}
        {projects.filter((p) => p.status === "active").length}개
      </span>

      {/* 프로젝트 목록 */}
      {projects.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16">
          <FolderKanban className="size-12 text-muted-foreground/30" />
          <p className="text-[15px] text-muted-foreground">
            등록된 프로젝트가 없습니다
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {projects.map((project) => (
            <div
              key={project.id}
              className={cn(
                "flex flex-col gap-3 rounded-2xl border-[1.5px] border-border p-4 transition-colors",
                project.status === "ended" && "opacity-50",
              )}
            >
              {/* 상단: 이름, 상태, 토글 */}
              <div className="flex items-center gap-3">
                <div className="flex flex-1 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-semibold text-foreground">
                      {project.name}
                    </span>
                    <Badge
                      variant={project.status === "active" ? "default" : "secondary"}
                      className="text-[11px]"
                    >
                      {project.status === "active" ? "활성" : "종료"}
                    </Badge>
                  </div>
                  <span className="text-[13px] text-muted-foreground">
                    {formatMonth(project.start_month)} ~ {formatMonth(project.end_month)}
                  </span>
                </div>
                <Switch
                  checked={project.status === "active"}
                  onCheckedChange={() => handleToggleStatus(project)}
                  disabled={actioning}
                />
              </div>

              {/* 하단: 수정/삭제 버튼 */}
              <div className="flex gap-2">
                <button
                  onClick={() => openEditForm(project)}
                  disabled={actioning}
                  className="flex items-center gap-1.5 rounded-lg border-[1.5px] border-border px-3 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors active:bg-secondary disabled:opacity-50"
                >
                  <Pencil className="size-3" />
                  수정
                </button>
                <button
                  onClick={() => handleDelete(project)}
                  disabled={actioning}
                  className="flex items-center gap-1.5 rounded-lg border-[1.5px] border-border px-3 py-1.5 text-[13px] font-medium text-destructive transition-colors active:bg-secondary disabled:opacity-50"
                >
                  <Trash2 className="size-3" />
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 추가/수정 시트 */}
      <Sheet open={showForm} onOpenChange={(open) => { if (!open) resetForm(); }}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-3xl">
          <SheetHeader>
            <SheetTitle>
              {editingProject ? "프로젝트 수정" : "프로젝트 추가"}
            </SheetTitle>
          </SheetHeader>

          <div className="flex flex-col gap-5 px-4 pt-4 pb-8">
            {/* 이름 */}
            <div className="flex flex-col gap-2">
              <label className="text-[13px] font-medium text-muted-foreground">
                프로젝트 이름
              </label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="예: 2026 시즌 1"
                className="h-12 rounded-xl border-[1.5px] text-[15px]"
              />
            </div>

            {/* 시작월 */}
            <div className="flex flex-col gap-2">
              <label className="text-[13px] font-medium text-muted-foreground">
                시작월
              </label>
              <Input
                type="month"
                value={formStartMonth}
                onChange={(e) => setFormStartMonth(e.target.value)}
                className="h-12 rounded-xl border-[1.5px] text-[15px]"
              />
            </div>

            {/* 종료월 */}
            <div className="flex flex-col gap-2">
              <label className="text-[13px] font-medium text-muted-foreground">
                종료월
              </label>
              <Input
                type="month"
                value={formEndMonth}
                onChange={(e) => setFormEndMonth(e.target.value)}
                className="h-12 rounded-xl border-[1.5px] text-[15px]"
              />
            </div>

            {/* 제출 버튼 */}
            <button
              onClick={handleSubmit}
              disabled={actioning || !formName.trim() || !formStartMonth || !formEndMonth}
              className="mt-2 flex h-12 items-center justify-center rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground transition-colors active:bg-primary/90 disabled:opacity-50"
            >
              {editingProject ? "수정" : "추가"}
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
