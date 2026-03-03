import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Suspense } from "react";
import { RecordsClient } from "./records-client";

const TIME_EVENT_TYPES = [
  { value: "5K", label: "5K" },
  { value: "10K", label: "10K" },
  { value: "HALF", label: "하프마라톤" },
  { value: "FULL", label: "풀마라톤" },
  { value: "TRIATHLON", label: "철인3종" },
] as const;

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

  // Fetch time-based personal bests
  const { data: pbData } = await supabase
    .from("personal_best")
    .select(
      "event_type, record_time_sec, race_name, member:member_id(full_name, gender)",
    );

  // Fetch UTMB profiles
  const { data: utmbData } = await supabase
    .from("utmb_profile")
    .select(
      "utmb_index, utmb_profile_url, member:member_id(full_name, gender)",
    );

  // Build time-based rankings
  const timeEvents = TIME_EVENT_TYPES.map((evt) => {
    const rows = (pbData ?? [])
      .filter((r) => r.event_type === evt.value)
      .map((r) => {
        const member = r.member as unknown as {
          full_name: string;
          gender: string;
        };
        return {
          name: member.full_name,
          gender: member.gender,
          record: secondsToTimeString(r.record_time_sec),
          raceName: r.race_name,
          sortKey: r.record_time_sec,
        };
      });

    const male = rows
      .filter((r) => r.gender === "male")
      .sort((a, b) => a.sortKey - b.sortKey)
      .slice(0, 10)
      .map((r, i) => ({
        rank: i + 1,
        name: r.name,
        record: r.record,
        raceName: r.raceName,
        utmbProfileUrl: null,
      }));

    const female = rows
      .filter((r) => r.gender === "female")
      .sort((a, b) => a.sortKey - b.sortKey)
      .slice(0, 10)
      .map((r, i) => ({
        rank: i + 1,
        name: r.name,
        record: r.record,
        raceName: r.raceName,
        utmbProfileUrl: null,
      }));

    return { eventType: evt.value, label: evt.label, male, female };
  });

  // Build UTMB rankings
  const utmbRows = (utmbData ?? []).map((r) => {
    const member = r.member as unknown as {
      full_name: string;
      gender: string;
    };
    return {
      name: member.full_name,
      gender: member.gender,
      index: r.utmb_index,
      url: r.utmb_profile_url,
    };
  });

  const utmbMale = utmbRows
    .filter((r) => r.gender === "male")
    .sort((a, b) => b.index - a.index)
    .slice(0, 10)
    .map((r, i) => ({
      rank: i + 1,
      name: r.name,
      record: String(r.index),
      raceName: null,
      utmbProfileUrl: r.url,
    }));

  const utmbFemale = utmbRows
    .filter((r) => r.gender === "female")
    .sort((a, b) => b.index - a.index)
    .slice(0, 10)
    .map((r, i) => ({
      rank: i + 1,
      name: r.name,
      record: String(r.index),
      raceName: null,
      utmbProfileUrl: r.url,
    }));

  const serialized = [
    ...timeEvents,
    {
      eventType: "UTMB",
      label: "UTMB Index",
      male: utmbMale,
      female: utmbFemale,
    },
  ];

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
