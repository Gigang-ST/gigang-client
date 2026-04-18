import { createAdminClient } from "@/lib/supabase/admin";
import { todayKST } from "@/lib/dayjs";
import dayjs from "dayjs";
import { Caption } from "@/components/common/typography";
import { MILEAGE_SPORT_LABELS, type MileageSport } from "@/lib/mileage";

type RandomReviewProps = { evtId: string };

export async function RandomReview({ evtId }: RandomReviewProps) {
  const supabase = createAdminClient();

  const today = todayKST();
  const sevenDaysAgo = dayjs(today).subtract(7, "day").format("YYYY-MM-DD");

  const { data: reviews } = await supabase
    .from("evt_mlg_act_hist")
    .select("act_id, review, mem_id, act_dt, sport_cd, distance_km, mem_mst!inner(mem_nm)")
    .eq("evt_id", evtId)
    .not("review", "is", null)
    .neq("review", "")
    .gte("act_dt", sevenDaysAgo)
    .lte("act_dt", today)
    .order("act_dt", { ascending: false });

  if (!reviews || reviews.length === 0) return null;

  // 랜덤 최대 3건 선택
  const shuffled = [...reviews].sort(() => Math.random() - 0.5);
  const picks = shuffled.slice(0, 3);

  return (
    <div className="flex flex-col gap-2">
      {picks.map((item) => {
        const name = (item.mem_mst as unknown as { mem_nm: string }).mem_nm;
        const sport = MILEAGE_SPORT_LABELS[item.sport_cd as MileageSport] ?? item.sport_cd;
        const dist = Number(item.distance_km);
        return (
          <div
            key={item.act_id}
            className="rounded-2xl bg-muted px-4 py-3"
          >
            <Caption className="font-semibold text-foreground">
              {name}
            </Caption>
            <Caption className="text-muted-foreground">
              {" : "}
              {item.review}
              {" / "}
              {sport} {dist % 1 === 0 ? dist : dist.toFixed(1)}km
            </Caption>
          </div>
        );
      })}
    </div>
  );
}
