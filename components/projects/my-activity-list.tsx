import { createClient } from "@/lib/supabase/server";
import { MyActivityListClient, type ActivityLog } from "./my-activity-list-client";

export async function MyActivityList({
  participationId,
  projectId,
  month,
}: {
  participationId: string;
  projectId: string;
  month?: string;
}) {
  const supabase = await createClient();

  // 해당 월의 범위 계산
  let query = supabase
    .from("activity_log")
    .select(
      "id, activity_date, sport, distance_km, elevation_m, final_mileage, review, activity_log_event(event_multiplier_id, event_multiplier:event_multiplier_id(name), multiplier_snapshot)",
    )
    .eq("participation_id", participationId);

  if (month) {
    const [y, m] = month.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const monthEnd = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    query = query.gte("activity_date", month).lte("activity_date", monthEnd);
  }

  const { data: logs } = await query
    .order("activity_date", { ascending: false })
    .limit(50);

  if (!logs || logs.length === 0) {
    return (
      <section>
        <h2 className="mb-3 font-semibold text-lg">내 기록</h2>
        <p className="text-sm text-muted-foreground">아직 기록이 없습니다.</p>
      </section>
    );
  }

  // 클라이언트 컴포넌트에 전달할 데이터 변환
  const serialized: ActivityLog[] = logs.map((log) => {
    const events = log.activity_log_event as unknown as {
      event_multiplier_id: string;
      event_multiplier: { name: string };
      multiplier_snapshot: number;
    }[];

    return {
      id: log.id,
      activity_date: log.activity_date,
      sport: log.sport,
      distance_km: log.distance_km,
      elevation_m: log.elevation_m,
      final_mileage: log.final_mileage,
      review: log.review,
      activity_log_event: events.map((e) => ({
        event_multiplier: e.event_multiplier,
        multiplier_snapshot: e.multiplier_snapshot,
      })),
      event_multiplier_ids: events.map((e) => e.event_multiplier_id),
    };
  });

  return (
    <section>
      <h2 className="mb-3 font-semibold text-lg">내 기록</h2>
      <MyActivityListClient
        logs={serialized}
        participationId={participationId}
        projectId={projectId}
      />
    </section>
  );
}
