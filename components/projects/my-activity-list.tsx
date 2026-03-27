import { createClient } from "@/lib/supabase/server";
import { SPORT_LABELS, type Sport } from "@/lib/mileage";

export async function MyActivityList({ participationId }: { participationId: string }) {
  const supabase = await createClient();

  const { data: logs } = await supabase
    .from("activity_log")
    .select(
      "id, activity_date, sport, distance_km, elevation_m, final_mileage, review, activity_log_event(event_multiplier:event_multiplier_id(name), multiplier_snapshot)",
    )
    .eq("participation_id", participationId)
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

  return (
    <section>
      <h2 className="mb-3 font-semibold text-lg">내 기록</h2>
      <ul className="space-y-3">
        {logs.map((log) => {
          const events = log.activity_log_event as unknown as {
            event_multiplier: { name: string };
            multiplier_snapshot: number;
          }[];

          return (
            <li key={log.id} className="rounded-lg border p-4 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {log.activity_date} · {SPORT_LABELS[log.sport as Sport]}
                </span>
                <span className="text-sm font-bold text-primary">
                  {Number(log.final_mileage).toFixed(1)} km
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                거리 {Number(log.distance_km).toFixed(1)} km
                {log.elevation_m > 0 && ` · 고도 ${log.elevation_m}m`}
              </p>
              {events.length > 0 && (
                <p className="text-xs text-blue-600">
                  {events
                    .map(
                      (e) =>
                        `${e.event_multiplier.name} x${e.multiplier_snapshot}`,
                    )
                    .join(", ")}
                </p>
              )}
              {log.review && (
                <p className="text-xs text-muted-foreground italic">
                  &ldquo;{log.review}&rdquo;
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
