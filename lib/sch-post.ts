import type { SupabaseClient } from "@supabase/supabase-js";

import { nowKST } from "@/lib/dayjs";
import { insertNotiMany } from "@/lib/notifications/insert-noti";
import type { Database } from "@/lib/supabase/database.types";
import type { CreateSchPostInput } from "@/lib/validations/schedule";

/**
 * 일정 소식(`sch_post_mst`) 등록 코어 — 클라이언트 주입식.
 *
 * 앱 서버 액션(`createSchPost`)과 운영 MCP 도구(`create_sch_post`, #630)가 **같은 저장·알림**을
 * 하도록 여기 한 곳에 둔다. 액션은 세션 쿠키(`withActive`)와 `after()`에, MCP 는 Bearer 토큰과
 * 인라인 발송에 묶여 있어 신원 해석·실행 시점만 각자 맡고, 무엇을 넣고 누구에게 어떤 문구로
 * 알리는지는 갈리지 않게 한다(갈리면 "MCP 로 올린 소식만 알림이 이상하다"가 생긴다).
 *
 * `next/*` 는 import 하지 않는다 — 캐시 무효화·`after()` 는 호출하는 경로 계층의 몫이다.
 * `insertNotiMany` 가 server-only 체인이라 테스트에선 `vi.mock("@/lib/notifications/insert-noti")` 필수.
 */

type Db = SupabaseClient<Database>;

/** 소식 등록 알림 타입(`noti_mst` CHECK·딥링크 `/schedule?post=` 등록됨). */
export const SCH_POST_NEW_NOTI_TYPE = "sch_post_new";

/** 저장된 소식 — 호출부가 상세 링크·저장 시각을 돌려주는 데 쓴다. */
export type InsertedSchPost = {
  sch_post_id: string;
  short_id: string | null;
  crt_at: string;
};

/**
 * 검증이 끝난 소식 한 건을 저장한다. 일시는 **이미 UTC ISO 로 바꾼 값**을 받는다 —
 * 앱 폼과 MCP 가 일시를 해석하는 엄격함이 달라서(MCP 는 오프셋·자연어를 거부) 변환은 호출부가 한다.
 *
 * @param supabase 앱은 세션 클라이언트(RLS), MCP 는 service-role 클라이언트
 * @returns 저장된 행. 실패면 `null`(에러 타입은 호출부가 자기 규약대로 던진다)
 */
export async function insertSchPost(
  supabase: Db,
  args: {
    teamId: string;
    memId: string;
    values: Omit<CreateSchPostInput, "team_id" | "evt_stt_at" | "evt_end_at">;
    sttIso: string;
    endIso: string | null;
  },
): Promise<InsertedSchPost | null> {
  const { values } = args;
  const { data, error } = await supabase
    .from("sch_post_mst")
    .insert({
      team_id: args.teamId,
      sch_nm: values.sch_nm,
      post_type: values.post_type ?? "general",
      evt_stt_at: args.sttIso,
      evt_end_at: args.endIso,
      url: values.url || null,
      cont_txt: values.cont_txt ?? null,
      crt_by: args.memId,
      vers: 0,
      del_yn: false,
    })
    .select("sch_post_id, short_id, crt_at")
    .single();

  if (error || !data) return null;
  return {
    sch_post_id: data.sch_post_id,
    short_id: data.short_id ?? null,
    crt_at: data.crt_at,
  };
}

/**
 * 작성자를 뺀 팀 전원에게 `sch_post_new` 알림(인앱+푸시)을 보낸다.
 * 수신거부 필터는 관문(`insertNotiMany`)이 처리한다. 예외는 삼키지 않는다 — 호출부가
 * "알림 실패로 등록을 되돌리지 않는다"는 자기 규약대로 잡는다.
 *
 * @param supabase service-role 클라이언트(팀 전원 조회 — RLS 우회 필요)
 * @returns 실제 인앱 알림이 들어간 인원
 */
export async function notifySchPostCreated(
  supabase: Db,
  args: { teamId: string; authorId: string; postId: string; postName: string },
): Promise<number> {
  const { data: members } = await supabase
    .from("team_mem_rel")
    .select("mem_id")
    .eq("team_id", args.teamId)
    .eq("vers", 0)
    .eq("del_yn", false)
    .neq("mem_id", args.authorId);

  if (!members?.length) return 0;

  const { notifiedMemIds } = await insertNotiMany({
    teamId: args.teamId,
    memIds: members.map((m) => m.mem_id),
    notiTypeEnm: SCH_POST_NEW_NOTI_TYPE,
    notiNm: `${nowKST().format("M월 D일")} 새 정보가 등록됐습니다.`,
    notiCont: `[정보] ${args.postName}`,
    // ref_id는 uuid 컬럼이다 — short_id(text)를 넣으면 INSERT가 통째로 실패해
    // 크루원 전원의 알림이 조용히 사라진다(등록은 성공한 채로).
    // 딥링크는 안 깨진다: MiniCalendar가 short_id·uuid 양쪽을 받는다.
    refId: args.postId,
    refTypeEnm: "sch_post",
  });
  return notifiedMemIds.length;
}
