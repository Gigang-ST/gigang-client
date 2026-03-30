import { cacheLife } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { secondsToTime } from "@/lib/utils";
import { fetchUtmbRecentRace } from "@/lib/utmb";
import dynamic from "next/dynamic";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const RecordsClient = dynamic(() =>
  import("./records-client").then((m) => m.RecordsClient),
);

const MARATHON_EVENTS = [
  { eventType: "FULL", label: "풀마라톤" },
  { eventType: "HALF", label: "하프마라톤" },
  { eventType: "10K", label: "10K" },
] as const;

const TRIATHLON_EVENTS = [
  { eventType: "TRIATHLON_FULL", label: "킹", filter: null },
  { eventType: "TRIATHLON_HALF", label: "하프", filter: null },
  { eventType: "TRIATHLON_OLYMPIC_TY", label: "올림픽 - 통영", filter: (name: string | null) => name?.includes("통영") ?? false },
  { eventType: "TRIATHLON_OLYMPIC_ETC", label: "올림픽 - 기타", filter: (name: string | null) => !(name?.includes("통영") ?? false) },
] as const;

async function RecordsContent() {
  "use cache";
  cacheLife("days");

  const supabase = createAdminClient();

  // 마라톤 + 철인3종 기록, UTMB 프로필 동시 조회
  const [{ data: raceData }, { data: utmbData }] = await Promise.all([
    supabase
      .from("race_result")
      .select(
        "event_type, record_time_sec, race_name, member:member_id(id, full_name, gender)",
      ),
    supabase
      .from("utmb_profile")
      .select(
        "utmb_index, utmb_profile_url, member:member_id(full_name, id)",
      ),
  ]);

  // 멤버별 종목별 최고기록만 추출
  const bestByMemberEvent = new Map<string, { event_type: string; record_time_sec: number; race_name: string; member: { id: string; full_name: string; gender: string } }>();
  for (const r of raceData ?? []) {
    const member = r.member as unknown as { id: string; full_name: string; gender: string };
    const key = `${member.id}_${r.event_type}`;
    const existing = bestByMemberEvent.get(key);
    if (!existing || r.record_time_sec < existing.record_time_sec) {
      bestByMemberEvent.set(key, { event_type: r.event_type, record_time_sec: r.record_time_sec, race_name: r.race_name, member });
    }
  }
  const pbData = Array.from(bestByMemberEvent.values());

  // 트레일러닝: UTMB 프로필 보유자의 최근 대회 기록 조회
  const utmbMembers = (utmbData ?? []).map((r) => {
    const member = r.member as unknown as { full_name: string; id: string };
    return { id: member.id, name: member.full_name, index: r.utmb_index, url: r.utmb_profile_url };
  });

  // UTMB 프로필 페이지에서 멤버별 최근 대회 기록 가져오기
  const recentRaceMap = new Map<
    string,
    { raceName: string; record: string | null }
  >();

  for (const m of utmbMembers) {
    const result = await fetchUtmbRecentRace(m.url);
    if (result.ok) {
      recentRaceMap.set(m.id, {
        raceName: result.raceName,
        record: result.raceRecord,
      });
    }
  }

  // --- 마라톤 ---
  const marathonEvents = MARATHON_EVENTS.map((evt) => {
    const rows = (pbData ?? [])
      .filter((r) => r.event_type === evt.eventType)
      .map((r) => {
        const member = r.member as unknown as {
          full_name: string;
          gender: string;
        };
        return {
          name: member.full_name,
          gender: member.gender,
          record: secondsToTime(r.record_time_sec),
          raceName: r.race_name,
          sortKey: r.record_time_sec,
        };
      });

    const toEntry = (r: (typeof rows)[number], i: number) => ({
      rank: i + 1,
      name: r.name,
      record: r.record,
      raceName: r.raceName,
    });

    return {
      eventType: evt.eventType,
      label: evt.label,
      male: rows
        .filter((r) => r.gender === "male")
        .sort((a, b) => a.sortKey - b.sortKey)
        .slice(0, 10)
        .map(toEntry),
      female: rows
        .filter((r) => r.gender === "female")
        .sort((a, b) => a.sortKey - b.sortKey)
        .slice(0, 10)
        .map(toEntry),
    };
  });

  // --- 트레일러닝 ---
  const trailEntries = utmbMembers
    .sort((a, b) => b.index - a.index)
    .slice(0, 10)
    .map((r, i) => {
      const recent = recentRaceMap.get(r.id);
      return {
        rank: i + 1,
        name: r.name,
        utmbIndex: r.index,
        recentRaceName: recent?.raceName ?? null,
        recentRaceRecord: recent?.record ?? null,
        utmbProfileUrl: r.url,
      };
    });

  // --- 철인3종 ---
  const olympicRows = (pbData ?? [])
    .filter((r) => r.event_type === "TRIATHLON_OLYMPIC")
    .map((r) => {
      const member = r.member as unknown as { full_name: string; gender: string };
      return {
        name: member.full_name,
        record: secondsToTime(r.record_time_sec),
        raceName: r.race_name,
        sortKey: r.record_time_sec,
      };
    });

  const triathlonEvents = TRIATHLON_EVENTS.map((evt) => {
    let rows;
    if (evt.filter) {
      // 올림픽 통영/기타: 같은 DB event_type에서 race_name으로 분리
      rows = olympicRows
        .filter((r) => evt.filter(r.raceName))
        .sort((a, b) => a.sortKey - b.sortKey)
        .slice(0, 10);
    } else {
      rows = (pbData ?? [])
        .filter((r) => r.event_type === evt.eventType)
        .map((r) => {
          const member = r.member as unknown as { full_name: string; gender: string };
          return {
            name: member.full_name,
            record: secondsToTime(r.record_time_sec),
            raceName: r.race_name,
            sortKey: r.record_time_sec,
          };
        })
        .sort((a, b) => a.sortKey - b.sortKey)
        .slice(0, 10);
    }

    return {
      eventType: evt.eventType,
      label: evt.label,
      entries: rows.map((r, i) => ({
        rank: i + 1,
        name: r.name,
        record: r.record,
        raceName: r.raceName,
        isMain: false,
      })),
    };
  });

  const serializedData = {
    marathon: { events: marathonEvents },
    trail: { entries: trailEntries },
    triathlon: { events: triathlonEvents },
  };

  return <RecordsClient data={serializedData} />;
}

function RecordsSkeleton() {
  return (
    <>
      <div className="flex flex-wrap gap-2 px-6 pt-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-16 rounded-full" />
        ))}
      </div>
      <div className="flex gap-0 px-6 py-2">
        <Skeleton className="h-9 flex-1 rounded-lg" />
        <Skeleton className="h-9 flex-1 rounded-lg" />
      </div>
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
          기강의 전당
        </h1>
      </div>
      <Suspense fallback={<RecordsSkeleton />}>
        <RecordsContent />
      </Suspense>
    </div>
  );
}
