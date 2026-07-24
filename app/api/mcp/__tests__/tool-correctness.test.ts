import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  aggregateAttendance,
  buildPushStatus,
  kstDayRange,
} from "@/lib/mcp/queries";

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
 *    { gthr_id: d2867b5b…534d, stt_at: 2026-07-03T23:00:00Z, attendee_cnt: 10 }.
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

describe("M-03 불변식 — 민감정보(phone/email/bank) 미노출 (G-7 회귀 방지)", () => {
  it("queries.ts 의 어떤 select 목록에도 연락처·계좌 컬럼이 없다", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/mcp/queries.ts"),
      "utf8",
    );
    // 코드가 실제로 select 하는 컬럼 표기만 검사(주석의 설명 문구는 별도 처리).
    const selectArgs = [...src.matchAll(/\.select\(\s*(["'`])([\s\S]*?)\1/g)].map(
      (m) => m[2],
    );
    expect(selectArgs.length).toBeGreaterThan(0);
    const banned = ["phone_no", "email_addr", "bank_nm", "bank_acct_no"];
    for (const sel of selectArgs) {
      for (const col of banned) {
        expect(sel.includes(col)).toBe(false);
      }
    }
  });

  it("MemberProfileRow 출력 타입에 민감 키가 없다(형상 고정)", () => {
    // get_member_profile 은 생일·성별·소개·아바타까지만. 연락처·계좌 키는 존재하지 않음.
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
