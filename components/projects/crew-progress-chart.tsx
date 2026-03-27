"use client";
export function CrewProgressChart({ projectId }: { projectId: string }) {
  return <div className="h-64 rounded-xl bg-muted" data-project={projectId} />;
}
