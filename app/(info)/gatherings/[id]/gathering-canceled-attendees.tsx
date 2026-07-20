import { dayjs } from "@/lib/dayjs";

import { Avatar } from "@/components/common/avatar";
import { Caption, Micro, SectionLabel } from "@/components/common/typography";

/** 취소자 1명 표시에 필요한 최소 정보 (판정은 상위에서 이미 끝난 상태로 전달받는다). */
export type CanceledAttendee = {
  mem_id: string;
  mem_nm: string;
  avatar_url: string | null;
  evt_at: string;
  reason_txt: string | null;
};

type Props = {
  attendees: CanceledAttendee[];
};

/**
 * 모임 상세의 취소자 목록. 참석자와 구분되도록 아바타를 흐리게(opacity+grayscale) 표시하고,
 * 취소 시각(KST)·사유(있으면)를 함께 노출한다.
 * 노출 정책(오너 확정): 사유 포함 팀 멤버 전체 공개 — 별도 권한 분기 없음.
 * 참석자 수·정원 카운트에는 포함되지 않는다(page.tsx에서 rel 기준으로만 집계).
 */
export function GatheringCanceledAttendees({ attendees }: Props) {
  if (attendees.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <SectionLabel>취소</SectionLabel>
      <div className="flex flex-col gap-3">
        {attendees.map((a) => (
          <div key={a.mem_id} className="flex items-start gap-2.5">
            <Avatar
              src={a.avatar_url}
              seed={a.mem_id}
              alt={a.mem_nm}
              size="sm"
              className="opacity-40 grayscale"
            />
            <div className="flex flex-col gap-0.5">
              <Caption className="text-muted-foreground">
                {a.mem_nm} · {dayjs(a.evt_at).tz("Asia/Seoul").format("M/D HH:mm")} 취소
              </Caption>
              {a.reason_txt && <Micro>사유: {a.reason_txt}</Micro>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
