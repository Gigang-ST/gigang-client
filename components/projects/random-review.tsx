import { createAdminClient } from "@/lib/supabase/admin";
import { todayKST } from "@/lib/dayjs";
import dayjs from "dayjs";
import { type MileageSport } from "@/lib/mileage";
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
      "act_id, review, act_dt, sprt_enm, distance_km, evt_team_prt_rel!inner(evt_id, mem_mst!inner(mem_nm))",
    )
    .eq("evt_team_prt_rel.evt_id", evtId)
    .not("review", "is", null)
    .neq("review", "")
    .gte("act_dt", sevenDaysAgo)
    .lte("act_dt", today)
    .order("act_dt", { ascending: false });

  if (!reviews || reviews.length === 0) return null;

  const lines: ReviewLine[] = reviews
    .map((item) => {
      const quote = item.review?.trim();
      if (!quote) return null;
      const rel = item.evt_team_prt_rel as { mem_mst: { mem_nm: string } };
      const name = rel.mem_mst.mem_nm;
      const sport = item.sprt_enm as MileageSport;
      const sportEmoji = SPORT_EMOJI_MAP[sport] ?? "🏃";
      const dist = Number(item.distance_km);
      const safeDist = Number.isFinite(dist) ? dist : 0;
      const formattedDist = safeDist % 1 === 0 ? safeDist : safeDist.toFixed(1);
      return {
        id: item.act_id,
        quote,
        meta: `${name} · ${sportEmoji} ${formattedDist}km`,
      };
    })
    .filter((line): line is ReviewLine => line !== null);

  if (lines.length === 0) return null;

  return <RandomReviewRotator lines={lines} />;
}
