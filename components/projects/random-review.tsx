import { dayjs, formatKoreanShortDate, todayKST } from "@/lib/dayjs";
import { type MileageSport } from "@/lib/mileage";
import { getMyTitleNames } from "@/lib/queries/member";
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

  // 리뷰 + 칭호 정보를 단일 쿼리로 조회 (왕복 2→1)
  const [{ data: reviews }, myTitleNames] = await Promise.all([
    supabase
      .from("evt_mlg_act_hist")
      .select(
        `act_id, review, act_dt, sprt_enm, dst_km,
        evt_team_prt_rel!inner(
          evt_id,
          mem_mst!inner(
            mem_id, mem_nm,
            team_mem_rel!left(
              selected_badge_effect, selected_frame_cd,
              mem_ttl_rel!left(
                is_prmy_yn, vers, del_yn,
                ttl_mst!inner(ttl_nm, ttl_desc, desc_visibility)
              )
            )
          )
        )`,
      )
      .eq("evt_team_prt_rel.evt_id", evtId)
      .not("review", "is", null)
      .neq("review", "")
      .gte("act_dt", sevenDaysAgo)
      .lte("act_dt", today)
      .order("act_dt", { ascending: false }),
    getMyTitleNames(),
  ]);

  if (!reviews || reviews.length === 0) return null;
  const myTitleNameSet = new Set(myTitleNames);

  // join 결과에서 칭호 맵 구성
  const titleMap = new Map<string, { ttl_nm: string; ttl_desc: string | null; desc_visibility: "always" | "others" | "held" | "never"; badge_effect: string; frame_cd: string }>();
  for (const item of reviews) {
    const rel = item.evt_team_prt_rel as { mem_mst: { mem_id: string; mem_nm: string; team_mem_rel?: { selected_badge_effect?: string | null; selected_frame_cd?: string | null; mem_ttl_rel?: { is_prmy_yn: boolean; vers: number; del_yn: boolean; ttl_mst: { ttl_nm: string; ttl_desc: string | null; desc_visibility: string } | null }[] }[] } };
    const memMst = rel?.mem_mst;
    if (!memMst) continue;
    const tmr = Array.isArray(memMst.team_mem_rel) ? memMst.team_mem_rel[0] : memMst.team_mem_rel;
    if (!tmr) continue;
    const primaryTitle = (tmr.mem_ttl_rel ?? []).find(
      (t) => t.is_prmy_yn && t.vers === 0 && !t.del_yn && t.ttl_mst,
    );
    if (!primaryTitle?.ttl_mst) continue;
    titleMap.set(memMst.mem_id, {
      ttl_nm: primaryTitle.ttl_mst.ttl_nm,
      ttl_desc: primaryTitle.ttl_mst.ttl_desc,
      desc_visibility: (primaryTitle.ttl_mst.desc_visibility ?? "others") as "always" | "others" | "held" | "never",
      badge_effect: tmr.selected_badge_effect ?? "none",
      frame_cd: tmr.selected_frame_cd ?? "frame-none",
    });
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
        isHeld: titleInfo ? myTitleNameSet.has(titleInfo.ttl_nm) : false,
        actDt: item.act_dt ?? "",
      };
    })
    .filter((line): line is ReviewLine => line !== null);

  if (lines.length === 0) return null;

  return <RandomReviewRotator lines={lines} />;
}
