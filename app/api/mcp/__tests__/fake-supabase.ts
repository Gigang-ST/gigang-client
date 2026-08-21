import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

/**
 * MCP 도구 테스트용 **미니 인메모리 Supabase**.
 *
 * 도구 하나가 테이블 대여섯 개를 오가며(참가 조회 → 배율 → 저장 → 목표 재계산 → 스냅샷)
 * 같은 테이블을 여러 번 다르게 부르기 때문에, 호출 순서에 맞춰 결과를 늘어놓는 방식의 스텁은
 * 금방 무너진다. 여기서는 **행을 실제로 들고** eq/gte/lte/in 필터를 흉내 내, 저장한 것이
 * 다음 조회에 그대로 보이게 한다 — "넣고 바로 확인"이 이 도구들의 기본 흐름이라 그 흐름
 * 자체를 테스트가 재현해야 한다.
 *
 * 지원 범위는 우리 코드가 실제로 쓰는 것뿐이다: `select/insert/update/delete`,
 * `eq/neq/gte/lte/in`, `order/limit`, `single/maybeSingle`, 그리고 임베디드 관계
 * (`table!inner(...)`)에 대한 **점 표기 필터**(`evt_team_mst.team_id`). 행에 임베디드 객체를
 * 미리 넣어 두면 그 경로로 필터가 걸린다.
 */

export type Row = Record<string, unknown>;

export type RecordedOp = {
  table: string;
  op: "select" | "insert" | "update" | "delete";
  filters: { col: string; kind: string; val: unknown }[];
  payload?: unknown;
};

function readPath(row: Row, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc == null) return undefined;
    const cur = Array.isArray(acc) ? acc[0] : acc;
    return (cur as Row)?.[key];
  }, row);
}

class FakeQuery implements PromiseLike<{ data: unknown; error: unknown }> {
  private filters: RecordedOp["filters"] = [];
  private op: RecordedOp["op"] = "select";
  private payload: unknown;
  private orderCol: string | null = null;
  private orderAsc = true;
  private limitN: number | null = null;

  constructor(
    private db: FakeSupabase,
    private table: string,
  ) {}

  select(_cols?: string) {
    if (this.op === "select") this.op = "select";
    return this;
  }
  insert(payload: Row | Row[]) {
    this.op = "insert";
    this.payload = payload;
    return this;
  }
  update(patch: Row) {
    this.op = "update";
    this.payload = patch;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push({ col, kind: "eq", val });
    return this;
  }
  neq(col: string, val: unknown) {
    this.filters.push({ col, kind: "neq", val });
    return this;
  }
  gte(col: string, val: unknown) {
    this.filters.push({ col, kind: "gte", val });
    return this;
  }
  lte(col: string, val: unknown) {
    this.filters.push({ col, kind: "lte", val });
    return this;
  }
  in(col: string, val: unknown[]) {
    this.filters.push({ col, kind: "in", val });
    return this;
  }
  is(col: string, val: unknown) {
    this.filters.push({ col, kind: "eq", val });
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderCol = col;
    this.orderAsc = opts?.ascending !== false;
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }

  private matches(row: Row): boolean {
    return this.filters.every((f) => {
      const actual = readPath(row, f.col);
      switch (f.kind) {
        case "eq":
          return actual === f.val;
        case "neq":
          return actual !== f.val;
        case "gte":
          return (actual as string) >= (f.val as string);
        case "lte":
          return (actual as string) <= (f.val as string);
        case "in":
          return (f.val as unknown[]).includes(actual);
        default:
          return true;
      }
    });
  }

  private run(): { data: unknown; error: unknown } {
    const forced = this.db.errors[`${this.table}:${this.op}`];
    if (forced) return { data: null, error: forced };

    const rows = this.db.tables[this.table] ?? (this.db.tables[this.table] = []);
    this.db.ops.push({
      table: this.table,
      op: this.op,
      filters: this.filters,
      payload: this.payload,
    });

    if (this.op === "insert") {
      const incoming = (
        Array.isArray(this.payload) ? this.payload : [this.payload]
      ) as Row[];
      const created = incoming.map((r, i) => ({
        ...this.db.defaultsFor(this.table, i),
        ...r,
      }));
      rows.push(...created);
      return { data: created, error: null };
    }

    const matched = rows.filter((r) => this.matches(r));

    if (this.op === "update") {
      for (const r of matched) Object.assign(r, this.payload as Row);
      return { data: matched, error: null };
    }
    if (this.op === "delete") {
      this.db.tables[this.table] = rows.filter((r) => !this.matches(r));
      return { data: matched, error: null };
    }

    let out = [...matched];
    if (this.orderCol) {
      const col = this.orderCol;
      out.sort((a, b) => {
        const av = String(readPath(a, col) ?? "");
        const bv = String(readPath(b, col) ?? "");
        return (av < bv ? -1 : av > bv ? 1 : 0) * (this.orderAsc ? 1 : -1);
      });
    }
    if (this.limitN !== null) out = out.slice(0, this.limitN);
    return { data: out, error: null };
  }

  async single() {
    const { data, error } = this.run();
    const rows = (data ?? []) as Row[];
    if (error) return { data: null, error };
    if (rows.length !== 1) {
      return { data: null, error: { message: "row not found", code: "PGRST116" } };
    }
    return { data: rows[0], error: null };
  }

  async maybeSingle() {
    const { data, error } = this.run();
    const rows = (data ?? []) as Row[];
    if (error) return { data: null, error };
    return { data: rows[0] ?? null, error: null };
  }

  then<R1 = { data: unknown; error: unknown }, R2 = never>(
    onfulfilled?: ((v: { data: unknown; error: unknown }) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    try {
      return Promise.resolve(this.run()).then(onfulfilled, onrejected);
    } catch (e) {
      return Promise.reject(e).then(onfulfilled, onrejected);
    }
  }
}

export class FakeSupabase {
  tables: Record<string, Row[]> = {};
  ops: RecordedOp[] = [];
  /** `"table:op"` 키에 값을 넣으면 그 호출이 에러를 돌려준다(실패 경로 테스트용). */
  errors: Record<string, unknown> = {};
  private seq = 0;

  constructor(seed: Record<string, Row[]> = {}) {
    for (const [t, rows] of Object.entries(seed)) this.tables[t] = rows.map((r) => ({ ...r }));
  }

  /** insert 시 채워 넣을 기본값(PK 등). 테스트가 예측 가능한 id 를 쓰도록 순번을 붙인다. */
  defaultsFor(table: string, idx: number): Row {
    this.seq += 1;
    const n = `${this.seq + idx}`.padStart(12, "0");
    switch (table) {
      case "evt_mlg_act_hist":
        return { act_id: `act00000-0000-4000-8000-${n}` };
      case "gthr_mst":
        return { gthr_id: `gth00000-0000-4000-8000-${n}`, short_id: `s${n}` };
      default:
        return {};
    }
  }

  from(table: string) {
    return new FakeQuery(this, table);
  }

  /** 테스트 단언용 — 특정 테이블에 실제로 나간 연산만 추린다. */
  opsOn(table: string, op?: RecordedOp["op"]) {
    return this.ops.filter((o) => o.table === table && (!op || o.op === op));
  }

  asClient(): SupabaseClient<Database> {
    return this as unknown as SupabaseClient<Database>;
  }
}
