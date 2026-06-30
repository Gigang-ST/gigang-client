import { Suspense } from "react";

import { unstable_cache } from "next/cache";

import { secondsToTime } from "@/lib/dayjs";
import { HYROX_SPRT_CD, HYROX_STATIONS, parseHyroxSplits } from "@/lib/hyrox";
import { getMyTitleNames } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";

import { H1 } from "@/components/common/typography";
import { Skeleton } from "@/components/ui/skeleton";

import { RecordsClient } from "./records-client";


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
  const { teamId } = await getRequestTeamContext();
  const [serializedData, myTitleNames] = await Promise.all([
    getCachedRecordsData(teamId),
    getMyTitleNames(),
  ]);

  return <RecordsClient data={serializedData} myTitleNames={[...myTitleNames]} />;
}

function getCachedRecordsData(teamId: string) {
  return unstable_cache(
    async () => {
      const supabase = createAdminClient();

      // 마라톤 + 철인3종 기록, UTMB 프로필, 대표 칭호, 하이록스 기록 동시 조회
      const [{ data: raceData }, { data: utmbData }, { data: titleData }, { data: hyroxData }] = await Promise.all([
        supabase.rpc("get_public_team_race_rankings", { p_team_id: teamId }),
        supabase.rpc("get_public_team_utmb_rankings", { p_team_id: teamId }),
        supabase
          .from("mem_ttl_rel")
          .select("team_mem_rel!inner(mem_id, selected_badge_effect, selected_frame_cd), ttl_mst!inner(ttl_nm, ttl_desc, desc_visibility)")
          .eq("team_mem_rel.team_id", teamId)
          .eq("is_prmy_yn", true)
          .eq("vers", 0)
          .eq("del_yn", false),
        // 하이록스: 멤버 기록 + 스테이션 split (팀 필터는 아래에서 raceData mem_id 집합과 교차)
        supabase
          .from("rec_race_hist")
          .select("mem_id, rec_time_sec, race_nm, splits_json, mem_mst!inner(mem_nm), comp_mst!inner(comp_sprt_cd)")
          .eq("vers", 0)
          .eq("del_yn", false)
          .eq("comp_mst.comp_sprt_cd", HYROX_SPRT_CD),
      ]);

      // 팀 active 멤버 집합 (RPC 결과는 team_mem_rel active 조인으로 이미 팀 범위)
      const teamMemberIds = new Set((raceData ?? []).map((r) => r.mem_id));

      // mem_id → { ttl_nm, badge_effect, frame_cd } 맵
      const memberTitleMap = new Map<string, { ttl_nm: string; ttl_desc: string | null; desc_visibility: "always" | "others" | "held" | "never"; badge_effect: string; frame_cd: string }>();
      for (const row of titleData ?? []) {
        const rel = Array.isArray(row.team_mem_rel) ? row.team_mem_rel[0] : row.team_mem_rel;
        const ttl = Array.isArray(row.ttl_mst) ? row.ttl_mst[0] : row.ttl_mst;
        if (rel?.mem_id && ttl?.ttl_nm) {
          memberTitleMap.set(rel.mem_id, {
            ttl_nm: ttl.ttl_nm,
            ttl_desc: (ttl as { ttl_nm: string; ttl_desc?: string | null; desc_visibility?: string }).ttl_desc ?? null,
            desc_visibility: ((ttl as { ttl_nm: string; ttl_desc?: string | null; desc_visibility?: string }).desc_visibility ?? "others") as "always" | "others" | "held" | "never",
            badge_effect: (rel as { mem_id: string; selected_badge_effect?: string | null; selected_frame_cd?: string | null }).selected_badge_effect ?? "none",
            frame_cd: (rel as { mem_id: string; selected_badge_effect?: string | null; selected_frame_cd?: string | null }).selected_frame_cd ?? "frame-none",
          });
        }
      }

      // 멤버별 종목별 최고기록만 추출
      const bestByMemberEvent = new Map<string, { event_type: string; record_time_sec: number; race_name: string; member: { id: string; full_name: string; gender: string } }>();
      for (const r of raceData ?? []) {
        const member = { mem_id: r.mem_id, mem_nm: r.mem_nm, gdr_enm: r.gdr_enm };
        const evt = r.evt_cd?.toUpperCase() ?? "";
        const key = `${member.mem_id}_${evt}`;
        const existing = bestByMemberEvent.get(key);
        if (!evt) continue;
        if (!existing || r.rec_time_sec < existing.record_time_sec) {
          bestByMemberEvent.set(key, {
            event_type: evt,
            record_time_sec: r.rec_time_sec,
            race_name: r.race_nm ?? "",
            member: {
              id: member.mem_id,
              full_name: member.mem_nm ?? "",
              gender: member.gdr_enm ?? "male",
            },
          });
        }

      }
      const pbData = Array.from(bestByMemberEvent.values());

      // 트레일러닝: UTMB 프로필 보유자의 최근 대회 기록 조회
      const utmbMembers = (utmbData ?? [])
        .filter((r): r is typeof r & { utmb_idx: number; utmb_prf_url: string } => r.utmb_idx != null && r.utmb_prf_url != null)
        .map((r) => {
          if (!r.mem_nm || !r.mem_id) return null;
          return {
            id: r.mem_id as string,
            name: r.mem_nm as string,
            index: r.utmb_idx,
            url: r.utmb_prf_url,
            recentRaceName: r.rct_race_nm ?? null,
            recentRaceRecord: r.rct_race_rec ?? null,
          };
        })
        .filter((v): v is NonNullable<typeof v> => v !== null);

      // --- 마라톤 ---
      const marathonEvents = MARATHON_EVENTS.map((evt) => {
        const rows = (pbData ?? [])
          .filter((r) => r.event_type === evt.eventType)
          .map((r) => {
            const member = r.member as unknown as {
              id: string;
              full_name: string;
              gender: string;
            };
            return {
              memId: member.id,
              name: member.full_name,
              gender: member.gender,
              record: secondsToTime(r.record_time_sec),
              raceName: r.race_name,
              sortKey: r.record_time_sec,
            };
          });

        const toEntry = (r: (typeof rows)[number], i: number) => ({
          rank: i + 1,
          memId: r.memId,
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
            .map(toEntry),
          female: rows
            .filter((r) => r.gender === "female")
            .sort((a, b) => a.sortKey - b.sortKey)
            .map(toEntry),
        };
      });

      // --- 트레일러닝 ---
      const trailEntries = utmbMembers
        .sort((a, b) => b.index - a.index)
        .map((r, i) => ({
          rank: i + 1,
          memId: r.id,
          name: r.name,
          utmbIndex: r.index,
          recentRaceName: r.recentRaceName,
          recentRaceRecord: r.recentRaceRecord,
          utmbProfileUrl: r.url,
        }));

      // --- 철인3종 ---
      const olympicRows = (pbData ?? [])
        .filter((r) => r.event_type === "TRIATHLON_OLYMPIC")
        .map((r) => {
          const member = r.member as unknown as { id: string; full_name: string; gender: string };
          return {
            memId: member.id,
            name: member.full_name,
            record: secondsToTime(r.record_time_sec),
            raceName: r.race_name,
            sortKey: r.record_time_sec,
          };
        });

      const triathlonEvents = TRIATHLON_EVENTS.map((evt) => {
        let rows;
        if (evt.filter) {
          rows = olympicRows
            .filter((r) => evt.filter(r.raceName))
            .sort((a, b) => a.sortKey - b.sortKey);
        } else {
          rows = (pbData ?? [])
            .filter((r) => r.event_type === evt.eventType)
            .map((r) => {
              const member = r.member as unknown as { id: string; full_name: string; gender: string };
              return {
                memId: member.id,
                name: member.full_name,
                record: secondsToTime(r.record_time_sec),
                raceName: r.race_name,
                sortKey: r.record_time_sec,
              };
            })
            .sort((a, b) => a.sortKey - b.sortKey);
        }

        return {
          eventType: evt.eventType,
          label: evt.label,
          entries: rows.map((r, i) => ({
            rank: i + 1,
            memId: r.memId,
            name: r.name,
            record: r.record,
            raceName: r.raceName,
            isMain: false,
          })),
        };
      });

      // --- 하이록스 --- (멤버별 총시간 best 1건, 팀 멤버 한정)
      const hyroxBestByMember = new Map<
        string,
        { memId: string; name: string; recordSec: number; raceName: string; splits: import("@/lib/hyrox").HyroxSplits }
      >();
      for (const r of hyroxData ?? []) {
        if (!teamMemberIds.has(r.mem_id)) continue;
        const mem = Array.isArray(r.mem_mst) ? r.mem_mst[0] : r.mem_mst;
        const existing = hyroxBestByMember.get(r.mem_id);
        if (!existing || r.rec_time_sec < existing.recordSec) {
          hyroxBestByMember.set(r.mem_id, {
            memId: r.mem_id,
            name: mem?.mem_nm ?? "",
            recordSec: r.rec_time_sec,
            raceName: r.race_nm ?? "",
            splits: parseHyroxSplits(r.splits_json),
          });
        }
      }
      const hyroxEntries = Array.from(hyroxBestByMember.values())
        .sort((a, b) => a.recordSec - b.recordSec)
        .map((r, i) => ({
          rank: i + 1,
          memId: r.memId,
          name: r.name,
          record: secondsToTime(r.recordSec),
          raceName: r.raceName,
          // 스테이션은 공식 순서로, 빈 칸은 null
          splits: HYROX_STATIONS.map((s) => ({
            code: s.code,
            label: s.label,
            spec: s.spec,
            record: r.splits[s.code] != null ? secondsToTime(r.splits[s.code]!) : null,
          })),
        }));

      // mem_id → 칭호 맵 직렬화 (unstable_cache는 plain object만 반환 가능)
      const memberTitles: Record<string, { ttl_nm: string; ttl_desc: string | null; desc_visibility: "always" | "others" | "held" | "never"; badge_effect: string; frame_cd: string }> =
        Object.fromEntries(memberTitleMap.entries());

      return {
        marathon: { events: marathonEvents },
        trail: { entries: trailEntries },
        hyrox: { entries: hyroxEntries },
        triathlon: { events: triathlonEvents },
        memberTitles,
      };
    },
    [`records-team-v2-${teamId}`],
    { revalidate: 60 * 60 * 24, tags: ["records", `records:${teamId}`] },
  )();
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
  void getRequestTeamContext();

  return (
    <div className="flex flex-col gap-0">
      <div className="flex h-14 items-center px-6">
        <H1 className="font-semibold">기강의 전당</H1>
      </div>
      <Suspense fallback={<RecordsSkeleton />}>
        <RecordsContent />
      </Suspense>
    </div>
  );
}
