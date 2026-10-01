import "server-only";

import { unstable_cache } from "next/cache";

import { todayKST } from "@/lib/dayjs";
import {
  buildMileageRecap,
  isRecapLedeWindow,
  toRecapTeaser,
  type MileageRecap,
  type RecapActRow,
  type RecapParticipant,
  type RecapSnapRow,
  type RecapTeaser,
} from "@/lib/mileage-recap";
import { RECAP_SEASON_EXTRAS, type RecapParty } from "@/lib/mileage-recap-seasons";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { isRequestAbortError } from "@/lib/supabase/is-abort-error";

/**
 * 마일리지런 시즌 돌아보기 — 조회 + 집계.
 *
 * 계산은 전부 `lib/mileage-recap.ts`(순수)가 하고, 여기선 행을 모아 넘기고 캐시만 건다.
 *
 * **본체는 하루 캐시한다.** 돌아보기는 **끝난 시즌**만 다루고 끝난 시즌은 거의 안 바뀐다(크루가
 * 정했다 — "끝났으니 내용이 바뀔 필요 없다"). 마감 직후 뒤늦게 올린 기록·지운 사진이 하루 안에
 * 따라오면 충분하다. 하루가 지나도 기다리는 사람은 없다 — 옛 값을 주며 뒤에서 다시 센다
 * (stale-while-revalidate). 그래서 무거운 집계(수천 행)는 사실상 하루 한 번만 돈다.
 *
 * **리드 티저는 1시간이다.** 이건 "시즌이 끝났나 / 30일 창 안인가"를 판정하는 캐시라, 하루로 잡으면
 * 시즌이 끝난 뒤 카드가 하루 늦게 뜨고 창이 닫힌 뒤 하루 더 남는다. 창 밖이면 조회 한 번으로 끝나고,
 * 창 안이면 시간당 한 번 집계 — 둘 다 가볍다.
 *
 * **오늘(KST)은 캐시 키가 아니라 콜백 안에서 읽는다.** "끝난 시즌"·리드 창 둘 다 오늘로
 * 판정하지만, 키에 날짜를 넣으면 KST 자정마다 키가 바뀌어 그날 첫 홈 방문이 **캐시 없이**
 * 시즌 전체를 집계하느라 막힌다. 콜백 안에서 읽으면 판정이 자정 뒤 최대 TTL만큼 늦을 뿐이고,
 * 그 사이엔 옛 값을 주며 뒤에서 갱신한다(stale-while-revalidate).
 *
 * **캐시를 겹치지 않는다.** `unstable_cache` 안에서 다른 `unstable_cache`를 부르면 Next가
 * 안쪽 캐시를 **읽지 않고** 쓰기만 한다(`isNestedUnstableCache`) — 겉보기엔 두 겹인데 실제로는
 * 안쪽이 매번 새로 돈다. 그래서 두 캐시가 캐시 없는 같은 계산(`computeLatest…`)을 각자 부른다.
 *
 * 키의 버전은 `buildMileageRecap`이 돌려주는 **모양**이 바뀌면 올린다 — 키가 래퍼 소스만 해시해서,
 * 안 올리면 배포 직후 TTL 동안 옛 모양이 새 화면으로 들어간다(§DESIGN 기강의 전당 캐시 키).
 */
/** 본체 — 끝난 시즌이라 하루 */
const RECAP_TTL = 60 * 60 * 24;
/** 리드 티저 — 시즌 종료·30일 창 판정이 늦지 않게 1시간 */
const TEASER_TTL = 60 * 60;
// v3: 기념비 순간·몰아 올린 기록 제외(act_id)까지 결과 모양이 바뀌었다
const KEY_VERSION = "v3";

type RecapEvent = {
  evt_id: string;
  team_id: string;
  evt_nm: string;
  stt_dt: string;
  end_dt: string;
};

/** 오늘 기준 가장 최근에 끝난 마일리지런 시즌. 없으면 null */
async function findLatestEndedEvent(
  teamId: string,
  today: string,
): Promise<RecapEvent | null> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("evt_team_mst")
    .select("evt_id, team_id, evt_nm, stt_dt, end_dt")
    .eq("team_id", teamId)
    .eq("evt_type_cd", "MILEAGE_RUN")
    .lt("end_dt", today)
    .order("end_dt", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** 한 시즌의 행을 모아 집계한다 — 참가자·기록·월 스냅 전부 시즌이 끝날 때까지 늘어나는 조회라 끝까지 읽는다 */
async function loadRecap(event: RecapEvent): Promise<MileageRecap> {
  const db = createAdminClient();

  const [prtRows, actRows, snapRows, leftRows] = await Promise.all([
    fetchAllRows(
      () =>
        db
          .from("evt_team_prt_rel")
          .select("prt_id, mem_id, mem_mst!inner(mem_nm, avatar_url, del_yn)")
          .eq("evt_id", event.evt_id)
          .eq("aprv_yn", true)
          .order("prt_id", { ascending: true }),
      { label: "recap:participants" },
    ),
    fetchAllRows(
      () =>
        db
          .from("evt_mlg_act_hist")
          .select(
            "act_id, prt_id, act_dt, sprt_enm, dst_km, elv_m, base_mlg, final_mlg, aply_mults, review, photo_url, created_at, evt_team_prt_rel!inner(evt_id)",
          )
          .eq("evt_team_prt_rel.evt_id", event.evt_id)
          .order("act_id", { ascending: true }),
      { label: "recap:acts" },
    ),
    fetchAllRows(
      () =>
        db
          .from("evt_mlg_mth_snap")
          .select("goal_id, prt_id, base_dt, goal_mlg, achv_mlg, evt_team_prt_rel!inner(evt_id)")
          .eq("evt_team_prt_rel.evt_id", event.evt_id)
          .order("goal_id", { ascending: true }),
      { label: "recap:snaps" },
    ),
    // 크루를 떠난 사람 — 계정은 살아 있어도(mem_mst.del_yn=false) 이름을 부르지 않는다.
    // 프로필 카드가 떠난 사람을 "함께 달렸던 멤버"로 가리는 것과 같은 선이다.
    fetchAllRows(
      () =>
        db
          .from("team_mem_rel")
          .select("team_mem_id, mem_id")
          .eq("team_id", event.team_id)
          .eq("vers", 0)
          .eq("del_yn", false)
          .eq("mem_st_cd", "left")
          .order("team_mem_id", { ascending: true }),
      { label: "recap:left-members" },
    ),
  ]);

  const left = new Set(leftRows.map((r) => r.mem_id));
  const participants: RecapParticipant[] = prtRows.map((r) => {
    const m = r.mem_mst as { mem_nm: string; avatar_url: string | null; del_yn: boolean | null };
    return {
      prt_id: r.prt_id,
      mem_id: r.mem_id,
      mem_nm: m.mem_nm,
      avatar_url: m.avatar_url,
      del_yn: m.del_yn === true || left.has(r.mem_id),
    };
  });

  const acts: RecapActRow[] = actRows.map((r) => ({
    act_id: r.act_id,
    prt_id: r.prt_id,
    act_dt: r.act_dt,
    sprt_enm: r.sprt_enm,
    dst_km: r.dst_km,
    elv_m: r.elv_m,
    base_mlg: r.base_mlg,
    final_mlg: r.final_mlg,
    aply_mults: r.aply_mults,
    review: r.review,
    photo_url: r.photo_url,
    created_at: r.created_at,
  }));

  const snaps: RecapSnapRow[] = snapRows.map((r) => ({
    prt_id: r.prt_id,
    base_dt: r.base_dt,
    goal_mlg: r.goal_mlg,
    achv_mlg: r.achv_mlg,
  }));

  return buildMileageRecap({
    event,
    participants,
    acts,
    snaps,
    bulkActIds: RECAP_SEASON_EXTRAS[event.evt_id]?.bulkActIds ?? [],
  });
}

/**
 * 캐시 없는 본 계산 — 두 캐시(본체·티저)가 각자 부른다(겹쳐 부르면 안쪽 캐시가 안 읽힌다).
 *
 * `onlyInLedeWindow`면 리드 창(종료 후 30일) 밖일 때 **무거운 조회 전에** 멈춘다 — 창이 닫힌
 * 뒤에도 티저 캐시는 10분마다 갱신되는데, 그때마다 시즌 전체를 읽어 놓고 null을 돌려주면 안 된다.
 */
async function computeLatestRecap(
  teamId: string,
  opts: { onlyInLedeWindow?: boolean } = {},
): Promise<MileageRecap | null> {
  const today = todayKST();
  const event = await findLatestEndedEvent(teamId, today);
  if (!event) return null;
  if (opts.onlyInLedeWindow && !isRecapLedeWindow(event.end_dt, today)) return null;
  return loadRecap(event);
}

/**
 * 가장 최근에 끝난 시즌의 돌아보기. 끝난 시즌이 없으면 null.
 *
 * 조회가 실패하면 **던진다** — 캐시 안에서 null을 돌려주면 unstable_cache가 그걸 정상값으로
 * 굳혀 TTL 동안 "끝난 시즌 없음"이 남는다(§team-overview 2026-09-23 장애와 같은 이유).
 * 화면 쪽 폴백은 호출자가 캐시 **바깥**에서 잡는다.
 */
export function getLatestMileageRecap(teamId: string): Promise<MileageRecap | null> {
  return unstable_cache(
    () => computeLatestRecap(teamId),
    ["mileage-recap", KEY_VERSION, teamId],
    { tags: ["mileage-recap"], revalidate: RECAP_TTL },
  )();
}

/**
 * 기강이야기 리드 첫 칸 "시즌 완주" 소식 — 종료 후 `RECAP_LEDE_DAYS`일 동안만.
 *
 * 홈 임계경로라 **따로 캐시한다**: 돌아보기 본체(사진·후기·사람별 집계)는 수백 KB라 홈이
 * 매 요청 그걸 캐시에서 꺼내 풀 이유가 없다 — 여기엔 숫자 몇 개와 얼굴 목록만 남는다.
 * 실패해도 홈은 멀쩡해야 하므로 바깥에서 null로 삼킨다.
 */
export function getMileageRecapTeaser(teamId: string): Promise<RecapTeaser | null> {
  return unstable_cache(
    async () => {
      const recap = await computeLatestRecap(teamId, { onlyInLedeWindow: true });
      return recap ? toRecapTeaser(recap) : null;
    },
    ["mileage-recap-teaser", KEY_VERSION, teamId],
    { tags: ["mileage-recap"], revalidate: TEASER_TTL },
  )().catch((error: unknown) => {
    if (!isRequestAbortError(error)) {
      console.error("[getMileageRecapTeaser] 시즌 완주 소식 조회 실패", error);
    }
    return null;
  });
}

/**
 * 시즌 마무리 회식 모임 — 돌아보기 맨 끝 초대 문구가 읽는다(`RECAP_SEASON_EXTRAS.partyGthrId`).
 * 한 행이라 캐시하지 않는다(장소·시간을 고치면 바로 보이게). 지워졌거나 못 읽으면 초대를 안 띄운다.
 */
export async function getRecapParty(teamId: string, gthrId: string): Promise<RecapParty | null> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("gthr_mst")
    .select("gthr_id, gthr_nm, stt_at, loc_txt, del_yn")
    .eq("team_id", teamId)
    .eq("gthr_id", gthrId)
    .maybeSingle();
  if (error) {
    if (!isRequestAbortError(error)) console.error("[getRecapParty] 회식 모임 조회 실패", error);
    return null;
  }
  if (!data || data.del_yn) return null;
  return {
    gthr_id: data.gthr_id,
    gthr_nm: data.gthr_nm,
    stt_at: data.stt_at,
    loc_txt: data.loc_txt,
  };
}
