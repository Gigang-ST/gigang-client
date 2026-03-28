import { createClient } from "@/lib/supabase/server";

const SPORT_LABEL: Record<string, string> = {
  running: "러닝",
  trail_running: "트레일러닝",
  cycling: "자전거",
  swimming: "수영",
};

export async function RandomReview({ projectId }: { projectId: string }) {
  const supabase = await createClient();

  const { data: reviews } = await supabase
    .from("activity_log")
    .select(
      "review, sport, distance_km, activity_date, participation_id, project_participation!inner(project_id, member!inner(full_name))"
    )
    .eq("project_participation.project_id", projectId)
    .neq("review", "")
    .order("activity_date", { ascending: false })
    .limit(10);

  if (!reviews || reviews.length === 0) return null;

  const pick = reviews[Math.floor(Math.random() * reviews.length)];
  const member = (pick as any).project_participation?.member;
  const name = member?.full_name ?? "익명";
  const sport = SPORT_LABEL[pick.sport as string] ?? pick.sport;

  return (
    <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm">
      <p className="text-muted-foreground mb-1">
        {name} · {sport} {Number(pick.distance_km).toFixed(1)}km
      </p>
      <p className="font-medium">&ldquo;{pick.review}&rdquo;</p>
    </div>
  );
}
