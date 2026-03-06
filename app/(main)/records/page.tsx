import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@supabase/supabase-js";
import { Suspense } from "react";
import { RecordsClient } from "./records-client";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
);

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
  const [{ data: pbData }, { data: utmbData }] = await Promise.all([
    supabase
      .from("personal_best")
      .select(
        "event_type, record_time_sec, race_name, member:member_id(full_name, gender)",
      ),
    supabase
      .from("utmb_profile")
      .select(
        "utmb_index, utmb_profile_url, member:member_id(full_name, gender)",
      ),
  ]);

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

  return <RecordsClient data={serialized} />;
}

function RecordsSkeleton() {
  return (
    <>
      {/* Pills */}
      <div className="flex flex-wrap gap-2 px-6 pt-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-16 rounded-full" />
        ))}
      </div>
      {/* Gender tabs */}
      <div className="flex gap-0 px-6 py-2">
        <Skeleton className="h-9 flex-1 rounded-lg" />
        <Skeleton className="h-9 flex-1 rounded-lg" />
      </div>
      {/* Rank rows */}
      <div className="flex flex-col px-6 pt-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b border-border py-4 last:border-b-0"
          >
            <Skeleton className="size-8 rounded-full" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-5 w-16" />
          </div>
        ))}
      </div>
    </>
  );
}

export default function RecordsPage() {
  return (
    <div className="flex flex-col gap-0">
      <div className="flex h-14 items-center px-6">
        <h1 className="text-[28px] font-semibold tracking-tight text-foreground">
          기강의전당
        </h1>
      </div>
      <Suspense fallback={<RecordsSkeleton />}>
        <RecordsContent />
      </Suspense>
    </div>
  );
}
