"use server";

import { withActive } from "@/lib/actions/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/** 이력 한 줄 — "언제 무슨 칭호를 땄나" */
export type TitleHistoryEntry = {
  id: string;
  ttl_nm: string;
  ttl_desc: string | null;
  desc_visibility: "always" | "others" | "held" | "never";
  rarity_level: number;
  /** 수여 시각(timestamptz) — 표시는 반드시 `formatKST`로 (§CLAUDE.md 날짜 규칙) */
  grnt_at: string;
  /** 자동 획득인가(false면 운영진 수여) — 원문 사유는 내부 용어라 화면에 쓰지 않는다 */
  auto: boolean;
};

export type TitleHistoryResult =
  | { ok: false; message: string }
  | { ok: true; entries: TitleHistoryEntry[] };

/** 한 사람이 이보다 많이 받을 일은 없다(dev 최대 32개). 방어적 상한 */
const MAX_ROWS = 200;

type Row = {
  mem_ttl_id: string;
  /** `mem_ttl_rel.grnt_at`은 **NOT NULL DEFAULT now()**라 비는 일이 없다(§아래 정렬 주석) */
  grnt_at: string;
  grnt_rsn_txt: string | null;
  ttl_mst:
    | { ttl_nm: string; ttl_desc: string | null; desc_visibility: string; rarity_level: number }
    | { ttl_nm: string; ttl_desc: string | null; desc_visibility: string; rarity_level: number }[]
    | null;
};

/**
 * 내 칭호 획득 이력 — 수여 시각 역순.
 *
 * **본인 것만 돌려준다.** `team_mem_id`를 인자로 받지 않고 세션의 것을 쓰는 게 그 장치다 —
 * 인자로 열어 두면 남의 id만 알면 남의 이력을 읽을 수 있고, 칭호는 "언제 무엇을 했나"가
 * 드러나는 자리다(취소 계열 칭호를 생각하면 더 그렇다).
 *
 * **회수분(`del_yn=true`)은 뺀다.** 회수는 운영진 행위인데 "빼앗김"이 이력에 남으면
 * 본인은 영문을 모른 채 그 줄만 보게 된다 — 회수 알림이 따로 없다는 점도 같이 작용한다
 * (자동 회수를 안 넣은 것과 같은 태도, `sweepEvaluateAndGrant` 주석).
 *
 * 이 목록은 도감(`CollectionSheet`)과 축이 다르다. 도감은 등급·카테고리 순으로 "뭘 모았나"를,
 * 여기는 시간 역순으로 "언제 땄나"를 보여준다.
 */
export async function getTitleHistory(): Promise<TitleHistoryResult> {
  try {
    return await withActive(async ({ member }) => {
      const db = createAdminClient();

      const { data, error } = await db
        .from("mem_ttl_rel")
        .select(
          "mem_ttl_id, grnt_at, grnt_rsn_txt, ttl_mst(ttl_nm, ttl_desc, desc_visibility, rarity_level)",
        )
        .eq("team_mem_id", member.team_mem_id)
        .eq("vers", 0)
        .eq("del_yn", false)
        // `grnt_at` 하나로 정렬한다. 이 컬럼은 **NOT NULL DEFAULT now()**라 비지 않으므로
        // `crt_at` 폴백도, nulls 처리도 필요 없다. 예전엔 방어적으로 `?? crt_at`을 뒀는데
        // 그게 오히려 "null일 수 있다"고 읽혀 **정렬 키(grnt_at)와 표시 값(crt_at)이 갈리는
        // 버그처럼** 보였다 — 없는 예외를 막는 코드는 그 자체가 잘못된 신호가 된다.
        .order("grnt_at", { ascending: false })
        .limit(MAX_ROWS);

      if (error) {
        console.error("[getTitleHistory] 이력 조회 실패", error);
        return { ok: false as const, message: "잠시 후 다시 시도해 주세요" };
      }

      const entries: TitleHistoryEntry[] = [];
      for (const row of (data ?? []) as unknown as Row[]) {
        const t = Array.isArray(row.ttl_mst) ? row.ttl_mst[0] : row.ttl_mst;
        // 운영에서 내린 칭호(ttl_mst 행이 안 잡히는 경우)는 건너뛴다 — 이름 없는 줄을 세우지 않는다.
        if (!t) continue;
        entries.push({
          id: row.mem_ttl_id,
          ttl_nm: t.ttl_nm,
          ttl_desc: t.ttl_desc,
          desc_visibility: (t.desc_visibility ?? "always") as TitleHistoryEntry["desc_visibility"],
          rarity_level: t.rarity_level,
          grnt_at: row.grnt_at,
          // 엔진이 남기는 사유는 `자동수여 (trigger=...)` 형태다 — 내부 용어라 그대로 쓰지 않고
          // 자동/수여 두 갈래로만 접는다.
          auto: (row.grnt_rsn_txt ?? "").startsWith("자동수여"),
        });
      }

      return { ok: true as const, entries };
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "잠시 후 다시 시도해 주세요";
    return { ok: false, message };
  }
}
