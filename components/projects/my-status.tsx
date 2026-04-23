import {
  currentMonthKST,
  daysInMonth,
  todayDayKST,
  nextMonthStr,
} from "@/lib/dayjs";
import { calcPaceRatio, calcDailyNeeded } from "@/lib/mileage";
import { CardItem } from "@/components/ui/card";
import { Body, Caption } from "@/components/common/typography";
import {
  getEventGoalsMonthly,
  getEventLogsMonthly,
} from "@/lib/queries/project-data";

type MyStatusProps = {
  evtId: string;
  memId: string;
  month: string;
  evtStartMonth: string;
  evtEndMonth: string;
};

export async function MyStatus({
  evtId,
  memId,
  month,
}: MyStatusProps) {
  const [y, m] = month.split("-").map(Number);
  const totalDays = daysInMonth(y, m);

  const curMonth = currentMonthKST();
  let todayDay: number;
  if (month < curMonth) {
    todayDay = totalDays;
  } else if (month > curMonth) {
    todayDay = 0;
  } else {
    todayDay = todayDayKST();
  }
  const nextMonth = nextMonthStr(month);
  // 당월 데이터만 조회
  const [allGoals, allLogs] = await Promise.all([
    getEventGoalsMonthly(evtId, month),
    getEventLogsMonthly(evtId, month),
  ]);

  const goalRow = allGoals.find(
    (g) => g.mem_id === memId && g.std_mth === month,
  );

  if (!goalRow) {
    return (
      <CardItem className="flex flex-col gap-2">
        <Caption>목표가 설정되지 않았습니다.</Caption>
      </CardItem>
    );
  }

  const goalKm = Number(goalRow.goal_mlg);
  const myMonthLogs = allLogs.filter(
    (l) =>
      l.mem_id === memId &&
      (l.act_dt as string) >= month &&
      (l.act_dt as string) < nextMonth,
  );
  const currentMileage = myMonthLogs.reduce(
    (sum, l) => sum + Number(l.final_mlg),
    0,
  );

  const progressPct =
    goalKm > 0 ? Math.min((currentMileage / goalKm) * 100, 100) : 0;
  const paceRatio = calcPaceRatio(currentMileage, goalKm, todayDay, totalDays);
  const dailyNeeded = calcDailyNeeded(
    currentMileage,
    goalKm,
    todayDay,
    totalDays,
  );

  const isPaceAhead = paceRatio >= 1.0;

  return (
    <CardItem className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col gap-0.5">
          <Caption>당월 목표</Caption>
          <Body className="font-semibold">{goalKm.toFixed(0)} km</Body>
        </div>
        <div className="flex flex-col gap-0.5">
          <Caption>현재</Caption>
          <Body className="font-semibold">{currentMileage.toFixed(1)} km</Body>
        </div>
        <div className="flex flex-col gap-0.5">
          <Caption>진행률</Caption>
          <Body className="font-semibold">{progressPct.toFixed(1)}%</Body>
        </div>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Caption>기간 대비</Caption>
          <Caption
            className={
              isPaceAhead
                ? "text-success font-semibold"
                : "text-destructive font-semibold"
            }
          >
            {(paceRatio * 100).toFixed(0)}%
          </Caption>
        </div>
        <div>
          {dailyNeeded === "done" ? (
            <Caption className="text-success font-semibold">달성 완료!</Caption>
          ) : dailyNeeded === 0 ? (
            <Caption>월 종료</Caption>
          ) : (
            <Caption>
              일일 필요{" "}
              <span className="font-semibold text-foreground">
                {(dailyNeeded as number).toFixed(1)} km
              </span>
            </Caption>
          )}
        </div>
      </div>
    </CardItem>
  );
}
