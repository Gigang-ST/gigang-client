import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OperatorContext } from "@/lib/mcp/auth";
import { ToolDeniedError, ToolInputError } from "@/lib/mcp/queries";
import type { Database } from "@/lib/supabase/database.types";

/**
 * #485 create_gathering 검증.
 *
 * ⚠️ 실제 크루원에게 알림 발송 금지 — `insertNotiMany` 는 vi.mock 으로 완전 대체한다.
 *   create-gathering.ts 는 이 함수를 정적 import 하고, 그 체인 끝에 "server-only" 가 있어
 *   mock 없이는 vitest 로딩부터 실패한다([[troubleshooting/vitest-server-only-trap]]).
 */
const { insertNotiManyMock } = vi.hoisted(() => ({
  insertNotiManyMock: vi.fn(async (input: { memIds: string[] }) => ({
    inAppOk: true,
    notifiedMemIds: input.memIds,
  })),
}));
vi.mock("@/lib/notifications/insert-noti", () => ({
  insertNotiMany: insertNotiManyMock,
}));

import { createGatheringViaMcp } from "@/lib/mcp/create-gathering";

const TEAM_ID = "22222222-2222-4222-8222-222222222222";
const ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const GTHR_ID = "33333333-3333-4333-8333-333333333333";
const M1 = "aaaaaaaa-0000-4000-8000-000000000001";
const M2 = "aaaaaaaa-0000-4000-8000-000000000002";

function ctxOf(overrides: Partial<OperatorContext> = {}): OperatorContext {
  return {
    mem_id: ACTOR_ID,
    team_id: TEAM_ID,
    is_admin: true,
    mem_nm: "관리자",
    ...overrides,
  };
}

/** 유효한 최소 입력. 개별 테스트가 필요한 필드만 덮어쓴다. */
function validInput(overrides: Record<string, unknown> = {}) {
  return {
    gthr_nm: "토요일 한강 정기런",
    gthr_type_enm: "regular",
    sprt_cd: "running",
    stt_at: "2026-08-29 07:00",
    ...overrides,
  } as Parameters<typeof createGatheringViaMcp>[2];
}

/** 테이블별 최소 Supabase 스텁 — 어떤 행이 어떤 테이블에 들어갔는지 관측한다. */
function makeSupabase(opts: { insertErr?: unknown; teamMembers?: string[] } = {}) {
  const calls: {
    gthrInsert: Record<string, unknown> | null;
    attdInsert: Record<string, unknown> | null;
    auditInsert: Record<string, unknown> | null;
  } = { gthrInsert: null, attdInsert: null, auditInsert: null };

  const gthrBuilder: Record<string, unknown> = {
    insert: (row: Record<string, unknown>) => {
      calls.gthrInsert = row;
      return gthrBuilder;
    },
    select: () => gthrBuilder,
    single: async () =>
      opts.insertErr
        ? { data: null, error: opts.insertErr }
        : { data: { gthr_id: GTHR_ID, short_id: "gg7f2k" }, error: null },
  };

  const attdBuilder: Record<string, unknown> = {
    insert: (row: Record<string, unknown>) => {
      calls.attdInsert = row;
      return attdBuilder;
    },
    then: (resolve: (v: unknown) => void) => resolve({ error: null }),
  };

  const teamMemBuilder: Record<string, unknown> = {
    select: () => teamMemBuilder,
    eq: () => teamMemBuilder,
    neq: () => teamMemBuilder,
    then: (resolve: (v: unknown) => void) =>
      resolve({
        data: (opts.teamMembers ?? [M1, M2]).map((mem_id) => ({ mem_id })),
        error: null,
      }),
  };

  const auditBuilder: Record<string, unknown> = {
    insert: (row: Record<string, unknown>) => {
      calls.auditInsert = row;
      return auditBuilder;
    },
    then: (resolve: (v: unknown) => void) => resolve({ error: null }),
  };

  const byTable: Record<string, Record<string, unknown>> = {
    gthr_mst: gthrBuilder,
    gthr_attd_rel: attdBuilder,
    team_mem_rel: teamMemBuilder,
    mcp_audit_log: auditBuilder,
  };

  const client = {
    from: (table: string) => byTable[table],
  } as unknown as SupabaseClient<Database>;

  return { client, calls };
}

/** 어떤 테이블에 손대도 실패하는 스텁 — 거부·검증이 쓰기 '이전'인지 확인한다. */
function makeForbiddenSupabase() {
  const touched: string[] = [];
  const client = {
    from: (table: string) => {
      touched.push(table);
      throw new Error(`쓰기가 실행되면 안 됩니다: ${table}`);
    },
  } as unknown as SupabaseClient<Database>;
  return { client, touched };
}

beforeEach(() => {
  insertNotiManyMock.mockClear();
});

describe("create_gathering — admin 게이트(send_push 와 같은 급)", () => {
  it("비-admin 은 거부되고 아무것도 만들지 않는다", async () => {
    const { client, touched } = makeForbiddenSupabase();

    await expect(
      createGatheringViaMcp(client, ctxOf({ is_admin: false }), validInput()),
    ).rejects.toBeInstanceOf(ToolDeniedError);

    expect(touched).toEqual([]);
    expect(insertNotiManyMock).not.toHaveBeenCalled();
  });
});

describe("create_gathering — 일시는 KST 벽시계만 받는다(9시간 밀림 차단)", () => {
  it("KST 문자열을 UTC 로 정확히 변환해 저장한다(07:00 KST = 22:00Z 전날)", async () => {
    const { client, calls } = makeSupabase();

    const result = await createGatheringViaMcp(
      client,
      ctxOf(),
      validInput({ stt_at: "2026-08-29 07:00", end_at: "2026-08-29 09:00" }),
    );

    expect(calls.gthrInsert?.stt_at).toBe("2026-08-28T22:00:00.000Z");
    expect(calls.gthrInsert?.end_at).toBe("2026-08-29T00:00:00.000Z");
    // 응답은 저장된 값을 KST 로 되읽어 준다 — 사람이 날짜 오파싱을 눈으로 잡는 자리.
    expect(result.stt_at_kst).toContain("2026-08-29");
    expect(result.stt_at_kst).toContain("07:00");
  });

  it("'T' 구분자·초 표기도 같은 값으로 받는다", async () => {
    const { client, calls } = makeSupabase();
    await createGatheringViaMcp(
      client,
      ctxOf(),
      validInput({ stt_at: "2026-08-29T07:00:00" }),
    );
    expect(calls.gthrInsert?.stt_at).toBe("2026-08-28T22:00:00.000Z");
  });

  it("범위를 벗어난 날짜·시각을 거부한다 — dayjs 는 굴려서 딴 날로 만든다", async () => {
    // E2E(2026-08-21)에서 실제로 통과했던 값들. `isValid()` 는 전부 true 라 못 잡는다.
    //   2026-13-05 → 2027-01-05 · 2026-02-31 → 2026-03-03 · 25:99 → 다음 날 02:39
    // 월을 잘못 적은 벙이 에러 없이 딴 달에 서는 것이라, 오프셋 표기를 막은 것과 같은 사고다.
    for (const bad of [
      "2026-13-05 07:00",
      "2026-13-45 07:00",
      "2026-02-31 07:00",
      "2026-09-05 25:99",
      "2026-00-10 07:00",
    ]) {
      const { client, touched } = makeForbiddenSupabase();
      await expect(
        createGatheringViaMcp(client, ctxOf(), validInput({ stt_at: bad })),
      ).rejects.toBeInstanceOf(ToolInputError);
      expect(touched).toEqual([]);
    }
  });

  it("거부 메시지가 '무엇으로 해석됐는지'를 알려준다(오타를 눈으로 잡게)", async () => {
    const { client } = makeForbiddenSupabase();
    await expect(
      createGatheringViaMcp(client, ctxOf(), validInput({ stt_at: "2026-13-05 07:00" })),
    ).rejects.toThrow(/2027-01-05/);
  });

  it("경계값(윤년 2/29·23:59·12/31)은 통과한다 — 되찍기 대조가 정상값을 막지 않게", async () => {
    for (const good of ["2028-02-29 07:00", "2026-12-31 23:59", "2026-09-05 00:00"]) {
      const { client } = makeSupabase();
      const r = await createGatheringViaMcp(
        client,
        ctxOf(),
        validInput({ stt_at: good, dry_run: true }),
      );
      expect(r.stt_at_kst).toContain(good.slice(0, 10));
    }
  });

  it("시간대 표기(Z·+09:00)가 붙으면 거부한다 — 통과시키면 9시간이 조용히 밀린다", async () => {
    for (const bad of [
      "2026-08-29T07:00:00Z",
      "2026-08-29T07:00:00+09:00",
      "2026-08-29",
      "8월 29일 오전 7시",
    ]) {
      const { client, touched } = makeForbiddenSupabase();
      await expect(
        createGatheringViaMcp(client, ctxOf(), validInput({ stt_at: bad })),
      ).rejects.toBeInstanceOf(ToolInputError);
      expect(touched).toEqual([]);
    }
  });
});

describe("create_gathering — 종료가 시작보다 앞선 모임을 만들지 않는다(#495 방어)", () => {
  it("end_at <= stt_at 이면 거부하고 쓰지 않는다", async () => {
    for (const end of ["2026-08-29 06:00", "2026-08-29 07:00", "2025-08-29 09:00"]) {
      const { client, touched } = makeForbiddenSupabase();
      await expect(
        createGatheringViaMcp(client, ctxOf(), validInput({ end_at: end })),
      ).rejects.toBeInstanceOf(ToolInputError);
      // 이 행은 달력 뷰에서 사라지면서 신청은 계속 받는다 — 애초에 만들지 않는다.
      expect(touched).toEqual([]);
    }
  });
});

describe("create_gathering — dry_run 은 검증만 한다", () => {
  it("아무 테이블에도 쓰지 않고 알림도 보내지 않는다", async () => {
    const { client, touched } = makeForbiddenSupabase();

    const result = await createGatheringViaMcp(
      client,
      ctxOf(),
      validInput({ dry_run: true, end_at: "2026-08-29 09:00", loc_txt: "잠수교" }),
    );

    expect(touched).toEqual([]);
    expect(insertNotiManyMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      dry_run: true,
      gthr_id: null,
      gthr_url: null,
      notified_cnt: 0,
      loc_txt: "잠수교",
    });
    // 해석된 일시는 그대로 돌려줘야 사람이 확인할 수 있다.
    expect(result.stt_at_kst).toContain("07:00");
    expect(result.end_at_kst).toContain("09:00");
  });

  it("dry_run 이어도 검증은 똑같이 돈다(형식 오류는 여기서 잡힌다)", async () => {
    const { client } = makeForbiddenSupabase();
    await expect(
      createGatheringViaMcp(
        client,
        ctxOf(),
        validInput({ dry_run: true, stt_at: "내일 아침" }),
      ),
    ).rejects.toBeInstanceOf(ToolInputError);
  });
});

describe("create_gathering — 저장·자동참석·알림·감사", () => {
  it("team_id·작성자는 토큰 컨텍스트에서 채우고 입력으로 받지 않는다", async () => {
    const { client, calls } = makeSupabase();
    await createGatheringViaMcp(client, ctxOf(), validInput());

    expect(calls.gthrInsert?.team_id).toBe(TEAM_ID);
    expect(calls.gthrInsert?.crt_by).toBe(ACTOR_ID);
    expect(calls.gthrInsert?.del_yn).toBe(false);
  });

  it("작성자를 자동 참석시킨다(앱에서 만든 벙과 같게)", async () => {
    const { client, calls } = makeSupabase();
    await createGatheringViaMcp(client, ctxOf(), validInput());

    expect(calls.attdInsert).toEqual({ gthr_id: GTHR_ID, mem_id: ACTOR_ID });
  });

  it("작성자를 뺀 팀 전원에게 gthr_new 알림을 보내고 실제 발송 인원을 응답에 싣는다", async () => {
    const { client } = makeSupabase({ teamMembers: [M1, M2] });
    const result = await createGatheringViaMcp(client, ctxOf(), validInput());

    expect(insertNotiManyMock).toHaveBeenCalledTimes(1);
    const arg = insertNotiManyMock.mock.calls[0][0] as {
      teamId: string;
      memIds: string[];
      notiTypeEnm: string;
      refId: string;
      refTypeEnm: string;
    };
    expect(arg.teamId).toBe(TEAM_ID);
    expect(arg.memIds).toEqual([M1, M2]);
    expect(arg.notiTypeEnm).toBe("gthr_new");
    expect(arg.refId).toBe(GTHR_ID);
    expect(arg.refTypeEnm).toBe("gathering");
    expect(result.notified_cnt).toBe(2);
  });

  it("감사행을 남기고 상세 URL 을 돌려준다", async () => {
    const { client, calls } = makeSupabase();
    const result = await createGatheringViaMcp(
      client,
      ctxOf(),
      validInput(),
      "https://gigang.team",
    );

    expect(calls.auditInsert?.tool_nm).toBe("create_gathering");
    expect(calls.auditInsert?.actor_mem_id).toBe(ACTOR_ID);
    expect(calls.auditInsert?.team_id).toBe(TEAM_ID);
    expect(result.audit_id).toBe(calls.auditInsert?.audit_id);
    expect(result.gthr_url).toBe(`https://gigang.team/gatherings/${GTHR_ID}`);
    expect(result.short_id).toBe("gg7f2k");
  });

  it("baseUrl 을 못 구하면 상대 경로로 물러난다(URL 때문에 개설을 실패시키지 않는다)", async () => {
    const { client } = makeSupabase();
    const result = await createGatheringViaMcp(client, ctxOf(), validInput(), null);
    expect(result.gthr_url).toBe(`/gatherings/${GTHR_ID}`);
  });

  it("알림 조회가 터져도 벙 개설은 성립한다(알림은 부수효과)", async () => {
    const { client, calls } = makeSupabase();
    insertNotiManyMock.mockRejectedValueOnce(new Error("noti down"));

    const result = await createGatheringViaMcp(client, ctxOf(), validInput());

    expect(result.gthr_id).toBe(GTHR_ID);
    expect(result.notified_cnt).toBe(0);
    expect(calls.auditInsert).not.toBeNull();
  });
});

describe("create_gathering — 앱 폼과 같은 스키마로 검증한다", () => {
  it("제목 100자 초과·미지원 종목·유형은 안전 에러로 되돌린다", async () => {
    const cases = [
      { gthr_nm: "가".repeat(101) },
      { sprt_cd: "yoga" },
      { gthr_type_enm: "party" },
      { gthr_nm: "" },
    ];
    for (const bad of cases) {
      const { client, touched } = makeForbiddenSupabase();
      await expect(
        createGatheringViaMcp(client, ctxOf(), validInput(bad)),
      ).rejects.toBeInstanceOf(ToolInputError);
      expect(touched).toEqual([]);
    }
  });

  it("거부 메시지에 내부 정보(team_id·SQL)를 흘리지 않는다(§7)", async () => {
    const { client } = makeForbiddenSupabase();
    await expect(
      createGatheringViaMcp(client, ctxOf(), validInput({ sprt_cd: "yoga" })),
    ).rejects.not.toThrow(new RegExp(TEAM_ID));
  });
});
