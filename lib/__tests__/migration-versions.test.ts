import { readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * 마이그레이션 파일 버전(앞 14자리)은 저장소 안에서 하나뿐이어야 한다(supabase/migrations/README.md 규약 4).
 * 적용 기록은 버전이 기본키라 겹치면 하나만 기록된다 — 2026-11-27 두 쌍이 겹쳐 dev 기록에서 빠졌다.
 */
describe("마이그레이션 버전", () => {
  const files = readdirSync(join(process.cwd(), "supabase/migrations")).filter((f) => f.endsWith(".sql"));

  it("파일 이름은 「14자리 버전_이름.sql」 꼴이다", () => {
    for (const f of files) expect(f, f).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/);
  });

  it("같은 버전을 두 파일이 쓰지 않는다", () => {
    const seen = new Map<string, string>();
    const dup: string[] = [];
    for (const f of files) {
      const v = f.slice(0, 14);
      if (seen.has(v)) dup.push(`${v}: ${seen.get(v)} · ${f}`);
      else seen.set(v, f);
    }
    expect(dup).toEqual([]);
  });
});
