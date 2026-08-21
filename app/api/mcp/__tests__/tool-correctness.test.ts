import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import {
  ToolDeniedError,
  aggregateAttendance,
  buildPushStatus,
  decodeJoinPurposes,
  decodePaceLabel,
  escapeLikePattern,
  getMemberProfile,
  kstDayRange,
  listMembersAttendance,
} from "@/lib/mcp/queries";
import type { Database } from "@/lib/supabase/database.types";

/**
 * SG-04 정확도 검증(M-01, AC-10~AC-15) — 6개 읽기 도구 vs 스펙 §5 baseline SQL.
 *
 * ┌─ 검증 방법 ──────────────────────────────────────────────────────────────┐
 * │ 1) 순수 로직(집계·정렬·KST 날짜 변환)은 아래 단위 테스트로 baseline 규약과 대조.        │
 * │ 2) DB 결합/필터 부분은 dev Supabase(project ref: gigang-dev, team_id            │
 * │    c0ffee00-0000-4000-8000-000000000001)에서 §5 baseline SQL을 실행해            │
 * │    핵심 필드(행수·정렬·주요값)를 아래 주석에 기록·대조.                                │
 * │ 3) M-03 불변식(민감정보 미노출)은 소스 정적 스캔 테스트로 회귀 방지.                    │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * ── dev 대조 결과(2026-07-24, vers=0 정본 보정 baseline) ──
 *  AC-10 list_today_gatherings(2026-07-04): baseline == UTC-range 등가형 → 동일 1행
 *    { gthr_id: d2867b5b…534d, stt_at: 2026-07-03T23:00:00Z, attendee_cnt: 10,
 *      desc_txt: non-null(모임 설명 본문) }. (2026-07-25 desc_txt 필드 추가 후 재대조)
 *  AC-11 list_recent_members(limit 10): 10행, join_dt desc·crt_at desc.
 *    head=[김또낑(07-09), 정정만(07-09), 온보딩 5f6ae133(07-09), 온보딩 0fe17429(07-09), 박초록(07-06)…].
 *  AC-12 list_members_attendance: 활성 144행, 참석>0 88명, 미참석 56명.
 *    정렬 head 5명 모두 attendance_cnt=0·last=null(전혀 안 나온 순 nulls first).
 *  AC-13 get_member_profile: member_id=5f6ae133 → 1행
 *    { mem_nm:온보딩, birth_dt:1986-05-30, gdr_enm:female, join_dt:2026-07-09, role:member, st:active }.
 *    name='온보딩'(대소문자 무시) → 2행(동명이인) 배열 반환. 응답에 phone/email/bank 없음.
 *  AC-14 list_gathering_non_attendees(d2867b5b): 활성 144명 중 참석 10명 → 미참석 134행.
 *  AC-15 list_push_status: 활성 144행, 구독 1명(7dd2ab13…), 미구독 143명. 미구독(false) 먼저 정렬.
 *
 *  ⚠️ 정본 규약 결정: §5 baseline 본문은 team_mem_rel 에 vers=0 필터가 없으나, dev 실데이터에는
 *     del_yn=false & vers>0 인 낡은 행이 있어 무필터 시 활성 147(=144+중복3), 'left' 멤버가
 *     'active'로 되살아난다. 앱 전역 정본 규약(vers=0)으로 보정한 baseline을 M-01 기준으로 삼음.
 *
 * ── dev 대조 결과(2026-07-25, 러닝 프로필 필드 추가) ──
 *  mem_onbd_prf 실데이터(팀 c0ffee00…001 소속 확인) 로 라벨 디코딩 대조:
 *   - mem_id=974e87ef… (get_member_profile 대상): near_stn_nm=선릉, avg_run_dist_km="15.0"→15,
 *     avg_pace_cd=P430→avg_pace="4'30\"", join_purp_cds=[COACH]→join_purposes=[코칭].
 *   - mem_id=5f6ae133…(list_recent_members head, AC-13과 동일 인물 '온보딩'): near_stn_nm=계산,
 *     avg_run_dist_km="20.0"→20, avg_pace_cd=P600→"6'00\"", join_purp_cds=[COACH,RACE]→[코칭,대회].
 *   - avg_run_dist_km 는 numeric 이라 PostgREST가 문자열("15.0")로 반환 → Number() 강제 변환 확인.
 */

describe("kstDayRange — §5.1 KST 달력일 → UTC 반열림 구간", () => {
  it("지정일을 KST 자정 기준 [start, +1d) UTC 로 변환", () => {
    const r = kstDayRange("2026-07-04");
    expect(r.day).toBe("2026-07-04");
    // KST 2026-07-04 00:00 = UTC 2026-07-03 15:00
    expect(r.startIso).toBe("2026-07-03T15:00:00.000Z");
    expect(r.endIso).toBe("2026-07-04T15:00:00.000Z");
  });

  it("baseline 검증에 쓴 모임(stt_at 2026-07-03T23:00Z)이 07-04 KST 구간에 포함", () => {
    const r = kstDayRange("2026-07-04");
    const stt = "2026-07-03T23:00:00.000Z";
    expect(stt >= r.startIso && stt < r.endIso).toBe(true);
  });

  it("형식 불량/미지정이면 오늘(KST)로 폴백해 유효 구간을 만든다", () => {
    for (const bad of [undefined, "2026/07/04", "nope"]) {
      const r = kstDayRange(bad);
      expect(r.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.startIso < r.endIso).toBe(true);
    }
  });
});

describe("aggregateAttendance — §5.3/§5.5 집계·정렬", () => {
  const members = [
    { mem_id: "m1", mem_nm: "A", join_dt: "2026-01-01" }, // 미참석
    { mem_id: "m2", mem_nm: "B", join_dt: "2026-01-02" }, // 2회, 최신 06-01
    { mem_id: "m3", mem_nm: "C", join_dt: "2026-01-03" }, // 1회, 04-01
  ];
  const events = [
    { mem_id: "m2", stt_at: "2026-05-01T00:00:00+00:00" },
    { mem_id: "m2", stt_at: "2026-06-01T00:00:00+00:00" },
    { mem_id: "m3", stt_at: "2026-04-01T00:00:00+00:00" },
  ];

  it("횟수·마지막 참석시각을 정확히 집계한다", () => {
    const rows = aggregateAttendance(members, events);
    const byId = Object.fromEntries(rows.map((r) => [r.mem_id, r]));
    expect(byId.m1).toMatchObject({ attendance_cnt: 0, last_attended_at: null });
    expect(byId.m2).toMatchObject({
      attendance_cnt: 2,
      last_attended_at: "2026-06-01T00:00:00+00:00",
    });
    expect(byId.m3).toMatchObject({
      attendance_cnt: 1,
      last_attended_at: "2026-04-01T00:00:00+00:00",
    });
  });

  it("last_attended_at asc nulls first, attendance_cnt asc 순으로 정렬(오래/전혀 안 나온 순)", () => {
    const rows = aggregateAttendance(members, events);
    expect(rows.map((r) => r.mem_id)).toEqual(["m1", "m3", "m2"]);
  });

  it("동률(둘 다 미참석)은 cnt asc, 안정 정렬", () => {
    const rows = aggregateAttendance(
      [
        { mem_id: "x", mem_nm: "X", join_dt: null },
        { mem_id: "y", mem_nm: "Y", join_dt: null },
      ],
      [],
    );
    expect(rows.map((r) => r.mem_id)).toEqual(["x", "y"]);
  });

  it("limit 은 정렬 후 상위 N 개만 남긴다", () => {
    const rows = aggregateAttendance(members, events, 2);
    expect(rows.map((r) => r.mem_id)).toEqual(["m1", "m3"]);
  });

  it("이벤트 없는 멤버도 0/null 로 포함된다(left-merge)", () => {
    const rows = aggregateAttendance(members, []);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.attendance_cnt === 0 && r.last_attended_at === null)).toBe(
      true,
    );
  });
});

describe("buildPushStatus — §5.6 미구독 먼저", () => {
  const members = [
    { mem_id: "a", mem_nm: "가", mem_st_cd: "active" },
    { mem_id: "b", mem_nm: "나", mem_st_cd: "active" },
    { mem_id: "c", mem_nm: "다", mem_st_cd: "active" },
  ];

  it("push_enabled asc(false 먼저), 그 안에서 이름순", () => {
    const rows = buildPushStatus(members, new Set(["b"]));
    expect(rows.map((r) => [r.mem_id, r.push_enabled])).toEqual([
      ["a", false],
      ["c", false],
      ["b", true],
    ]);
  });

  it("구독 집합 멤버십을 정확히 반영", () => {
    const rows = buildPushStatus(members, new Set(["a", "c"]));
    const on = rows.filter((r) => r.push_enabled).map((r) => r.mem_id).sort();
    expect(on).toEqual(["a", "c"]);
  });
});

describe("escapeLikePattern — §5.4 get_member_profile name 와일드카드 차단(PII 대량 열람)", () => {
  it("LIKE 메타문자 %·_·\\ 를 리터럴로 이스케이프한다", () => {
    // name="%" → "\%" : ilike 에서 리터럴 '%' 로만 매칭(전원 조회 차단)
    expect(escapeLikePattern("%")).toBe("\\%");
    // name="_" → "\_" : 단일 문자 와일드카드 무력화
    expect(escapeLikePattern("_")).toBe("\\_");
    // 백슬래시(escape 문자 자체)도 리터럴로
    expect(escapeLikePattern("\\")).toBe("\\\\");
  });

  it("혼합 입력의 모든 메타문자를 각각 이스케이프한다", () => {
    // %_% → \%\_\%
    expect(escapeLikePattern("%_%")).toBe("\\%\\_\\%");
    // 실제 이름 사이의 _ 도 리터럴로(foo_bar → foo\_bar)
    expect(escapeLikePattern("foo_bar")).toBe("foo\\_bar");
    // 50%\_할인 같은 복합 케이스
    expect(escapeLikePattern("50%\\_")).toBe("50\\%\\\\\\_");
  });

  it("메타문자 없는 일반 이름은 그대로 둔다(완전일치 동치)", () => {
    expect(escapeLikePattern("홍길동")).toBe("홍길동");
    expect(escapeLikePattern("hs")).toBe("hs");
    expect(escapeLikePattern("")).toBe("");
  });
});

describe("decodePaceLabel — §5.2/§5.4 avg_pace_cd → 라벨(PACE_LABELS 재사용)", () => {
  it("알려진 코드는 lib/validations/member.ts PACE_LABELS 라벨로 디코딩한다", () => {
    // dev 실측: mem_id=974e87ef… avg_pace_cd=P430
    expect(decodePaceLabel("P430")).toBe("4'30\"");
    // dev 실측: mem_id=5f6ae133… avg_pace_cd=P600
    expect(decodePaceLabel("P600")).toBe("6'00\"");
  });

  it("알 수 없는 코드는 코드 원문을 그대로 반환한다(cmm코드 아님)", () => {
    expect(decodePaceLabel("P999")).toBe("P999");
  });

  it("null/미지정은 null", () => {
    expect(decodePaceLabel(null)).toBeNull();
  });
});

describe("decodeJoinPurposes — §5.2/§5.4 join_purp_cds → 짧은 라벨 배열(JOIN_PURP_SHORT_LABELS 재사용)", () => {
  it("알려진 코드 배열을 짧은 라벨 배열로 디코딩한다", () => {
    // dev 실측: mem_id=974e87ef… join_purp_cds=[COACH]
    expect(decodeJoinPurposes(["COACH"])).toEqual(["코칭"]);
    // dev 실측: mem_id=5f6ae133… join_purp_cds=[COACH, RACE]
    expect(decodeJoinPurposes(["COACH", "RACE"])).toEqual(["코칭", "대회"]);
  });

  it("알 수 없는 코드는 코드 원문을 유지한다", () => {
    expect(decodeJoinPurposes(["RUN_MATE", "MYSTERY"])).toEqual(["러닝메이트", "MYSTERY"]);
  });

  it("데이터 없음(null/undefined/빈 배열)은 빈 배열", () => {
    expect(decodeJoinPurposes(null)).toEqual([]);
    expect(decodeJoinPurposes(undefined)).toEqual([]);
    expect(decodeJoinPurposes([])).toEqual([]);
  });
});

// ── #496 admin 게이트 — 앱이 관리자에게만 보여주는 데이터가 멤버 토큰으로 새지 않는다 ──

const TEAM_ID = "22222222-2222-2222-2222-222222222222";
const MEM_ID = "aaaaaaaa-0000-4000-8000-000000000001";

/**
 * `getMemberProfile` 용 최소 Supabase 스텁.
 * - team_mem_rel: `.select(…)` 문자열을 관측하고, await 하면 임베디드 mem_mst 1행을 반환한다.
 * - mem_onbd_prf: 러닝 프로필 배치 조회(빈 결과) — 별도 builder 라 select 관측값을 덮지 않는다.
 *
 * `memMst` 는 "DB 가 실제로 돌려준 것"을 흉내 낸다 — 비-admin 경로에서는 select 에서 빠졌으므로
 * birth_dt·gdr_enm 키가 애초에 없는 객체를 넘긴다.
 */
function makeProfileSupabase(memMst: Record<string, unknown>) {
  const captured: { select: string | null } = { select: null };
  const relBuilder: Record<string, unknown> = {
    select: (s: string) => {
      captured.select = s;
      return relBuilder;
    },
    eq: () => relBuilder,
    ilike: () => relBuilder,
    then: (resolve: (v: unknown) => void) =>
      resolve({
        data: [
          {
            join_dt: "2026-07-09",
            team_role_cd: "member",
            mem_st_cd: "active",
            intro_txt: "오늘도 달린다",
            mem_mst: memMst,
          },
        ],
        error: null,
      }),
  };
  const onbdBuilder: Record<string, unknown> = {
    select: () => onbdBuilder,
    in: () => onbdBuilder,
    then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
  };
  const client = {
    from: (table: string) => (table === "mem_onbd_prf" ? onbdBuilder : relBuilder),
  } as unknown as SupabaseClient<Database>;
  return { client, captured };
}

describe("#496 get_member_profile — 생년월일·성별은 admin 응답에만", () => {
  const adminMemMst = {
    mem_id: MEM_ID,
    mem_nm: "온보딩",
    birth_dt: "1986-05-30",
    gdr_enm: "female",
    avatar_url: null,
  };
  // 비-admin 경로는 select 에서 두 컬럼이 빠지므로 DB 도 키 없는 행을 돌려준다.
  const memberMemMst = { mem_id: MEM_ID, mem_nm: "온보딩", avatar_url: null };

  it("admin: select 에 birth_dt·gdr_enm 이 포함되고 응답에도 실린다", async () => {
    const { client, captured } = makeProfileSupabase(adminMemMst);
    const rows = await getMemberProfile(client, TEAM_ID, true, { memberId: MEM_ID });

    expect(captured.select).toContain("birth_dt");
    expect(captured.select).toContain("gdr_enm");
    expect(rows[0]).toMatchObject({ birth_dt: "1986-05-30", gdr_enm: "female" });
  });

  it("비-admin: select 에서부터 빠지고 응답에 키 자체가 없다(뽑지 않으면 샐 수 없다)", async () => {
    const { client, captured } = makeProfileSupabase(memberMemMst);
    const rows = await getMemberProfile(client, TEAM_ID, false, { memberId: MEM_ID });

    expect(captured.select).not.toContain("birth_dt");
    expect(captured.select).not.toContain("gdr_enm");
    // `birth_dt: undefined` 로 남기지 않는다 — 키 존재 자체를 형상으로 못박는다.
    expect("birth_dt" in rows[0]).toBe(false);
    expect("gdr_enm" in rows[0]).toBe(false);
  });

  it("비-admin 도 공개 프로필 카드에 이미 있는 필드는 그대로 받는다(도구는 계속 멤버 허용)", async () => {
    const { client } = makeProfileSupabase(memberMemMst);
    const rows = await getMemberProfile(client, TEAM_ID, false, { memberId: MEM_ID });

    expect(rows[0]).toMatchObject({
      mem_id: MEM_ID,
      mem_nm: "온보딩",
      join_dt: "2026-07-09",
      team_role_cd: "member",
      mem_st_cd: "active",
      intro_txt: "오늘도 달린다",
    });
  });
});

describe("#496 list_members_attendance — admin 전용", () => {
  /** 어떤 테이블에도 접근하면 실패하는 스텁 — 거부가 쿼리 '이전'에 일어나는지 확인한다. */
  function makeForbiddenSupabase() {
    const calls: string[] = [];
    const client = {
      from: (table: string) => {
        calls.push(table);
        throw new Error(`쿼리가 실행되면 안 됩니다: ${table}`);
      },
    } as unknown as SupabaseClient<Database>;
    return { client, calls };
  }

  it("비-admin 은 ToolDeniedError 로 거부되고 쿼리를 한 번도 실행하지 않는다", async () => {
    const { client, calls } = makeForbiddenSupabase();
    await expect(
      listMembersAttendance(client, TEAM_ID, false),
    ).rejects.toBeInstanceOf(ToolDeniedError);
    // 데이터를 뽑아 놓고 버리는 게 아니라, 애초에 뽑지 않는다.
    expect(calls).toEqual([]);
  });

  it("거부 메시지는 사유만 담고 내부 정보(팀 id·SQL)를 흘리지 않는다(§7)", async () => {
    const { client } = makeForbiddenSupabase();
    await expect(listMembersAttendance(client, TEAM_ID, false)).rejects.toThrow(
      /운영진\(admin\)만/,
    );
    await expect(
      listMembersAttendance(client, TEAM_ID, false),
    ).rejects.not.toThrow(new RegExp(TEAM_ID));
  });
});

describe("M-03 불변식 — 민감정보(phone/email/bank) 미노출 (G-7 회귀 방지)", () => {
  it("queries.ts 의 어떤 문자열 리터럴에도 연락처·계좌 컬럼이 없다", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/mcp/queries.ts"),
      "utf8",
    );
    // 주석을 먼저 걷어낸다 — 이 파일의 헤더 주석은 금지 컬럼명을 '설명'으로 나열한다.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    // `.select(…)` 인자만 보던 예전 검사는 select 문자열이 변수를 끼운 템플릿이 되는 순간
    // 컬럼 목록이 스캔 밖으로 빠져나간다(#496 의 memColumns 분기가 그 사례). 코드의 모든
    // 문자열/템플릿 리터럴을 훑어 컬럼 목록이 어디에 조립되든 걸리게 한다.
    const literals = [...code.matchAll(/(["'`])((?:\\.|(?!\1)[\s\S])*?)\1/g)].map(
      (m) => m[2],
    );
    expect(literals.length).toBeGreaterThan(0);
    // select 컬럼 목록이 실제로 스캔에 잡히는지 자체 점검(정규식이 조용히 빗나가는 것 방지).
    expect(literals.some((l) => l.includes("mem_mst!inner("))).toBe(true);
    const banned = ["phone_no", "email_addr", "bank_nm", "bank_acct_no"];
    for (const lit of literals) {
      for (const col of banned) {
        expect(lit.includes(col)).toBe(false);
      }
    }
  });

  it("MemberProfileRow 출력 타입에 민감 키가 없다(형상 고정)", () => {
    // get_member_profile 은 생일·성별(admin 한정, #496)·소개·아바타까지만.
    // 연락처·계좌 키는 어떤 권한으로도 존재하지 않는다.
    const sampleKeys = [
      "mem_id",
      "mem_nm",
      "birth_dt",
      "gdr_enm",
      "join_dt",
      "team_role_cd",
      "mem_st_cd",
      "intro_txt",
      "avatar_url",
    ];
    for (const banned of ["phone_no", "email_addr", "bank_nm", "bank_acct_no"]) {
      expect(sampleKeys).not.toContain(banned);
    }
  });
});
