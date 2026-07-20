import { dayjs } from "@/lib/dayjs";

/**
 * 취소자 판정에 필요한 gthr_attd_hist 이벤트 최소 필드.
 * 실제 조회 행(`GatheringAttdHistRow`, lib/queries/gathering-cancel-history.ts)은 이를
 * 확장한 상위 타입이라 제네릭으로 받아 호출부가 추가 필드(mem_mst 등)를 그대로 보존한다.
 */
export type GatheringAttdHistEvent = {
  mem_id: string;
  evt_cd: "register" | "cancel";
  evt_at: string;
};

/**
 * 모임 참석 이벤트 이력에서 "취소자"만 뽑아낸다.
 *
 * 판정 규칙:
 * 1. 멤버별로 evt_at 기준 가장 최근 이벤트 1건만 본다 — 같은 멤버가 여러 번 취소했으면
 *    최신 취소 건만 채택한다(다중 취소 케이스).
 * 2. 그 마지막 이벤트가 evt_cd='cancel' 인 멤버만 남긴다 — 마지막이 register(재참석 로깅)면
 *    제외한다(register 이벤트 무시 케이스). 현재 SG-01은 register를 기록하지 않지만, 향후
 *    로깅되더라도 안전하게 동작하도록 방어적으로 둔다.
 * 3. `attendingMemIds`(gthr_attd_rel 현재 참석자)에 있는 멤버는 hist상 마지막이 cancel이어도
 *    무조건 제외한다 — 재참석은 rel upsert로만 이뤄지고 hist엔 register 이력이 안 남기 때문에,
 *    rel 존재 여부가 evt_cd 판정보다 우선한다(재참석 케이스).
 *
 * 반환은 최신 취소순(evt_at desc)으로 정렬한다.
 */
export function deriveCanceledAttendees<T extends GatheringAttdHistEvent>(
  hist: readonly T[],
  attendingMemIds: ReadonlySet<string> | readonly string[],
): T[] {
  const attending = attendingMemIds instanceof Set ? attendingMemIds : new Set(attendingMemIds);

  // 멤버별 최신(evt_at 최대) 이벤트만 남긴다.
  const latestByMember = new Map<string, T>();
  for (const evt of hist) {
    const prev = latestByMember.get(evt.mem_id);
    if (!prev || dayjs(evt.evt_at).isAfter(dayjs(prev.evt_at))) {
      latestByMember.set(evt.mem_id, evt);
    }
  }

  return Array.from(latestByMember.values())
    .filter((evt) => evt.evt_cd === "cancel" && !attending.has(evt.mem_id))
    .sort((a, b) => (dayjs(a.evt_at).isAfter(dayjs(b.evt_at)) ? -1 : 1));
}
