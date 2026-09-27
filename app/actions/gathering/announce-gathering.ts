"use server";

import { withActive } from "@/lib/actions/auth";
import { announceGathering } from "@/lib/gathering/kakao-dispatch";
import { isPastLockedFor } from "@/lib/past-event";
import { getRequestOrigin } from "@/lib/request-origin";

export type AnnounceGatheringResult =
  | { ok: true }
  /** disabled = 이 환경엔 노티봇이 없다(로컬·preview). unconfirmed = 보냈지만 성공 응답을 못 받았다. */
  | { ok: false; reason: "disabled" | "unconfirmed"; message: string };

/**
 * 공유 시트의 "단톡방에 알리기" — 노티봇(카톡 브리지)으로 모임 공지를 한 번 더 올린다.
 *
 * 등록 순간엔 자동 공지가 이미 나간다(`createGathering`). 이건 **리마인드용 수동 발송**이라
 * 누구나 누르게 두면 단톡방이 도배된다 — 수정 권한과 같은 경계(작성자·관리자)로 좁힌다.
 * 버튼을 감추는 건 안내일 뿐이고 여기서 다시 판정한다.
 *
 * 재시도하지 않는 건 `sendKakao` 의 규칙 그대로다: 브리지는 카톡엔 도착했는데 5xx 가 오는
 * 구간이 있어, 실패 응답이 곧 미발송이 아니다. 그래서 실패 문구도 "다시 눌러라"가 아니라
 * "단톡방을 확인해 달라"다.
 */
export async function announceGatheringToKakao(gthrId: string): Promise<AnnounceGatheringResult> {
  return withActive(async ({ member, supabase }) => {
    const { data: gthr } = await supabase
      .from("gthr_mst")
      .select("gthr_nm, stt_at, end_at, loc_txt, short_id, crt_by, max_prt_cnt, del_yn, mem_mst!gthr_mst_crt_by_fkey(mem_nm)")
      .eq("gthr_id", gthrId)
      .single();
    if (!gthr || gthr.del_yn) throw new Error("모임을 찾을 수 없습니다.");

    if (gthr.crt_by !== member.id && !member.admin) {
      throw new Error("모임을 연 사람이나 운영진만 단톡방에 알릴 수 있어요.");
    }
    // 지난 모임을 톡방에 올릴 이유가 없다 — 수정·삭제 잠금과 같은 기준.
    if (isPastLockedFor(member.admin, gthr.stt_at, gthr.end_at)) {
      throw new Error("이미 지난 모임이에요.");
    }

    const { count } = await supabase
      .from("gthr_attd_rel")
      .select("attd_id", { count: "exact", head: true })
      .eq("gthr_id", gthrId);

    const author = Array.isArray(gthr.mem_mst) ? gthr.mem_mst[0] : gthr.mem_mst;
    const result = await announceGathering({
      gthrId,
      ref: gthr.short_id ?? gthrId,
      origin: await getRequestOrigin(),
      title: gthr.gthr_nm ?? "",
      sttAt: gthr.stt_at,
      endAt: gthr.end_at,
      location: gthr.loc_txt ?? null,
      authorName: author?.mem_nm ?? null,
      attendeeCount: count ?? null,
      maxCount: gthr.max_prt_cnt ?? null,
    });

    if (result.ok) return { ok: true };
    if (result.skipped === "disabled") {
      return { ok: false, reason: "disabled", message: "이 환경엔 노티봇이 연결돼 있지 않아요." };
    }
    return {
      ok: false,
      reason: "unconfirmed",
      message: "전송 확인이 안 됐어요. 중복될 수 있으니 단톡방을 먼저 확인해 주세요.",
    };
  });
}
