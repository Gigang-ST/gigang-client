import { createClient } from "@/lib/supabase/server";
import { todayKST } from "@/lib/mileage";

export async function RecentReviews({ projectId }: { projectId: string }) {
  const supabase = await createClient();
  const today = todayKST();
  const sevenDaysAgo = new Date(new Date(today).getTime() - 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const { data: participations } = await supabase
    .from("project_participation")
    .select("id")
    .eq("project_id", projectId);

  if (!participations || participations.length === 0) return null;

  const { data: reviewLogs } = await supabase
    .from("activity_log")
    .select(
      "id, review, activity_date, participation:participation_id(member:member_id(full_name))",
    )
    .in(
      "participation_id",
      participations.map((p) => p.id),
    )
    .gte("activity_date", sevenDaysAgo)
    .not("review", "is", null)
    .order("activity_date", { ascending: false })
    .limit(20);

  if (!reviewLogs || reviewLogs.length === 0) return null;

  const shuffled = [...reviewLogs].sort(() => Math.random() - 0.5).slice(0, 3);

  return (
    <section className="space-y-2">
      <h2 className="font-semibold text-lg">최근 후기</h2>
      <ul className="space-y-2">
        {shuffled.map((log) => {
          const member = (
            log.participation as unknown as { member: { full_name: string } }
          ).member;
          return (
            <li
              key={log.id}
              className="rounded-lg bg-muted/50 px-4 py-3 text-sm text-muted-foreground"
            >
              <span className="font-medium text-foreground">{member.full_name}</span>
              {" : "}
              {log.review}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
