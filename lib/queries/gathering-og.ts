import "server-only";
import { unstable_cache } from "next/cache";

import type { GatheringOgSource } from "@/lib/gathering-og";
import { HOME_CALENDAR_CACHE_TAG } from "@/lib/home-calendar-cache-tag";
import { createUntypedAdminClient } from "@/lib/supabase/admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** short_id(nanoid류) 또는 uuid — 그 밖의 문자열은 조회 없이 거른다 */
const REF_RE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * `?gthr=` 값(short_id 또는 uuid) → OG에 필요한 모임 필드.
 *
 * 크롤러는 비로그인이라 세션 클라이언트로는 아무것도 못 읽는다 — 게시판 metadata
 * (`getCachedBoardPost`)와 같이 admin 클라이언트로 읽고 `del_yn=false`·`team_id`로 좁힌다.
 * 어차피 `gthr_mst`는 anon SELECT가 열려 있는 공개 데이터라 새 노출은 아니다.
 *
 * 캐시 태그는 **홈 캘린더 것을 같이 쓴다.** 모임을 만들고 고치고 지우는 세 액션이 이미
 * `updateTag(HOME_CALENDAR_CACHE_TAG)`를 부르므로 OG도 같은 순간에 털린다. 태그를 따로 파면
 * 세 곳에 호출을 하나씩 더 심어야 하고, 하나만 빠뜨리면 옛 제목이 한 시간 남는다.
 */
export function getCachedGatheringOg(
  ref: string,
  teamId: string,
): Promise<GatheringOgSource | null> {
  if (!REF_RE.test(ref)) return Promise.resolve(null);

  return unstable_cache(
    async (): Promise<GatheringOgSource | null> => {
      const admin = createUntypedAdminClient();
      const { data } = await admin
        .from("gthr_mst")
        .select("gthr_id, short_id, gthr_nm, loc_txt, stt_at, sprt_cd, upd_at")
        .eq("team_id", teamId)
        .eq("del_yn", false)
        .eq(UUID_RE.test(ref) ? "gthr_id" : "short_id", ref)
        .maybeSingle();

      if (!data) return null;
      return {
        gthr_id: data.gthr_id,
        short_id: data.short_id ?? null,
        gthr_nm: data.gthr_nm,
        loc_txt: data.loc_txt ?? null,
        stt_at: data.stt_at,
        sprt_cd: data.sprt_cd ?? null,
        upd_at: data.upd_at ?? null,
      };
    },
    ["gathering-og", teamId, ref],
    { tags: [HOME_CALENDAR_CACHE_TAG], revalidate: 3600 },
  )();
}
