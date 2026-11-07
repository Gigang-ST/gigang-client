import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OperatorContext } from "@/lib/mcp/auth";
import { ToolInputError } from "@/lib/mcp/queries";
import type { Database } from "@/lib/supabase/database.types";

/**
 * #630 create_sch_post 검증.
 *
 * ⚠️ 실제 크루원에게 알림 발송 금지 — `insertNotiMany` 는 vi.mock 으로 완전 대체한다.
 *   lib/sch-post.ts 가 이 함수를 정적 import 하고, 그 체인 끝에 "server-only" 가 있어
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

import { createSchPostViaMcp } from "@/lib/mcp/create-sch-post";

const TEAM_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_TEAM_ID = "99999999-9999-4999-8999-999999999999";
const ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const POST_ID = "44444444-4444-4444-8444-444444444444";
const M1 = "aaaaaaaa-0000-4000-8000-000000000001";
const M2 = "aaaaaaaa-0000-4000-8000-000000000002";

function ctxOf(overrides: Partial<OperatorContext> = {}): OperatorContext {
  return {
    mem_id: ACTOR_ID,
    team_id: TEAM_ID,
    is_admin: false,
    mem_nm: "크루원",
    ...overrides,
  };
}

/** 유효한 최소 입력. 개별 테스트가 필요한 필드만 덮어쓴다. */
function validInput(overrides: Record<string, unknown> = {}) {
  return {
    sch_nm: "서울마라톤 접수 오픈",
    post_type: "race_entry",
    evt_stt_at: "2026-11-20 10:00",
    ...overrides,
  } as Parameters<typeof createSchPostViaMcp>[2];
}

/** 테이블별 최소 Supabase 스텁 — 어떤 행이 어떤 테이블에 들어갔는지 관측한다. */
function makeSupabase(opts: { insertErr?: unknown; teamMembers?: string[] } = {}) {
  const calls: {
    postInsert: Record<string, unknown> | null;
    auditInsert: Record<string, unknown> | null;
    teamMemFilters: [string, unknown][];
  } = { postInsert: null, auditInsert: null, teamMemFilters: [] };

  const postBuilder: Record<string, unknown> = {
    insert: (row: Record<string, unknown>) => {
      calls.postInsert = row;
      return postBuilder;
    },
    select: () => postBuilder,
    single: async () =>
      opts.insertErr
        ? { data: null, error: opts.insertErr }
        : {
            data: {
              sch_post_id: POST_ID,
              short_id: "sp9k2x",
              crt_at: "2026-11-07T03:15:00.000Z",
            },
            error: null,
          },
  };

  const teamMemBuilder: Record<string, unknown> = {
    select: () => teamMemBuilder,
    eq: (col: string, val: unknown) => {
      calls.teamMemFilters.push([col, val]);
      return teamMemBuilder;
    },
    neq: (col: string, val: unknown) => {
      calls.teamMemFilters.push([`!${col}`, val]);
      return teamMemBuilder;
    },
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
    sch_post_mst: postBuilder,
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

describe("create_sch_post — 권한은 앱과 같다(활성 멤버, 팀은 토큰에서만)", () => {
  it("admin 이 아닌 멤버도 올릴 수 있다 — 앱에서 소식은 활성 멤버 누구나 쓴다", async () => {
    const { client, calls } = makeSupabase();
    const result = await createSchPostViaMcp(client, ctxOf({ is_admin: false }), validInput());

    expect(result.sch_post_id).toBe(POST_ID);
    expect(calls.postInsert).not.toBeNull();
  });

  it("입력에 다른 팀 team_id·crt_by 를 섞어도 토큰 컨텍스트로 덮어쓴다(앱보다 넓어지지 않게)", async () => {
    const { client, calls } = makeSupabase();
    await createSchPostViaMcp(
      client,
      ctxOf(),
      validInput({ team_id: OTHER_TEAM_ID, crt_by: M1 }),
    );

    expect(calls.postInsert?.team_id).toBe(TEAM_ID);
    expect(calls.postInsert?.crt_by).toBe(ACTOR_ID);
    expect(calls.postInsert?.del_yn).toBe(false);
    expect(calls.postInsert?.vers).toBe(0);
  });

  it("알림 대상도 토큰의 팀에서만 고르고 작성자는 뺀다", async () => {
    const { client, calls } = makeSupabase();
    await createSchPostViaMcp(client, ctxOf(), validInput({ team_id: OTHER_TEAM_ID }));

    expect(calls.teamMemFilters).toContainEqual(["team_id", TEAM_ID]);
    expect(calls.teamMemFilters).not.toContainEqual(["team_id", OTHER_TEAM_ID]);
    expect(calls.teamMemFilters).toContainEqual(["!mem_id", ACTOR_ID]);
  });
});

describe("create_sch_post — 일시는 KST 벽시계만 받는다(9시간 밀림 차단)", () => {
  it("KST 문자열을 UTC 로 정확히 변환해 저장한다(07:00 KST = 22:00Z 전날)", async () => {
    const { client, calls } = makeSupabase();

    const result = await createSchPostViaMcp(
      client,
      ctxOf(),
      validInput({ evt_stt_at: "2026-11-20 07:00", evt_end_at: "2026-11-27 18:00" }),
    );

    expect(calls.postInsert?.evt_stt_at).toBe("2026-11-19T22:00:00.000Z");
    expect(calls.postInsert?.evt_end_at).toBe("2026-11-27T09:00:00.000Z");
    expect(result.evt_stt_at_kst).toContain("2026-11-20");
    expect(result.evt_stt_at_kst).toContain("07:00");
    expect(result.evt_end_at_kst).toContain("2026-11-27");
    expect(result.evt_end_at_kst).toContain("18:00");
  });

  it("시간대 표기(Z·+09:00)·날짜만·자연어는 거부하고 아무것도 쓰지 않는다", async () => {
    for (const bad of [
      "2026-11-20T10:00:00Z",
      "2026-11-20T10:00:00+09:00",
      "2026-11-20",
      "11월 20일 오전 10시",
      "내일 아침",
    ]) {
      const { client, touched } = makeForbiddenSupabase();
      await expect(
        createSchPostViaMcp(client, ctxOf(), validInput({ evt_stt_at: bad })),
      ).rejects.toBeInstanceOf(ToolInputError);
      expect(touched).toEqual([]);
    }
  });

  it("종료 일시에도 같은 규칙이 걸린다", async () => {
    const { client, touched } = makeForbiddenSupabase();
    await expect(
      createSchPostViaMcp(client, ctxOf(), validInput({ evt_end_at: "2026-11-27T18:00:00Z" })),
    ).rejects.toBeInstanceOf(ToolInputError);
    expect(touched).toEqual([]);
  });

  it("범위를 벗어난 날짜·시각(굴러가는 값)을 거부한다", async () => {
    for (const bad of ["2026-13-05 10:00", "2026-02-31 10:00", "2026-11-20 25:99"]) {
      const { client, touched } = makeForbiddenSupabase();
      await expect(
        createSchPostViaMcp(client, ctxOf(), validInput({ evt_stt_at: bad })),
      ).rejects.toBeInstanceOf(ToolInputError);
      expect(touched).toEqual([]);
    }
  });
});

describe("create_sch_post — 종료가 시작보다 앞선 소식을 만들지 않는다", () => {
  it("evt_end_at < evt_stt_at 이면 거부하고 쓰지 않는다", async () => {
    for (const end of ["2026-11-20 09:59", "2025-11-20 10:00"]) {
      const { client, touched } = makeForbiddenSupabase();
      await expect(
        createSchPostViaMcp(client, ctxOf(), validInput({ evt_end_at: end })),
      ).rejects.toBeInstanceOf(ToolInputError);
      expect(touched).toEqual([]);
    }
  });

  it("시작과 같은 시각의 종료는 받는다(한 시점짜리 소식)", async () => {
    const { client, calls } = makeSupabase();
    await createSchPostViaMcp(client, ctxOf(), validInput({ evt_end_at: "2026-11-20 10:00" }));
    expect(calls.postInsert?.evt_end_at).toBe(calls.postInsert?.evt_stt_at);
  });
});

describe("create_sch_post — dry_run 은 검증만 한다", () => {
  it("아무 테이블에도 쓰지 않고 알림도 보내지 않으며 해석 결과를 돌려준다", async () => {
    const { client, touched } = makeForbiddenSupabase();

    const result = await createSchPostViaMcp(
      client,
      ctxOf(),
      validInput({ dry_run: true, evt_end_at: "2026-11-27 18:00", post_type: "sale" }),
    );

    expect(touched).toEqual([]);
    expect(insertNotiManyMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      dry_run: true,
      sch_post_id: null,
      sch_post_url: null,
      crt_at_kst: null,
      notified_cnt: 0,
      audit_id: null,
      post_type: "sale",
    });
    expect(result.evt_stt_at_kst).toContain("10:00");
    expect(result.evt_end_at_kst).toContain("18:00");
  });

  it("dry_run 이어도 검증은 똑같이 돈다", async () => {
    const { client } = makeForbiddenSupabase();
    await expect(
      createSchPostViaMcp(client, ctxOf(), validInput({ dry_run: true, evt_stt_at: "내일" })),
    ).rejects.toBeInstanceOf(ToolInputError);
  });
});

describe("create_sch_post — 저장·알림·감사(앱 createSchPost 와 같은 동작)", () => {
  it("앱과 같은 값으로 저장한다(빈 url 은 null)", async () => {
    const { client, calls } = makeSupabase();
    await createSchPostViaMcp(
      client,
      ctxOf(),
      validInput({ url: "", cont_txt: "접수 링크는 공지 참고" }),
    );

    expect(calls.postInsert).toMatchObject({
      team_id: TEAM_ID,
      sch_nm: "서울마라톤 접수 오픈",
      post_type: "race_entry",
      url: null,
      cont_txt: "접수 링크는 공지 참고",
      evt_end_at: null,
    });
  });

  it("작성자를 뺀 팀 전원에게 sch_post_new 알림을 보내고 실제 발송 인원을 응답에 싣는다", async () => {
    const { client } = makeSupabase({ teamMembers: [M1, M2] });
    insertNotiManyMock.mockResolvedValueOnce({ inAppOk: true, notifiedMemIds: [M1] });

    const result = await createSchPostViaMcp(client, ctxOf(), validInput());

    expect(insertNotiManyMock).toHaveBeenCalledTimes(1);
    const arg = insertNotiManyMock.mock.calls[0][0] as {
      teamId: string;
      memIds: string[];
      notiTypeEnm: string;
      notiCont: string;
      refId: string;
      refTypeEnm: string;
    };
    expect(arg.teamId).toBe(TEAM_ID);
    expect(arg.memIds).toEqual([M1, M2]);
    expect(arg.notiTypeEnm).toBe("sch_post_new");
    expect(arg.notiCont).toBe("[정보] 서울마라톤 접수 오픈");
    // ref_id 는 uuid 컬럼 — short_id 를 넣으면 알림 INSERT 가 통째로 실패한다.
    expect(arg.refId).toBe(POST_ID);
    expect(arg.refTypeEnm).toBe("sch_post");
    // 수신거부 필터가 걸린 뒤의 실제 인원.
    expect(result.notified_cnt).toBe(1);
  });

  it("감사행을 남기고 상세 URL·저장 시각(KST)을 돌려준다", async () => {
    const { client, calls } = makeSupabase();
    const result = await createSchPostViaMcp(
      client,
      ctxOf(),
      validInput(),
      "https://gigang.team",
    );

    expect(calls.auditInsert?.tool_nm).toBe("create_sch_post");
    expect(calls.auditInsert?.actor_mem_id).toBe(ACTOR_ID);
    expect(calls.auditInsert?.team_id).toBe(TEAM_ID);
    expect(result.audit_id).toBe(calls.auditInsert?.audit_id);
    expect(result.sch_post_url).toBe(`https://gigang.team/schedule?post=${POST_ID}`);
    expect(result.short_id).toBe("sp9k2x");
    // 03:15Z = 12:15 KST
    expect(result.crt_at_kst).toContain("2026-11-07");
    expect(result.crt_at_kst).toContain("12:15");
  });

  it("baseUrl 을 못 구하면 상대 경로로 물러난다", async () => {
    const { client } = makeSupabase();
    const result = await createSchPostViaMcp(client, ctxOf(), validInput(), null);
    expect(result.sch_post_url).toBe(`/schedule?post=${POST_ID}`);
  });

  it("알림이 터져도 등록은 성립한다(알림은 부수효과)", async () => {
    const { client, calls } = makeSupabase();
    insertNotiManyMock.mockRejectedValueOnce(new Error("noti down"));

    const result = await createSchPostViaMcp(client, ctxOf(), validInput());

    expect(result.sch_post_id).toBe(POST_ID);
    expect(result.notified_cnt).toBe(0);
    expect(calls.auditInsert).not.toBeNull();
  });

  it("저장이 실패하면 안전 에러로 되돌리고 알림을 보내지 않는다", async () => {
    const { client, calls } = makeSupabase({ insertErr: { message: "violates check" } });
    await expect(createSchPostViaMcp(client, ctxOf(), validInput())).rejects.toBeInstanceOf(
      ToolInputError,
    );
    expect(insertNotiManyMock).not.toHaveBeenCalled();
    expect(calls.auditInsert).toBeNull();
  });
});

describe("create_sch_post — 앱 폼과 같은 스키마로 검증한다", () => {
  it("제목 비움·100자 초과·미지원 유형·잘못된 URL·본문 1000자 초과를 거부한다", async () => {
    const cases = [
      { sch_nm: "" },
      { sch_nm: "가".repeat(101) },
      { post_type: "party" },
      { url: "not a url" },
      { cont_txt: "가".repeat(1001) },
    ];
    for (const bad of cases) {
      const { client, touched } = makeForbiddenSupabase();
      await expect(
        createSchPostViaMcp(client, ctxOf(), validInput(bad)),
      ).rejects.toBeInstanceOf(ToolInputError);
      expect(touched).toEqual([]);
    }
  });

  it("거부 메시지에 내부 정보(team_id)를 흘리지 않는다", async () => {
    const { client } = makeForbiddenSupabase();
    await expect(
      createSchPostViaMcp(client, ctxOf(), validInput({ post_type: "party" })),
    ).rejects.not.toThrow(new RegExp(TEAM_ID));
  });
});
