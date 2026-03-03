import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Suspense } from "react";
import { RecordsClient } from "./records-client";

const EVENT_TYPES = [
  { value: "5K", label: "5K" },
  { value: "10K", label: "10K" },
  { value: "HALF", label: "하프마라톤" },
  { value: "FULL", label: "풀마라톤" },
  { value: "TRIATHLON", label: "철인3종" },
  { value: "UTMB", label: "UTMB Index" },
] as const;

type RankingRow = {
  event_type: string;
  full_name: string;
  gender: string;
  record_time_sec: number | null;
  utmb_index: number | null;
  utmb_profile_url: string | null;
  race_name: string | null;
  race_date: string | null;
};

function secondsToTimeString(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

async function RecordsContent() {
  const supabase = await createClient();

  const { data: rankings } = await supabase
    .from("personal_best")
    .select(
      "event_type, record_time_sec, utmb_index, utmb_profile_url, race_name, race_date, member:member_id(full_name, gender)",
    );

  const rows: RankingRow[] = (rankings ?? []).map((r) => {
    const member = r.member as unknown as {
      full_name: string;
      gender: string;
    };
    return {
      event_type: r.event_type,
      full_name: member.full_name,
      gender: member.gender,
      record_time_sec: r.record_time_sec,
      utmb_index: r.utmb_index,
      utmb_profile_url: r.utmb_profile_url,
      race_name: r.race_name,
      race_date: r.race_date,
    };
  });

  const grouped: Record<
    string,
    { male: RankingRow[]; female: RankingRow[] }
  > = {};

  for (const evt of EVENT_TYPES) {
    const eventRows = rows.filter((r) => r.event_type === evt.value);

    const sortFn =
      evt.value === "UTMB"
        ? (a: RankingRow, b: RankingRow) =>
            (b.utmb_index ?? 0) - (a.utmb_index ?? 0)
        : (a: RankingRow, b: RankingRow) =>
            (a.record_time_sec ?? 0) - (b.record_time_sec ?? 0);

    const male = eventRows.filter((r) => r.gender === "male").sort(sortFn);
    const female = eventRows.filter((r) => r.gender === "female").sort(sortFn);

    grouped[evt.value] = { male, female };
  }

  const serialized = EVENT_TYPES.map((evt) => {
    const mapRow = (r: RankingRow, i: number) => ({
      rank: i + 1,
      name: r.full_name,
      record:
        evt.value === "UTMB"
          ? String(r.utmb_index ?? 0)
          : secondsToTimeString(r.record_time_sec ?? 0),
      raceName: r.race_name ?? null,
      raceDate: r.race_date ?? null,
      utmbProfileUrl: r.utmb_profile_url ?? null,
    });

    return {
      eventType: evt.value,
      label: evt.label,
      male: grouped[evt.value].male.slice(0, 10).map(mapRow),
      female: grouped[evt.value].female.slice(0, 10).map(mapRow),
    };
  });

  return (
    <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col px-4 pb-16 pt-20 text-white md:px-8 md:pt-28">
      <div className="flex flex-col gap-6">
        <div className="space-y-3">
          <p className="text-sm uppercase tracking-[0.2em] text-white/60">
            Hall of Fame
          </p>
          <h1 className="text-3xl font-bold md:text-4xl">기강의전당</h1>
        </div>

        <Card className="border-white/20 bg-white/35 text-foreground shadow-xl backdrop-blur-xl">
          <CardContent className="p-4 md:p-6">
            <RecordsClient data={serialized} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function RecordsPage() {
  return (
    <Suspense>
      <RecordsContent />
    </Suspense>
  );
}
