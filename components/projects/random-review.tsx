import dayjs from "dayjs";

import { formatKoreanShortDate, todayKST } from "@/lib/dayjs";
import { type MileageSport } from "@/lib/mileage";
import { createAdminClient } from "@/lib/supabase/admin";

import { RandomReviewRotator, type ReviewLine } from "@/components/projects/random-review-rotator";

type RandomReviewProps = { evtId: string };

const SPORT_EMOJI_MAP: Record<MileageSport, string> = {
  RUNNING: "🏃",
  TRAIL: "🏔️",
  CYCLING: "🚴",
  SWIMMING: "🏊",
};

export async function RandomReview({ evtId }: RandomReviewProps) {
  const supabase = createAdminClient();

  const today = todayKST();
  const sevenDaysAgo = dayjs(today).subtract(7, "day").format("YYYY-MM-DD");

  const { data: reviews } = await supabase
    .from("evt_mlg_act_hist")
    .select(
      "act_id, review, act_dt, sprt_enm, dst_km, evt_team_prt_rel!inner(evt_id, mem_mst!inner(mem_id, mem_nm))",
    )
    .eq("evt_team_prt_rel.evt_id", evtId)
    .not("review", "is", null)
    .neq("review", "")
    .gte("act_dt", sevenDaysAgo)
    .lte("act_dt", today)
    .order("act_dt", { ascending: false });

  if (!reviews || reviews.length === 0) return null;

  // 멤버 ID 목록 추출
  const memIds: string[] = [];
  for (const item of reviews) {
    const rel = item.evt_team_prt_rel as { mem_mst: { mem_id: string; mem_nm: string } };
    if (rel?.mem_mst?.mem_id) {
      memIds.push(rel.mem_mst.mem_id);
    }
  }

  // 칭호/프레임 맵 조회
  const titleMap = new Map<string, { ttl_nm: string; ttl_desc: string | null; desc_visibility: "always" | "others" | "held" | "never"; badge_effect: string; frame_cd: string }>();
  if (memIds.length > 0) {
    const { data: titleData } = await supabase
      .from("mem_ttl_rel")
      .select("team_mem_rel!inner(mem_id, selected_badge_effect, selected_frame_cd), ttl_mst!inner(ttl_nm, ttl_desc, desc_visibility)")
      .in("team_mem_rel.mem_id", memIds)
      .eq("is_prmy_yn", true)
      .eq("vers", 0)
      .eq("del_yn", false);
    for (const row of titleData ?? []) {
      const rel = Array.isArray(row.team_mem_rel) ? row.team_mem_rel[0] : row.team_mem_rel;
      const ttl = Array.isArray(row.ttl_mst) ? row.ttl_mst[0] : row.ttl_mst;
      if (rel?.mem_id && ttl?.ttl_nm) {
        const r = rel as { mem_id: string; selected_badge_effect?: string | null; selected_frame_cd?: string | null };
        const t = ttl as { ttl_nm: string; ttl_desc?: string | null; desc_visibility?: string };
        titleMap.set(r.mem_id, {
          ttl_nm: t.ttl_nm,
          ttl_desc: t.ttl_desc ?? null,
          desc_visibility: (t.desc_visibility ?? "others") as "always" | "others" | "held" | "never",
          badge_effect: r.selected_badge_effect ?? "none",
          frame_cd: r.selected_frame_cd ?? "frame-none",
        });
      }
    }
  }

  const lines: ReviewLine[] = reviews
    .map((item) => {
      const quote = item.review?.trim();
      if (!quote) return null;
      const rel = item.evt_team_prt_rel as { mem_mst: { mem_id: string; mem_nm: string } };
      const memId = rel.mem_mst.mem_id;
      const name = rel.mem_mst.mem_nm;
      const sport = item.sprt_enm as MileageSport;
      const sportEmoji = SPORT_EMOJI_MAP[sport] ?? "🏃";
      const dist = Number(item.dst_km);
      const safeDist = Number.isFinite(dist) ? dist : 0;
      const formattedDist = safeDist % 1 === 0 ? safeDist : safeDist.toFixed(1);
      const actDate = formatKoreanShortDate(item.act_dt);
      const titleInfo = titleMap.get(memId);
      return {
        id: item.act_id,
        quote,
        name,
        metaSuffix: ` · ${sportEmoji} ${formattedDist}km · ${actDate}`,
        ttlNm: titleInfo?.ttl_nm ?? null,
        ttlDesc: titleInfo?.ttl_desc ?? null,
        descVisibility: titleInfo?.desc_visibility ?? "others",
        badgeEffect: titleInfo?.badge_effect ?? null,
        frameCd: titleInfo?.frame_cd ?? null,
      };
    })
    .filter((line): line is ReviewLine => line !== null);

  if (lines.length === 0) return null;

  return <RandomReviewRotator lines={lines} />;
}
