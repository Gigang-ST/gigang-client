"use server";

import { withAdminOrThrow } from "@/lib/actions/auth";
import {
  MONTHLY_WINDOW,
  RECENT_WINDOW_DAYS,
} from "@/lib/constants/participation";
import { dayjs, recentMonthBucketsKST } from "@/lib/dayjs";
import {
  attendKey,
  CANCEL_HIST_SELECT,
  summarizeCancels,
  toCancelEvents,
  type CancelHistRow,
} from "@/lib/gathering/cancel-stats";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

// ---------------------------------------------------------------------------
// 참여 탭 집계 — 지표 정의의 단일 출처
//
// 원천(참석 44·신청 116·기록 172건)이 작아 RPC 없이 원시 행을 받아 TS로 집계한다.
// 규모가 커지면 이 함수 "속만" RPC 호출로 교체한다(호출부 불변 —
// get_member_monthly_activity 마이그레이션 주석의 원칙과 동일).
//
// 쿼리는 호출자 세션(supabase)로 실행 — RLS(팀 멤버 조회 허용)가 그대로 적용되고
// 명시적 team 필터를 이중으로 건다. RLS 우회(createAdminClient)가 필요 없다.
// ---------------------------------------------------------------------------

const KST = "Asia/Seoul";

export type MemberParticipationStat = {
  memId: string;
  /** 기간 내 지난 모임 참석 수 */
  attendCnt: number;
  /** 기간 내 정모(regular) 참석 수 */
  regularCnt: number;
  /** 기간 내 열린 모임 중 개설 수 (참석 여부 무관) */
  hostedCnt: number;
  /** 기간 내 팀 대회 신청 수 (신청 시각 기준) */
  compRegCnt: number;
  /** 전체 기간 모임 참석 수 (가입 후 미참여 판정용) */
  attendAllCnt: number;
  /** 최근 28일 모임 참석 수 (참여 온도 판정용, 기간 필터 무관) */
  recentAttendCnt: number;
  /** 예정 대회 신청 보유 여부 */
  upcomingReg: boolean;
  /** 마지막 참여 시각 — 모임 참석·완주 기록 중 최신 (신청은 제외, 전체 기간) */
  lastAt: string | null;
  /** 기간 내 모임 취소 수 — 본인·운영진 취소 모두 (취소한 시각 기준) */
  cancelCnt: number;
  /** 그중 시작 5시간 이내 취소 */
  imminentCnt: number;
};

export type ParticipationStats = {
  members: MemberParticipationStat[];
  /** 기간 내 열린(이미 지난) 모임 수 */
  gthrCnt: number;
  /** 기간 내 참석 연인원 */
  attendTotal: number;
  /** 최근 6개월 월별 참석 연인원·모임 수 (기간 필터 무관, 오래된 달 → 이번 달) */
  monthly: { ym: string; label: string; attendCnt: number; gthrCnt: number }[];
};


type RegRow = {
  mem_id: string;
  crt_at: string;
  team_comp_plan_rel: { comp_mst: { stt_dt: string } | null };
};

/**
 * 팀 전체 회원별 참여 집계.
 * @param fromISO 기간 시작 'YYYY-MM-DD' (KST, 포함)
 * @param toISO   기간 끝 'YYYY-MM-DD' (KST, 미포함)
 */
export async function getParticipationStats(
  fromISO: string,
  toISO: string,
): Promise<ParticipationStats> {
  return withAdminOrThrow(async ({ supabase }) => {
    const from = dayjs.tz(fromISO, KST);
    const to = dayjs.tz(toISO, KST);
    if (!from.isValid() || !to.isValid()) throw new Error("잘못된 기간입니다");

    const { teamId } = await getRequestTeamContext();

    // 전부 팀·기간 전체 조회라 시간이 갈수록 는다 — 1000행에서 잘리면 에러 없이 "0으로
    // 집계된 가짜 성공"이 되므로 끝까지 읽는다(lib/supabase/fetch-all.ts). 실패하면 던진다.
    const [memRows, gthrRows, attdRows, regRows, raceRows, cnclRows] = await Promise.all([
      fetchAllRows(
        () =>
          supabase
            .from("team_mem_rel")
            .select("mem_id")
            .eq("team_id", teamId)
            .eq("vers", 0)
            .eq("del_yn", false)
            .order("team_mem_id", { ascending: true }),
        { label: "participation:team_mem_rel" },
      ),
      fetchAllRows(
        () =>
          supabase
            .from("gthr_mst")
            .select("gthr_id, stt_at, gthr_type_enm, crt_by")
            .eq("team_id", teamId)
            .eq("del_yn", false)
            .order("gthr_id", { ascending: true }),
        { label: "participation:gthr_mst" },
      ),
      fetchAllRows(
        () =>
          supabase
            .from("gthr_attd_rel")
            .select("mem_id, gthr_id, gthr_mst!inner(team_id, del_yn)")
            .eq("gthr_mst.team_id", teamId)
            .eq("gthr_mst.del_yn", false)
            .order("attd_id", { ascending: true }),
        { label: "participation:gthr_attd_rel" },
      ),
      fetchAllRows(
        () =>
          supabase
            .from("comp_reg_rel")
            .select(
              "mem_id, crt_at, team_comp_plan_rel!inner(team_id, del_yn, comp_mst!inner(stt_dt))",
            )
            .eq("vers", 0)
            .eq("del_yn", false)
            .eq("team_comp_plan_rel.team_id", teamId)
            .eq("team_comp_plan_rel.del_yn", false)
            .order("comp_reg_id", { ascending: true }),
        { label: "participation:comp_reg_rel" },
      ),
      fetchAllRows(
        () =>
          supabase
            .from("rec_race_hist")
            .select("mem_id, race_dt")
            .eq("vers", 0)
            .eq("del_yn", false)
            .order("race_result_id", { ascending: true }),
        { label: "participation:rec_race_hist" },
      ),
      // 본인·운영진 취소 모두 — 운영진 취소는 대개 노쇼 정리다(lib/gathering/cancel-stats.ts).
      // ⚠️ 기간으로 자르지 않는다: (회원, 모임) 쌍의 마지막 취소를 고른 뒤 기간을 걸어야
      // 취소→재참석→재취소가 두 기간에 겹쳐 잡히지 않는다(summarizeCancels).
      fetchAllRows(
        () =>
          supabase
            .from("gthr_attd_hist")
            .select(CANCEL_HIST_SELECT)
            .eq("evt_cd", "cancel")
            .eq("gthr_mst.team_id", teamId)
            .eq("gthr_mst.del_yn", false)
            .order("hist_id", { ascending: true }),
        { label: "participation:gthr_attd_hist" },
      ),
    ]);

    const now = dayjs().tz(KST);
    const recentFrom = now.subtract(RECENT_WINDOW_DAYS, "day");
    const today = now.startOf("day");

    const monthly = recentMonthBucketsKST(MONTHLY_WINDOW).map((m) => ({
      ...m,
      attendCnt: 0,
      gthrCnt: 0,
    }));
    const monthBucket = new Map(monthly.map((m) => [m.ym, m]));

    const stats = new Map<string, MemberParticipationStat>(
      memRows.map((m) => [
        m.mem_id,
        {
          memId: m.mem_id,
          attendCnt: 0,
          regularCnt: 0,
          hostedCnt: 0,
          compRegCnt: 0,
          attendAllCnt: 0,
          recentAttendCnt: 0,
          upcomingReg: false,
          lastAt: null,
          cancelCnt: 0,
          imminentCnt: 0,
        },
      ]),
    );

    const bumpLast = (s: MemberParticipationStat, at: string) => {
      if (!s.lastAt || dayjs(at).isAfter(dayjs(s.lastAt))) s.lastAt = at;
    };

    // 모임 인덱스 — 이미 지난 모임만 "열린 모임"으로 센다 (예정 신청은 참석이 아님)
    const gthrMap = new Map(
      gthrRows.map((g) => {
        const stt = dayjs(g.stt_at);
        const past = stt.isBefore(now);
        return [
          g.gthr_id,
          {
            sttAt: g.stt_at,
            ym: stt.tz(KST).format("YYYY-MM"),
            regular: g.gthr_type_enm === "regular",
            crtBy: g.crt_by,
            past,
            inRange: past && !stt.isBefore(from) && stt.isBefore(to),
            recent: past && stt.isAfter(recentFrom),
          },
        ];
      }),
    );

    let gthrCnt = 0;
    let attendTotal = 0;
    for (const g of gthrMap.values()) {
      if (g.past) {
        const mb = monthBucket.get(g.ym);
        if (mb) mb.gthrCnt += 1;
      }
      if (!g.inRange) continue;
      gthrCnt += 1;
      const host = g.crtBy ? stats.get(g.crtBy) : undefined;
      if (host) host.hostedCnt += 1;
    }

    for (const a of attdRows) {
      const g = gthrMap.get(a.gthr_id);
      if (!g || !g.past) continue;
      // 팀 연인원·월별 집계는 회원 재적 여부와 무관 — 모임에 실제 온 사람 수가 사실
      const mb = monthBucket.get(g.ym);
      if (mb) mb.attendCnt += 1;
      if (g.inRange) attendTotal += 1;
      const s = stats.get(a.mem_id);
      if (!s) continue;
      s.attendAllCnt += 1;
      bumpLast(s, g.sttAt);
      if (g.recent) s.recentAttendCnt += 1;
      if (g.inRange) {
        s.attendCnt += 1;
        if (g.regular) s.regularCnt += 1;
      }
    }

    for (const r of regRows as unknown as RegRow[]) {
      const s = stats.get(r.mem_id);
      if (!s) continue;
      const crt = dayjs(r.crt_at);
      if (!crt.isBefore(from) && crt.isBefore(to)) s.compRegCnt += 1;
      const sttDt = r.team_comp_plan_rel.comp_mst?.stt_dt;
      if (sttDt && !dayjs.tz(sttDt, KST).isBefore(today)) s.upcomingReg = true;
    }

    for (const r of raceRows) {
      const s = stats.get(r.mem_id);
      if (!s) continue; // 팀 외 기록(전역 public select) 제외
      const dt = dayjs.tz(r.race_dt, KST); // date 컬럼 → KST 자정 앵커로 정규화
      if (dt.isAfter(now)) continue; // 미래 날짜 수기 기록은 "참여"가 아님
      bumpLast(s, dt.toISOString());
    }

    // 지금 참석 중인 (회원, 모임) — 취소했다가 다시 참석한 쌍은 취소가 아니다
    const attending = new Set(attdRows.map((a) => attendKey(a.mem_id, a.gthr_id)));
    const cancels = summarizeCancels(
      toCancelEvents(cnclRows as unknown as CancelHistRow[]),
      attending,
      { from, to },
    );
    // 팀 합계는 싣지 않는다 — 탭이 활동 회원 명단에서 합산해야 카드 숫자와 필터 결과가 맞는다
    for (const [memId, c] of cancels.byMember) {
      const s = stats.get(memId);
      if (!s) continue; // 탈퇴 등 현 재적 외
      s.cancelCnt = c.cancelCnt;
      s.imminentCnt = c.imminentCnt;
    }

    return {
      members: [...stats.values()],
      gthrCnt,
      attendTotal,
      monthly,
    };
  });
}
