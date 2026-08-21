import { beforeEach, describe, expect, it } from "vitest";

import { todayKST, currentMonthKST } from "@/lib/dayjs";
import type { OperatorContext } from "@/lib/mcp/auth";
import {
  MAX_BATCH_ACTIVITIES,
  deleteMyActivity,
  getMyMileage,
  listMileageMultipliers,
  listMyActivities,
  logMyActivities,
  resolveMyParticipation,
  updateMyActivity,
} from "@/lib/mcp/mileage";
import { ToolInputError } from "@/lib/mcp/queries";

import { FakeSupabase, type Row } from "./fake-supabase";

/**
 * #497 마일리지런 개인 도구 검증.
 *
 * 핵심 불변식은 **본인 스코프**다 — 남의 act_id 로는 조회·수정·삭제 어느 것도 되지 않아야 하고,
 * admin 이어도 예외가 없어야 한다(앱 액션은 admin 우회를 허용하지만 이 창구는 "내 기록"이다).
 *
 * 날짜는 오늘(KST) 기준으로 만든다 — 고정 날짜를 박으면 "미래 날짜 불가"·"2개월 이전 불가"
 * 규칙 때문에 테스트가 달력이 넘어가는 날 저절로 깨진다.
 */

const TEAM_ID = "22222222-2222-4222-8222-222222222222";
const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "99999999-9999-4999-8999-999999999999";
const EVT_ID = "44444444-4444-4444-8444-444444444444";
const MY_PRT = "55555555-5555-4555-8555-555555555555";
const OTHER_PRT = "66666666-6666-4666-8666-666666666666";
const MULT_ID = "77777777-7777-4777-8777-777777777777";
const MULT_ID_2 = "77777777-7777-4777-8777-777777777779";
const OTHER_ACT_ID = "88888888-8888-4888-8888-888888888888";

/** 기간 제한 없는 활성 배율 1행. 기간·이름·값만 덮어써 변형을 만든다. */
function multRow(overrides: Partial<Row> = {}): Row {
  return {
    mult_id: MULT_ID,
    evt_id: EVT_ID,
    mult_nm: "여름 2배",
    mult_val: 2,
    stt_dt: null,
    end_dt: null,
    active_yn: true,
    ...overrides,
  };
}

const TODAY = todayKST();
const MONTH_START = currentMonthKST(); // 'YYYY-MM-01'

function ctxOf(overrides: Partial<OperatorContext> = {}): OperatorContext {
  return { mem_id: ME, team_id: TEAM_ID, is_admin: false, mem_nm: "나", ...overrides };
}

/** 이벤트 기간은 오늘을 넉넉히 감싸도록 잡는다(진행 중 판정용). */
const EVT = {
  evt_nm: "2026 마일리지런",
  stt_dt: "2020-01-01",
  end_dt: "2099-12-31",
  stts_enm: "ACTIVE",
  team_id: TEAM_ID,
};

function seed(overrides: Record<string, Row[]> = {}) {
  return new FakeSupabase({
    evt_team_prt_rel: [
      {
        prt_id: MY_PRT,
        evt_id: EVT_ID,
        mem_id: ME,
        aprv_yn: true,
        init_goal: 50,
        stt_mth: MONTH_START,
        evt_team_mst: EVT,
      },
      {
        prt_id: OTHER_PRT,
        evt_id: EVT_ID,
        mem_id: OTHER,
        aprv_yn: true,
        init_goal: 50,
        stt_mth: MONTH_START,
        evt_team_mst: EVT,
      },
    ],
    evt_team_mst: [{ evt_id: EVT_ID, ...EVT }],
    evt_mlg_mth_snap: [
      {
        goal_id: "g1",
        prt_id: MY_PRT,
        base_dt: MONTH_START,
        goal_mlg: 50,
        achv_mlg: 0,
        achv_yn: false,
        act_cnt: 0,
        lst_act_dt: null,
      },
    ],
    evt_mlg_act_hist: [
      // 남의 기록 — 내 도구로는 절대 닿으면 안 된다.
      {
        act_id: OTHER_ACT_ID,
        prt_id: OTHER_PRT,
        act_dt: TODAY,
        sprt_enm: "RUNNING",
        dst_km: 10,
        elv_m: 0,
        base_mlg: 10,
        aply_mults: [],
        final_mlg: 10,
        review: "남의 기록",
        photo_url: null,
      },
    ],
    evt_mlg_mult_cfg: [],
    team_mem_rel: [
      {
        mem_id: ME,
        team_id: TEAM_ID,
        team_mem_id: "tm-1",
        vers: 0,
        del_yn: false,
      },
    ],
    ...overrides,
  });
}

let db: FakeSupabase;
beforeEach(() => {
  db = seed();
});

describe("evt_id 자동 해석 — 대화에서 이벤트 uuid 를 부를 일이 없다", () => {
  it("승인된 참가 정보를 찾아 채운다", async () => {
    const prt = await resolveMyParticipation(db.asClient(), ctxOf());
    expect(prt).toMatchObject({ prt_id: MY_PRT, evt_id: EVT_ID, evt_nm: EVT.evt_nm });
  });

  it("승인 전(aprv_yn=false)이면 안내와 함께 거부한다", async () => {
    const d = seed({
      evt_team_prt_rel: [
        {
          prt_id: MY_PRT,
          evt_id: EVT_ID,
          mem_id: ME,
          aprv_yn: false,
          init_goal: 50,
          stt_mth: MONTH_START,
          evt_team_mst: EVT,
        },
      ],
    });
    await expect(resolveMyParticipation(d.asClient(), ctxOf())).rejects.toBeInstanceOf(
      ToolInputError,
    );
    await expect(resolveMyParticipation(d.asClient(), ctxOf())).rejects.toThrow(/승인/);
  });

  it("남의 참가 행을 집어오지 않는다", async () => {
    const prt = await resolveMyParticipation(db.asClient(), ctxOf());
    expect(prt.prt_id).not.toBe(OTHER_PRT);
  });
});

describe("log_my_activity — 마일리지는 서버가 계산한다", () => {
  it("러닝 거리+고도/100 으로 기본 마일리지를 내고 내 prt_id 로 저장한다", async () => {
    const result = await logMyActivities(db.asClient(), ctxOf(), [
      { act_dt: TODAY, sport: "RUNNING", distance_km: 12, elevation_m: 80 },
    ]);

    expect(result.saved_cnt).toBe(1);
    expect(result.activities[0]).toMatchObject({
      base_mlg: 12.8, // 12 + 80/100
      final_mlg: 12.8,
      sport_label: "러닝",
    });
    const inserted = db.tables.evt_mlg_act_hist.find((r) => r.prt_id === MY_PRT);
    expect(inserted).toBeTruthy();
    expect(inserted?.photo_url).toBeNull();
  });

  it("사진을 못 붙인다는 안내를 응답에 실어 AI 가 그대로 전하게 한다", async () => {
    const result = await logMyActivities(db.asClient(), ctxOf(), [
      { act_dt: TODAY, sport: "RUNNING", distance_km: 5 },
    ]);
    expect(result.notice).toMatch(/깅스타그램|기강이야기/);
  });

  /**
   * #504 회귀 — 한때 그날 걸려 있던 배율을 **전부** 자동으로 붙였다. 배율의 성립 조건
   * (모임 참석·벙주/참석자·LSD 인원수)은 서버가 판정할 수 없으므로 앱 폼과 같은
   * 자기신고여야 한다: **고른 것만 붙고, 안 고르면 아무것도 안 붙는다.**
   */
  it("배율을 안 고르면 그날 걸려 있어도 아무것도 붙지 않는다", async () => {
    const d = seed({ evt_mlg_mult_cfg: [multRow()] });

    const result = await logMyActivities(d.asClient(), ctxOf(), [
      { act_dt: TODAY, sport: "RUNNING", distance_km: 10 },
    ]);

    expect(result.activities[0].final_mlg).toBe(10);
    expect(result.activities[0].applied_mults).toEqual([]);
  });

  it("고른 배율만 적용하고 무엇이 붙었는지 응답에 적는다", async () => {
    const d = seed({
      evt_mlg_mult_cfg: [
        multRow(),
        multRow({ mult_id: MULT_ID_2, mult_nm: "정기런", mult_val: 1.2 }),
      ],
    });

    const result = await logMyActivities(d.asClient(), ctxOf(), [
      { act_dt: TODAY, sport: "RUNNING", distance_km: 10, multipliers: ["여름 2배"] },
    ]);

    expect(result.activities[0].final_mlg).toBe(20);
    expect(result.activities[0].applied_mults).toEqual([
      { mult_nm: "여름 2배", mult_val: 2 },
    ]);
  });

  it("이름은 공백·대소문자 차이를 무시하고, mult_id 를 그대로 줘도 받는다", async () => {
    const d = seed({ evt_mlg_mult_cfg: [multRow({ mult_nm: "3인이상 LSD" })] });

    const byName = await logMyActivities(d.asClient(), ctxOf(), [
      { act_dt: TODAY, sport: "RUNNING", distance_km: 10, multipliers: ["3인이상LSD"] },
    ]);
    expect(byName.activities[0].final_mlg).toBe(20);

    const byId = await logMyActivities(d.asClient(), ctxOf(), [
      { act_dt: TODAY, sport: "RUNNING", distance_km: 10, multipliers: [MULT_ID] },
    ]);
    expect(byId.activities[0].final_mlg).toBe(20);
  });

  /**
   * 없는 이름을 조용히 빼면 "붙는 줄 알았는데 안 붙은" 마일리지가 남는다 — 보증금 환급이
   * 걸린 숫자라 거부하고, 그날 고를 수 있는 목록을 오류에 실어 다시 부르게 한다.
   */
  it("그날 유효하지 않은 배율 이름은 조용히 빼지 않고 거부한다", async () => {
    const d = seed({
      evt_mlg_mult_cfg: [
        multRow(),
        multRow({
          mult_id: MULT_ID_2,
          mult_nm: "지난 이벤트",
          stt_dt: "2020-01-01",
          end_dt: "2020-01-31",
        }),
      ],
    });

    await expect(
      logMyActivities(d.asClient(), ctxOf(), [
        { act_dt: TODAY, sport: "RUNNING", distance_km: 10, multipliers: ["지난 이벤트"] },
      ]),
    ).rejects.toThrow(ToolInputError);

    await expect(
      logMyActivities(d.asClient(), ctxOf(), [
        { act_dt: TODAY, sport: "RUNNING", distance_km: 10, multipliers: ["없는 배율"] },
      ]),
    ).rejects.toThrow(/여름 2배/); // 고를 수 있는 목록을 답에 실어 준다

    // 한 건이라도 걸리면 아무것도 저장되지 않는다.
    expect(d.tables.evt_mlg_act_hist.filter((r) => r.prt_id === MY_PRT)).toHaveLength(0);
  });

  it("미래 날짜는 거부한다(앱과 같은 규칙)", async () => {
    const tomorrow = new Date(`${TODAY}T00:00:00Z`);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const future = tomorrow.toISOString().slice(0, 10);

    await expect(
      logMyActivities(db.asClient(), ctxOf(), [
        { act_dt: future, sport: "RUNNING", distance_km: 5 },
      ]),
    ).rejects.toThrow(/미래 날짜/);
  });

  it("저장 뒤 그 달 현황을 함께 돌려준다(넣고 바로 확인)", async () => {
    const result = await logMyActivities(db.asClient(), ctxOf(), [
      { act_dt: TODAY, sport: "RUNNING", distance_km: 20 },
    ]);
    expect(result.month_after).toMatchObject({ goal_mlg: 50, achv_mlg: 20, achv_yn: false });
    expect(result.month_after?.remaining_mlg).toBe(30);
  });
});

describe("log_my_activities — 다건은 전부 검증한 뒤에 저장한다", () => {
  it("한 건이라도 걸리면 아무것도 저장하지 않는다", async () => {
    await expect(
      logMyActivities(db.asClient(), ctxOf(), [
        { act_dt: TODAY, sport: "RUNNING", distance_km: 10 },
        { act_dt: TODAY, sport: "RUNNING", distance_km: -3 }, // 음수 거리
      ]),
    ).rejects.toBeInstanceOf(ToolInputError);

    // 앞의 한 건도 들어가면 안 된다 — 반쯤 저장된 상태가 제일 나쁘다.
    expect(db.tables.evt_mlg_act_hist.filter((r) => r.prt_id === MY_PRT)).toHaveLength(0);
  });

  it(`상한(${MAX_BATCH_ACTIVITIES}건)을 넘으면 거부한다`, async () => {
    const many = Array.from({ length: MAX_BATCH_ACTIVITIES + 1 }, () => ({
      act_dt: TODAY,
      sport: "RUNNING",
      distance_km: 1,
    }));
    await expect(logMyActivities(db.asClient(), ctxOf(), many)).rejects.toThrow(
      new RegExp(`${MAX_BATCH_ACTIVITIES}건`),
    );
  });

  it("여러 건을 한 번에 저장하고 합계가 그 달 현황에 반영된다", async () => {
    const result = await logMyActivities(db.asClient(), ctxOf(), [
      { act_dt: TODAY, sport: "RUNNING", distance_km: 10 },
      { act_dt: TODAY, sport: "RUNNING", distance_km: 15 },
      { act_dt: TODAY, sport: "SWIMMING", distance_km: 1 }, // 수영은 km×3
    ]);
    expect(result.saved_cnt).toBe(3);
    expect(result.month_after?.achv_mlg).toBe(28); // 10 + 15 + 3
  });
});

describe("본인 스코프 — 남의 기록에는 닿지 못한다(admin 우회 없음)", () => {
  it("남의 act_id 수정은 거부되고 그 행은 그대로다", async () => {
    await expect(
      updateMyActivity(db.asClient(), ctxOf(), OTHER_ACT_ID, {
        act_dt: TODAY,
        sport: "RUNNING",
        distance_km: 999,
      }),
    ).rejects.toBeInstanceOf(ToolInputError);

    const other = db.tables.evt_mlg_act_hist.find((r) => r.act_id === OTHER_ACT_ID);
    expect(other?.dst_km).toBe(10); // 손대지 않음
  });

  it("남의 act_id 삭제는 거부되고 그 행은 남는다", async () => {
    await expect(
      deleteMyActivity(db.asClient(), ctxOf(), OTHER_ACT_ID),
    ).rejects.toBeInstanceOf(ToolInputError);
    expect(db.tables.evt_mlg_act_hist.some((r) => r.act_id === OTHER_ACT_ID)).toBe(true);
  });

  it("admin 토큰이어도 남의 기록은 못 고친다 — 이 창구는 '내 기록'이다", async () => {
    await expect(
      updateMyActivity(db.asClient(), ctxOf({ is_admin: true }), OTHER_ACT_ID, {
        act_dt: TODAY,
        sport: "RUNNING",
        distance_km: 999,
      }),
    ).rejects.toBeInstanceOf(ToolInputError);
  });

  it("거부 메시지가 남의 기록의 존재 여부를 알려주지 않는다", async () => {
    await expect(
      deleteMyActivity(db.asClient(), ctxOf(), OTHER_ACT_ID),
    ).rejects.toThrow(/내 기록 중에/);
  });

  it("내 기록 목록에 남의 기록이 섞이지 않는다", async () => {
    await logMyActivities(db.asClient(), ctxOf(), [
      { act_dt: TODAY, sport: "RUNNING", distance_km: 7 },
    ]);
    const { activities } = await listMyActivities(db.asClient(), ctxOf(), { date: TODAY });
    expect(activities).toHaveLength(1);
    expect(activities[0].distance_km).toBe(7);
  });
});

describe("update / delete — 내 기록", () => {
  it("수정하면 마일리지가 다시 계산되고 before/after 를 같이 돌려준다", async () => {
    const logged = await logMyActivities(db.asClient(), ctxOf(), [
      { act_dt: TODAY, sport: "RUNNING", distance_km: 12 },
    ]);
    const actId = logged.activities[0].act_id;

    const result = await updateMyActivity(db.asClient(), ctxOf(), actId, {
      act_dt: TODAY,
      sport: "RUNNING",
      distance_km: 12.4,
    });

    expect(result.before.distance_km).toBe(12);
    expect(result.after.distance_km).toBe(12.4);
    expect(result.after.final_mlg).toBe(12.4);
    expect(result.month_after?.achv_mlg).toBe(12.4);
  });

  /**
   * 앱 수정 폼이 기존 체크를 프리필하는 것과 같은 규약 — 거리 오타만 고치러 온 사람이
   * 배율을 다시 나열하지 않아도 되어야 한다. 떼려면 빈 배열을 **명시**한다.
   */
  it("multipliers 를 안 주면 붙어 있던 배율을 그대로 잇고, [] 를 주면 전부 뗀다", async () => {
    const d = seed({ evt_mlg_mult_cfg: [multRow()] });
    const logged = await logMyActivities(d.asClient(), ctxOf(), [
      { act_dt: TODAY, sport: "RUNNING", distance_km: 10, multipliers: ["여름 2배"] },
    ]);
    const actId = logged.activities[0].act_id;

    const kept = await updateMyActivity(d.asClient(), ctxOf(), actId, {
      act_dt: TODAY,
      sport: "RUNNING",
      distance_km: 20,
    });
    expect(kept.after.applied_mults).toEqual([{ mult_nm: "여름 2배", mult_val: 2 }]);
    expect(kept.after.final_mlg).toBe(40);

    const cleared = await updateMyActivity(d.asClient(), ctxOf(), actId, {
      act_dt: TODAY,
      sport: "RUNNING",
      distance_km: 20,
      multipliers: [],
    });
    expect(cleared.after.applied_mults).toEqual([]);
    expect(cleared.after.final_mlg).toBe(20);
  });

  /**
   * #504 후속 — 예전엔 `multipliers` 만 "생략=유지"였고 `review`·`elevation_m` 은
   * "생략=null/0 으로 설정"이라 방향이 반대였다. 거리 오타만 고치러 온 호출에서 후기가
   * 조용히 날아가고, 고도는 러닝 마일리지(거리 + 고도/100)에 들어가 **숫자까지 틀어졌다.**
   */
  it("수정에서 안 준 선택 항목(고도·후기)은 그대로 두고, 지우려면 명시해야 한다", async () => {
    const logged = await logMyActivities(db.asClient(), ctxOf(), [
      { act_dt: TODAY, sport: "RUNNING", distance_km: 10, elevation_m: 80, review: "정기런" },
    ]);
    const actId = logged.activities[0].act_id;
    expect(logged.activities[0].final_mlg).toBe(10.8); // 10 + 80/100

    // 거리만 고친다 — 고도·후기는 건드리지 않았으니 남아 있어야 한다.
    const kept = await updateMyActivity(db.asClient(), ctxOf(), actId, {
      act_dt: TODAY,
      sport: "RUNNING",
      distance_km: 12,
    });
    expect(kept.after.elevation_m).toBe(80);
    expect(kept.after.review).toBe("정기런");
    expect(kept.after.final_mlg).toBe(12.8);

    // 지울 때는 명시한다.
    const cleared = await updateMyActivity(db.asClient(), ctxOf(), actId, {
      act_dt: TODAY,
      sport: "RUNNING",
      distance_km: 12,
      elevation_m: 0,
      review: null,
    });
    expect(cleared.after.elevation_m).toBe(0);
    expect(cleared.after.review).toBeNull();
    expect(cleared.after.final_mlg).toBe(12);
  });

  it("등록은 생략을 '없음'으로 본다 — 이을 기존 값이 없다", async () => {
    const logged = await logMyActivities(db.asClient(), ctxOf(), [
      { act_dt: TODAY, sport: "RUNNING", distance_km: 10 },
    ]);
    expect(logged.activities[0].elevation_m).toBe(0);
    expect(logged.activities[0].final_mlg).toBe(10);
  });

  it("삭제하면 행이 사라지고 그 달 집계가 줄어든다", async () => {
    const logged = await logMyActivities(db.asClient(), ctxOf(), [
      { act_dt: TODAY, sport: "RUNNING", distance_km: 12 },
      { act_dt: TODAY, sport: "RUNNING", distance_km: 8 },
    ]);
    const actId = logged.activities[0].act_id;

    const result = await deleteMyActivity(db.asClient(), ctxOf(), actId);

    expect(result.deleted.distance_km).toBe(12);
    expect(db.tables.evt_mlg_act_hist.some((r) => r.act_id === actId)).toBe(false);
    expect(result.month_after?.achv_mlg).toBe(8);
  });

  it("사진이 붙은 기록은 앱으로 보낸다(파일까지 정리해야 하므로)", async () => {
    const d = seed({
      evt_mlg_act_hist: [
        {
          act_id: "aaaaaaaa-0000-4000-8000-000000000001",
          prt_id: MY_PRT,
          act_dt: TODAY,
          sprt_enm: "RUNNING",
          dst_km: 10,
          elv_m: 0,
          base_mlg: 10,
          aply_mults: [],
          final_mlg: 10,
          review: null,
          photo_url: "https://x.supabase.co/storage/v1/object/public/post-photos/a/b.webp",
        },
      ],
    });

    await expect(
      deleteMyActivity(d.asClient(), ctxOf(), "aaaaaaaa-0000-4000-8000-000000000001"),
    ).rejects.toThrow(/앱\(프로젝트탭\)/);
    // 거부했으면 행도 남아 있어야 한다.
    expect(d.tables.evt_mlg_act_hist).toHaveLength(1);
  });
});

describe("get_my_mileage / list_my_activities / list_mileage_multipliers", () => {
  it("남은 마일리지를 계산해 준다", async () => {
    const row = await getMyMileage(db.asClient(), ctxOf());
    expect(row).toMatchObject({ goal_mlg: 50, achv_mlg: 0, achv_yn: false, remaining_mlg: 50 });
  });

  it("목표 행이 없는 달은 **있는 달을 알려주며** 거부한다", async () => {
    // "참가 시작월 이후를 확인하라"는 안내는 도움이 안 됐다 — 시작월 뒤인데도 행이 없는
    // 경우가 실제로 있어(dev 실측), 사용자가 이미 맞는 달을 넣고도 같은 말을 듣는다.
    await expect(getMyMileage(db.asClient(), ctxOf(), { month: "2019-01" })).rejects.toThrow(
      new RegExp(`목표가 있는 달: ${MONTH_START.slice(0, 7)}`),
    );
  });

  it("목표 행이 하나도 없으면 운영진 문의로 안내한다", async () => {
    const d = seed({ evt_mlg_mth_snap: [] });
    await expect(getMyMileage(d.asClient(), ctxOf())).rejects.toThrow(/운영진에게 문의/);
  });

  it("month 형식이 틀리면 무엇이 잘못됐는지 알려준다", async () => {
    await expect(
      getMyMileage(db.asClient(), ctxOf(), { month: "2026/08" }),
    ).rejects.toThrow(/YYYY-MM/);
  });

  it("from 이 to 보다 늦으면 거부한다", async () => {
    await expect(
      listMyActivities(db.asClient(), ctxOf(), { from: "2026-08-10", to: "2026-08-01" }),
    ).rejects.toThrow(/from 이 to 보다 늦습니다/);
  });

  it("아무것도 안 주면 이번 달 구간으로 본다", async () => {
    const { range } = await listMyActivities(db.asClient(), ctxOf());
    expect(range.from).toBe(MONTH_START);
    expect(range.to.startsWith(MONTH_START.slice(0, 7))).toBe(true);
  });

  it("active_only 는 오늘 걸려 있는 배율만 남긴다", async () => {
    const d = seed({
      evt_mlg_mult_cfg: [
        {
          mult_id: MULT_ID,
          evt_id: EVT_ID,
          mult_nm: "지금",
          mult_val: 2,
          stt_dt: null,
          end_dt: null,
          active_yn: true,
        },
        {
          mult_id: "77777777-7777-4777-8777-777777777778",
          evt_id: EVT_ID,
          mult_nm: "끝난 것",
          mult_val: 3,
          stt_dt: "2020-01-01",
          end_dt: "2020-01-31",
          active_yn: true,
        },
      ],
    });

    const all = await listMileageMultipliers(d.asClient(), ctxOf());
    expect(all.multipliers).toHaveLength(2);

    const now = await listMileageMultipliers(d.asClient(), ctxOf(), { active_only: true });
    expect(now.multipliers.map((m) => m.mult_nm)).toEqual(["지금"]);
  });
});
