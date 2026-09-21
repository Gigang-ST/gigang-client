/**
 * 모임 사건(등록·수정·취소)을 단톡방에 알린다.
 *
 * 액션은 "무슨 일이 있었는지"만 넘기고, 문구 조립·도배 판정·발송 기록은 전부 여기 모은다.
 * 셋 다 `after()` 안에서 불린다 — 발송이 느려도 등록 응답이 기다리지 않는다.
 *
 * **여기서 던지지 않는다.** 호출 시점엔 모임 쓰기가 이미 끝났고, 톡 발송 실패로 되돌릴 수 없다.
 */
import { sendKakao } from "@/lib/kakao/notify";
import {
  buildGatheringCancelText,
  buildGatheringShareText,
  buildGatheringShareUrl,
  buildGatheringUpdateText,
  detectGatheringChanges,
  shouldSendAfterThrottle,
  type GatheringShareInput,
} from "@/lib/gathering/share-text";

/**
 * `createUntypedAdminClient()` 가 돌려주는 정도만 쓴다 — 스키마 타입에 묶지 않는다.
 * `eq` 는 Promise 가 아니라 thenable 빌더라 `PromiseLike` 로 받는다.
 */
type AdminClient = {
  from: (table: string) => {
    update: (values: Record<string, unknown>) => {
      eq: (col: string, val: string) => PromiseLike<{ error: unknown }>;
    };
  };
};

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

/** 발송 성공을 모임 행에 남긴다 — 이후 변경 공지의 10분 묶음 판정이 이 값을 읽는다. */
async function stampSentAt(admin: AdminClient, gthrId: string): Promise<void> {
  const { error } = await admin
    .from("gthr_mst")
    .update({ kakao_sent_at: new Date().toISOString() })
    .eq("gthr_id", gthrId);
  if (error) console.error("[kakao] 발송 시각 기록 실패", error);
}

/** 모임 등록 — 묶음 판정 없이 항상 보낸다(1회성). */
export async function notifyGatheringCreated(
  admin: AdminClient,
  facts: GatheringFacts,
): Promise<void> {
  const text = buildGatheringShareText({ ...facts, url: linkOf(facts) });
  const result = await sendKakao(text);
  if (result.ok) await stampSentAt(admin, facts.gthrId);
}

/**
 * 모임 수정 — **일시·장소가 실제로 바뀐 경우에만**, 그리고 직전 발송이 10분 밖일 때만 보낸다.
 * 그 외 항목(제목·비고·정원 등)은 톡방에 알리지 않는다. 참석자에겐 인앱 알림이 이미 간다.
 */
export async function notifyGatheringUpdated(
  admin: AdminClient,
  facts: GatheringFacts & {
    prev: { sttAt: string | null; endAt?: string | null; location?: string | null };
    lastSentAt?: string | null;
  },
): Promise<void> {
  const changes = detectGatheringChanges(facts.prev, {
    sttAt: facts.sttAt,
    endAt: facts.endAt,
    location: facts.location,
  });
  if (changes.length === 0) return;
  if (!shouldSendAfterThrottle(facts.lastSentAt)) {
    console.info("[kakao] 변경 공지 묶음 창 안 — skip", { gthrId: facts.gthrId });
    return;
  }

  const text = buildGatheringUpdateText({ ...facts, url: linkOf(facts) }, changes);
  const result = await sendKakao(text);
  if (result.ok) await stampSentAt(admin, facts.gthrId);
}

/**
 * 모임 취소 — 묶음 판정을 거치지 않는다. 방금 일시를 고쳤더라도 취소는 알려야 한다.
 * 모르면 사람이 실제로 헛걸음한다.
 */
export async function notifyGatheringCanceled(
  admin: AdminClient,
  facts: GatheringFacts,
): Promise<void> {
  const text = buildGatheringCancelText(facts);
  const result = await sendKakao(text);
  if (result.ok) await stampSentAt(admin, facts.gthrId);
}
