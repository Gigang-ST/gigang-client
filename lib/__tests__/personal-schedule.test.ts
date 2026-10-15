/**
 * 개인 일정 — 시각 변환(KST 벽시계 → timestamptz)과 입력 규칙.
 *
 * 개인 일정은 날짜(date)와 시각(time)을 KST 벽시계 값으로 따로 저장한다. 달력·리스트는 시각을
 * `evt_stt_at`(ISO)으로 읽으므로, 그 변환이 **실행 환경 타임존과 무관하게** KST로 해석돼야 한다.
 * 배포처(Vercel)가 UTC라 여기서 TZ 를 UTC 로 세운다 — 노트북(KST)에선 틀려도 통과해 버린다.
 *
 * ⚠️ `process.env.TZ` 직접 접근은 의도적이다(§lib/__tests__/kst-boundary.test.ts 머리말과 같은 이유).
 */
const ORIGINAL_TZ = process.env.TZ;
process.env.TZ = "UTC";

import { afterAll, describe, expect, it } from "vitest";

import { memSchRowToRace, memSchTimeToIso, raceTimeKST } from "@/lib/personal-schedule";
import { personalScheduleSchema } from "@/lib/validations/personal-schedule";

afterAll(() => {
  process.env.TZ = ORIGINAL_TZ;
});

describe("memSchTimeToIso", () => {
  it("시각을 KST로 해석한다 — KST 새벽은 UTC로 전날이다", () => {
    expect(memSchTimeToIso("2027-03-10", "07:30:00")).toBe("2027-03-09T22:30:00.000Z");
    expect(memSchTimeToIso("2027-03-10", "00:30")).toBe("2027-03-09T15:30:00.000Z");
  });

  it("시각이 없으면(종일) null", () => {
    expect(memSchTimeToIso("2027-03-10", null)).toBeNull();
  });

  it("되읽은 시각이 저장한 시각과 같다(수정 폼 프리필)", () => {
    expect(raceTimeKST(memSchTimeToIso("2027-03-10", "00:30:00"))).toBe("00:30");
    expect(raceTimeKST(null)).toBeNull();
  });
});

describe("memSchRowToRace", () => {
  it("KST 새벽 일정도 날짜가 하루 밀리지 않는다", () => {
    const race = memSchRowToRace({
      mem_sch_id: "id",
      mem_id: "me",
      sch_nm: "새벽",
      sch_dt: "2027-03-10",
      stt_tm: "05:00:00",
      end_tm: null,
      cont_txt: null,
    });
    expect(race.type).toBe("personal");
    expect(race.start_date).toBe("2027-03-10");
    expect(race.evt_end_at).toBeNull();
  });
});

describe("personalScheduleSchema", () => {
  const base = { sch_nm: "일정", sch_dt: "2027-03-10", stt_tm: null, end_tm: null, cont_txt: null };

  it("시각 없이 날짜만 있어도 된다(종일)", () => {
    expect(personalScheduleSchema.safeParse(base).success).toBe(true);
  });

  it("날짜가 비면 막는다 — 복제가 날짜를 비운 채 열린다", () => {
    const r = personalScheduleSchema.safeParse({ ...base, sch_dt: "" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual(["sch_dt"]);
  });

  it("종료 시각만 있으면 막는다", () => {
    const r = personalScheduleSchema.safeParse({ ...base, end_tm: "10:00" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual(["end_tm"]);
  });

  it("종료 시각이 시작과 같거나 앞서면 막는다(DB 제약과 같은 규칙)", () => {
    expect(personalScheduleSchema.safeParse({ ...base, stt_tm: "10:00", end_tm: "10:00" }).success).toBe(false);
    expect(personalScheduleSchema.safeParse({ ...base, stt_tm: "10:00", end_tm: "09:59" }).success).toBe(false);
    expect(personalScheduleSchema.safeParse({ ...base, stt_tm: "10:00", end_tm: "10:01" }).success).toBe(true);
  });

  it("DB가 돌려주는 HH:mm:ss 를 그대로 받는다", () => {
    expect(personalScheduleSchema.safeParse({ ...base, stt_tm: "07:30:00", end_tm: "08:30:00" }).success).toBe(true);
  });

  it("공백뿐인 제목은 막는다", () => {
    expect(personalScheduleSchema.safeParse({ ...base, sch_nm: "   " }).success).toBe(false);
  });
});
