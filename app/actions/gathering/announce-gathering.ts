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
 * 공유 시트의 "단톡방에 알림" — 노티봇(카톡 브리지)으로 모임 공지를 한 번 더 올린다.
 *
 * 등록 순간엔 자동 공지가 이미 나간다(`createGathering`). 이건 **리마인드용 수동 발송**이다.
 * 활동 멤버면 **남의 모임도** 올릴 수 있다 — 같이 가는 사람이 "사람 모아요" 하고 올리는 게
 * 이 버튼의 쓸모라서다. 대신 누가 보냈는지 로그에 남긴다(도배가 나면 그 사람과 얘기한다).
 * 비활성·탈퇴는 `withActive`가, 지난 모임은 아래 판정이 막는다.
 *
 * 재시도하지 않는 건 `sendKakao` 의 규칙 그대로다: 브리지는 카톡엔 도착했는데 5xx 가 오는
 * 구간이 있어, 실패 응답이 곧 미발송이 아니다. 그래서 실패 문구도 "다시 눌러라"가 아니라
 * "단톡방을 확인해 달라"다.
 */
export async function announceGatheringToKakao(gthrId: string): Promise<AnnounceGatheringResult> {
  return withActive(async ({ member, supabase }) => {
    const { data: gthr } = await supabase
      .from("gthr_mst")
      .select("gthr_nm, stt_at, end_at, loc_txt, short_id, max_prt_cnt, del_yn, mem_mst!gthr_mst_crt_by_fkey(mem_nm)")
      .eq("gthr_id", gthrId)
      .single();
    if (!gthr || gthr.del_yn) throw new Error("모임을 찾을 수 없습니다.");

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

    // 누가 보냈는지 — sendKakao 로그엔 본문 크기·방 이름뿐이라 여기서 남긴다. 성공·실패 모두.
    console.info("[kakao] 단톡방에 알림", {
      gthrId,
      memId: member.id,
      memNm: member.full_name,
      ok: result.ok,
      skipped: result.skipped ?? null,
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
