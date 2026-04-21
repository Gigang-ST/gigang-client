import { createAdminClient } from "@/lib/supabase/admin";
import { todayKST } from "@/lib/dayjs";
import dayjs from "dayjs";
import { MILEAGE_SPORT_LABELS, type MileageSport } from "@/lib/mileage";
import { RandomReviewRotator, type ReviewLine } from "@/components/projects/random-review-rotator";

type RandomReviewProps = { evtId: string };

export async function RandomReview({ evtId }: RandomReviewProps) {
  const supabase = createAdminClient();

  const today = todayKST();
  const sevenDaysAgo = dayjs(today).subtract(7, "day").format("YYYY-MM-DD");

  const { data: reviews } = await supabase
    .from("evt_mlg_act_hist")
    .select("act_id, review, mem_id, act_dt, sprt_enm, distance_km, mem_mst!inner(mem_nm)")
    .eq("evt_id", evtId)
    .not("review", "is", null)
    .neq("review", "")
    .gte("act_dt", sevenDaysAgo)
    .lte("act_dt", today)
    .order("act_dt", { ascending: false });

  if (!reviews || reviews.length === 0) return null;

  const lines: ReviewLine[] = reviews.map((item) => {
    const name = (item.mem_mst as unknown as { mem_nm: string }).mem_nm;
    const sport = MILEAGE_SPORT_LABELS[item.sprt_enm as MileageSport] ?? item.sprt_enm;
    const dist = Number(item.distance_km);
    return {
      id: item.act_id,
      quote: item.review,
      meta: `🏃 ${name} · ${sport} ${dist % 1 === 0 ? dist : dist.toFixed(1)}km`,
    };
  });

  return <RandomReviewRotator lines={lines} />;
}
