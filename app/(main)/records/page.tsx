import type { Metadata } from "next";
import { Suspense } from "react";

import { unstable_cache } from "next/cache";

import { secondsToTime } from "@/lib/dayjs";
import { getCurrentMember, getMyTitleNames } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { MARATHON_EVENTS, TRIATHLON_EVENTS } from "@/lib/records-board";
import { createAdminClient } from "@/lib/supabase/admin";

import { HeaderActions } from "@/components/common/header-actions";
import { PageHeader } from "@/components/common/page-header";
import { Skeleton } from "@/components/ui/skeleton";

import { RecordsClient } from "./records-client";


async function RecordsContent() {
  const { teamId } = await getRequestTeamContext();
  // getCurrentMember()는 React cache()라 getMyTitleNames() 안의 호출과 합쳐진다(쿼리 추가 없음).
  const [serializedData, myTitleNames, { member }] = await Promise.all([
    getCachedRecordsData(teamId),
    getMyTitleNames(),
    getCurrentMember(),
  ]);

  return (
    <RecordsClient
      data={serializedData}
      myTitleNames={[...myTitleNames]}
      myMemId={member?.id ?? null}
      teamId={teamId}
    />
  );
}

function getCachedRecordsData(teamId: string) {
  return unstable_cache(
    async () => {
      const supabase = createAdminClient();

      // 마라톤 + 철인3종 기록, UTMB 프로필, 대표 칭호, 멤버 표면(얼굴·한마디) 동시 조회
      const [{ data: raceData }, { data: utmbData }, { data: titleData }, { data: relData }] =
        await Promise.all([
          supabase.rpc("get_public_team_race_rankings", { p_team_id: teamId }),
          supabase.rpc("get_public_team_utmb_rankings", { p_team_id: teamId }),
          supabase
            .from("mem_ttl_rel")
            .select("team_mem_rel!inner(mem_id, selected_badge_effect, selected_frame_cd), ttl_mst!inner(ttl_nm, ttl_desc, desc_visibility)")
            .eq("team_mem_rel.team_id", teamId)
            // 운영에서 내린 칭호는 대표로 걸려 있어도 배지를 세우지 않는다(카드·전광판 RPC와 같은 규칙)
            .eq("ttl_mst.use_yn", true)
            .eq("is_prmy_yn", true)
            .eq("vers", 0)
            .eq("del_yn", false),
          // 챔피언 띠가 세우는 얼굴·한마디 — 랭킹 RPC엔 둘 다 없다.
          // 누가 챔피언인지는 랭킹을 다 계산해야 알 수 있으므로 팀 전체를 한 번에 받고,
          // **캐시에 담을 때 챔피언 것만 남긴다**(아래 championIds). 조회는 290행 스캔에
          // 15ms·버퍼 15로 옆 RPC들보다 훨씬 가볍고, 같은 Promise.all이라 병렬이다.
          supabase
            .from("team_mem_rel")
            .select("mem_id, intro_txt, mem_mst!inner(avatar_url)")
            .eq("team_id", teamId)
            .eq("vers", 0)
            .eq("del_yn", false),
        ]);

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
          // 판독선이 1위와의 격차를 재려면 표시 문자열이 아니라 원본 초가 필요하다
          recordSec: r.sortKey,
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
            recordSec: r.sortKey,
            raceName: r.raceName,
          })),
        };
      });

      // --- 멤버 표면(얼굴·한마디) ---
      // **챔피언 것만 담는다.** 이 표면을 쓰는 건 띠에 서는 사람들뿐이다
      // (마라톤 종목 3개 × 남녀 + 트레일 1위 = 최대 7명). 목록 카드는 안 쓴다.
      // 팀 전원을 담으면 쓰지도 않을 수십 행이 캐시와 RSC payload에 매번 실려 나간다.
      const championIds = new Set<string>(
        [
          ...marathonEvents.flatMap((e) => [e.male[0]?.memId, e.female[0]?.memId]),
          trailEntries[0]?.memId,
        ].filter((id): id is string => !!id),
      );

      const memberMeta: Record<string, { avatar_url: string | null; intro_txt: string | null }> = {};
      for (const row of relData ?? []) {
        if (!row.mem_id || !championIds.has(row.mem_id)) continue;
        const mst = Array.isArray(row.mem_mst) ? row.mem_mst[0] : row.mem_mst;
        memberMeta[row.mem_id] = {
          avatar_url: (mst as { avatar_url?: string | null } | null)?.avatar_url ?? null,
          intro_txt: row.intro_txt ?? null,
        };
      }

      // mem_id → 칭호 맵 직렬화 (unstable_cache는 plain object만 반환 가능)
      const memberTitles: Record<string, { ttl_nm: string; ttl_desc: string | null; desc_visibility: "always" | "others" | "held" | "never"; badge_effect: string; frame_cd: string }> =
        Object.fromEntries(memberTitleMap.entries());

      return {
        marathon: { events: marathonEvents },
        trail: { entries: trailEntries },
        triathlon: { events: triathlonEvents },
        memberTitles,
        memberMeta,
      };
    },
    // 페이로드 모양이 바뀌면 **키를 올린다**. 안 올리면 배포 직후 남아 있는 옛 캐시가
    // 새 필드(recordSec·memberMeta) 없이 돌아와 챔피언 띠·판독선이 조용히 비어 보인다.
    [`records-team-v6-${teamId}`],
    { revalidate: 60 * 60 * 24, tags: ["records", `records:${teamId}`] },
  )();
}

/** 실제 판과 같은 순서로 자리를 잡는다 — 세그먼트 → 종목 pill → 챔피언 띠 → 반칸 카드 */
function RecordsSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="px-6 pt-1">
        <Skeleton className="h-11 w-full rounded-xl" />
      </div>
      <div className="flex gap-2 px-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-20 rounded-full" />
        ))}
      </div>
      {/* 챔피언 띠는 전폭이라 스켈레톤도 좌우 끝까지 — 로딩 중 지면 폭이 흔들리지 않게 */}
      <Skeleton className="h-[140px] w-full rounded-none" />
      <div className="grid grid-cols-2 gap-2 px-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[62px] rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

export const metadata: Metadata = {
  title: "기강의 전당 — 크루 최고 기록",
  description: "기강 러닝크루 종목별 최고 기록. 5K·10K·하프·풀코스 크루원 기록을 모았습니다.",
  alternates: { canonical: "/records" },
};

export default function RecordsPage() {
  void getRequestTeamContext();

  return (
    <div className="flex flex-col gap-0">
      <PageHeader
        variant="editorial"
        label="Hall of Fame"
        title="기강의 전당"
        action={<HeaderActions />}
      />
      <Suspense fallback={<RecordsSkeleton />}>
        <RecordsContent />
      </Suspense>
    </div>
  );
}
