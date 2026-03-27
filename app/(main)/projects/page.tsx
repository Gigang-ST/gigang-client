import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { validateUUID } from "@/lib/utils";
import { MyStatus } from "@/components/projects/my-status";
import { CrewProgressChart } from "@/components/projects/crew-progress-chart";
import { RecentReviews } from "@/components/projects/recent-reviews";
import { RefundStatus } from "@/components/projects/refund-status";
import { MyActivityList } from "@/components/projects/my-activity-list";
import { ActivityLogFab } from "@/components/projects/activity-log-fab";
import { JoinSection } from "@/components/projects/join-section";

export default async function ProjectsPage() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/auth/login?next=/projects");
  }

  validateUUID(user.id);

  const { data: project } = await supabase
    .from("project")
    .select("id, name, start_month, end_month, status")
    .eq("status", "active")
    .maybeSingle();

  if (!project) {
    return (
      <div className="flex min-h-svh items-center justify-center px-6">
        <p className="text-muted-foreground">진행 중인 프로젝트가 없습니다.</p>
      </div>
    );
  }

  const { data: member } = await supabase
    .from("member")
    .select("id")
    .or(`kakao_user_id.eq.${user.id},google_user_id.eq.${user.id}`)
    .maybeSingle();

  const { data: participation } = member
    ? await supabase
        .from("project_participation")
        .select("id, start_month, initial_goal, deposit_confirmed")
        .eq("project_id", project.id)
        .eq("member_id", member.id)
        .maybeSingle()
    : { data: null };

  if (!participation || !participation.deposit_confirmed) {
    return (
      <div className="mx-auto max-w-3xl px-6 pb-16 pt-6">
        <h1 className="mb-6 text-2xl font-bold">{project.name}</h1>
        <JoinSection project={project} participation={participation} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 pb-24 pt-6 space-y-8">
      <h1 className="text-2xl font-bold">{project.name}</h1>

      <Suspense fallback={<Skeleton className="h-64 w-full rounded-xl" />}>
        <CrewProgressChart projectId={project.id} />
      </Suspense>

      <Suspense fallback={<Skeleton className="h-16 w-full rounded-xl" />}>
        <RecentReviews projectId={project.id} />
      </Suspense>

      <Suspense fallback={<Skeleton className="h-40 w-full rounded-xl" />}>
        <MyStatus participationId={participation.id} />
      </Suspense>

      <Suspense fallback={<Skeleton className="h-24 w-full rounded-xl" />}>
        <RefundStatus participationId={participation.id} projectId={project.id} />
      </Suspense>

      <Suspense fallback={<Skeleton className="h-48 w-full rounded-xl" />}>
        <MyActivityList participationId={participation.id} />
      </Suspense>

      <ActivityLogFab participationId={participation.id} projectId={project.id} />
    </div>
  );
}
