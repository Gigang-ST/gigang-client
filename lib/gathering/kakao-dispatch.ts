/**
 * 모임 사건(등록·수정·취소)을 단톡방에 알린다.
 *
 * 액션은 "무슨 일이 있었는지"만 넘기고, 문구 조립·발송 판정은 전부 여기 모은다.
 * 셋 다 `after()` 안에서 불린다 — 발송이 느려도 등록 응답이 기다리지 않는다.
 *
 * **여기서 던지지 않는다.** 호출 시점엔 모임 쓰기가 이미 끝났고, 톡 발송 실패로 되돌릴 수 없다.
 *
 * 등록·취소는 모임당 한 번뿐인 사건이라 `request_id` 를 고정해 붙인다 — 액션이 재실행돼도 허브가 한 번만 보낸다.
 * 수정·수동 공지는 같은 모임에서 여러 번 나가는 게 정상이라 붙이지 않는다.
 *
 * 한때 수정 공지에 10분 묶음 창(`gthr_mst.kakao_sent_at`)을 뒀다가 걷어냈다 — 장소를 고치고
 * 바로 또 고치는 건 **사람이 헷갈리는 중이라는 뜻**이라, 그 사이 공지를 삼키면 톡방에 남은
 * 마지막 안내가 틀린 값이 된다. 도배보다 그쪽이 나쁘다. 발송 자체가 일시·장소 변경으로만
 * 한정돼 있어 연타로 쏟아질 여지도 작다.
 */
import { sendKakao } from "@/lib/kakao/notify";
import {
  buildGatheringCancelText,
  buildGatheringShareText,
  buildGatheringShareUrl,
  buildGatheringUpdateText,
  detectGatheringChanges,
  type GatheringShareInput,
} from "@/lib/gathering/share-text";

type GatheringFacts = Omit<GatheringShareInput, "url"> & {
  gthrId: string;
  /** 딥링크용 식별자(short_id 우선). 없으면 링크를 붙이지 않는다. */
  ref?: string | null;
  /** 요청 origin. 액션 본문에서 `getRequestOrigin()`으로 받아 넘긴다. */
  origin?: string | null;
};

function linkOf(facts: GatheringFacts): string | null {
  if (!facts.origin || !facts.ref) return null;
  return buildGatheringShareUrl(facts.origin, facts.ref);
}

/** 모임 등록. */
export async function notifyGatheringCreated(facts: GatheringFacts): Promise<void> {
  await sendKakao(buildGatheringShareText({ ...facts, url: linkOf(facts) }), {
    requestId: `gathering:${facts.gthrId}:created`,
  });
}

/**
 * 모임 수정 — **일시·장소가 실제로 바뀐 경우에만** 보낸다. 바뀌었으면 몇 번을 고치든 매번 간다.
 * 그 외 항목(제목·비고·정원 등)은 톡방에 알리지 않는다. 참석자에겐 인앱 알림이 이미 간다.
 */
export async function notifyGatheringUpdated(
  facts: GatheringFacts & {
    prev: { sttAt: string | null; endAt?: string | null; location?: string | null };
  },
): Promise<void> {
  const changes = detectGatheringChanges(facts.prev, {
    sttAt: facts.sttAt,
    endAt: facts.endAt,
    location: facts.location,
  });
  if (changes.length === 0) return;

  await sendKakao(buildGatheringUpdateText({ ...facts, url: linkOf(facts) }, changes));
}

/** 모임 취소 — 링크 없이. 모르면 사람이 실제로 헛걸음한다. */
export async function notifyGatheringCanceled(facts: GatheringFacts): Promise<void> {
  await sendKakao(buildGatheringCancelText(facts), {
    requestId: `gathering:${facts.gthrId}:canceled`,
  });
}

/**
 * 단톡방에 알리기 — 공유 시트에서 사람이 **직접 눌러** 보내는 공지. 등록 공지와 같은 문구지만
 * 그 사이 모인 참석 인원을 싣는다(등록 순간엔 작성자 1명뿐이라 빠지던 줄).
 *
 * 다른 셋과 달리 결과를 돌려준다 — 누른 사람에게 됐는지 말해 줘야 해서다. 그래도 던지지는 않는다.
 */
export async function announceGathering(
  facts: GatheringFacts,
): Promise<Awaited<ReturnType<typeof sendKakao>>> {
  return sendKakao(buildGatheringShareText({ ...facts, url: linkOf(facts) }));
}
