import type { MoodLevel } from "@/lib/mood-scale";

/**
 * 팀 문구 — 화면 곳곳의 크루 이름·호칭·기능 이름·말투를 **팀 기준으로** 만든다. 순수 함수라 서버·클라이언트 둘 다 쓴다.
 * 서버에서 지금 요청의 팀 문구를 꺼내는 건 `lib/queries/team-copy.ts`(`getTeamCopy`), 회귀 테스트 `lib/__tests__/team-copy.test.ts`.
 *
 * 2026-11-10 전에는 화면에 「기강」이 박혀 있어 울산(모보브) 화면에도 「기강에 합류」「기강인만 볼 수 있어요」가 떴다.
 *
 * ## 세 갈래 (유저 결정 2026-11-10)
 * 1. **크루 이름·호칭 = 팀 설정** — `brand.name`(크루 이름) · `brand.member_noun`(회원 호칭). 운영진이 화면에서 바꾼다.
 *    비어 있으면 중립어(「크루」·「크루원」) — **다른 팀 이름으로 물러나지 않는다.**
 * 2. **기능 이름 = 크루 이름으로 자동** — 「{이름}의 전당」「{이름}이야기」. 설정을 따로 두지 않는다.
 * 3. **팀 전용 말투 = 이 파일의 표(`TEAM_VOICE`)** — 「기강이 빠졌군. 알림 켜라!」처럼 「기강」(규율)이라는 단어 뜻에
 *    기댄 말장난은 다른 이름에 옮기면 말이 안 된다. 표에 있는 팀만 자기 말투를 쓰고, 없으면 중립 문구다.
 *    **팀 설정에 두지 않는 이유**: 글자 수 제한이 있는 자리(리드 18자 근처·헤더 224px)라 아무나 바꾸면 화면이 깨지고,
 *    한 번 다듬으면 거의 안 바뀐다. 새 팀이 자기 말투를 원하면 개발자가 이 표에 한 줄 더한다.
 *
 * 조사는 이름 받침에 따라 갈린다(「기강은」/「모보브는」) — 문구를 만들 때 `josa()`(`lib/josa.ts`)를 쓴다.
 */

/** 중립 크루 이름 — 팀 설정에 크루 이름이 없을 때 */
export const NEUTRAL_CREW_NAME = "크루";
/** 중립 회원 호칭 — 팀 설정에 호칭이 없을 때(유저 결정 2026-11-10) */
export const NEUTRAL_MEMBER_NOUN = "크루원";

/** 컨디션 한마디(프로필 카드) — 최근 90일 활동 단계별. 「실종」(dormant)은 날짜가 들어가 `lib/member-card.ts` 가 만든다 */
export type CardMoodMessages = Record<Exclude<MoodLevel, "dormant">, string>;

/**
 * 팀 전용 말투. 칸이 비어 있으면 중립 문구(`NEUTRAL_VOICE`)를 쓴다.
 * 말장난 줄(`puns`)은 **더해지는** 것 — 중립 묶음에 그 팀만의 줄을 같은 자리에 끼운다.
 */
type TeamVoice = {
  /** 정식 단체명(더보기 푸터 「© 2026 ○○」) — 없으면 크루 이름 */
  orgName?: string;
  /** 「깅스타그램」처럼 이름에서 못 만드는 사진 지면 이름 */
  galleryName?: string;
  /** 사진 지면 영문 라벨(존 머리·작성창 제목) */
  galleryLabel?: string;
  /** 푸시 알림 켜기 안내 제목 */
  pushPromptTitle?: string;
  /** 홈 화면 설치 안내 제목 */
  installPromptTitle?: string;
  /** 홈 리드 활동지수 슬롯 머리말 */
  actvKicker?: string;
  /** 컨디션 단계 이름표(프로필 카드 게이지 옆) */
  moodLabels?: Record<MoodLevel, string>;
  /** 컨디션 한마디 */
  cardMood?: CardMoodMessages;
  /** 홈 리드 활동지수 헤드라인에 더할 줄 — `{name}` = 대표 이름. 키 = 중립 묶음에서 끼울 자리(그 줄 **앞**) */
  extraHeadlines?: { before: number; text: string }[];
  /** 한마디 예시에 더할 줄(맨 앞) */
  extraQuips?: string[];
};

const NEUTRAL_VOICE = {
  galleryName: "갤러리",
  galleryLabel: "Gallery",
  pushPromptTitle: "🔔 알림을 켜 두세요",
  installPromptTitle: "📲 홈 화면에 추가하고 알림을 켜 두세요",
  actvKicker: "이번 달 가장 뜨거운",
  moodLabels: { blazing: "불타는 중", steady: "꾸준히", resting: "스며드는 중", dormant: "실종" },
  cardMood: { blazing: "내가 곧 기준", steady: "슬슬 시동 거는 중", resting: "관심이 생기는 정도" },
} as const satisfies Required<Omit<TeamVoice, "extraHeadlines" | "extraQuips" | "orgName">>;

/**
 * 팀별 말투 표. **기강 값은 2026-11-10 이전 화면 문구 그대로다** — 바꾸면 기강 화면이 바뀐다(테스트가 지킨다).
 */
const TEAM_VOICE: Readonly<Record<string, TeamVoice>> = {
  gigang: {
    orgName: "기강 스포츠 팀",
    galleryName: "깅스타그램",
    galleryLabel: "Gingstargram",
    pushPromptTitle: "🔔 기강이 빠졌군. 알림 켜라!",
    installPromptTitle: "📲 기강이 풀렸군. 홈 화면에 모시고 알림 켜라!",
    actvKicker: "이번 달 기강 잡는",
    // 양 끝(그 자체/실종)만 「기강」을 쓰고 중간 두 단계는 사실대로 — 과장하지 않기 위해서
    moodLabels: { blazing: "기강 그 자체", steady: "기강 잡아", resting: "기며든다", dormant: "실종" },
    cardMood: { blazing: "내가 곧 기강의 기준", steady: "슬슬 기강 좀 잡아볼까", resting: "기강에 관심이 생기는 정도" },
    // 「기강을 잡다」(규율) 말장난 — 원래 묶음의 10번째 줄 자리
    extraHeadlines: [{ before: 9, text: "{name}, 이번 달 기강을 혼자 다 잡았다" }],
    // 기강 어휘 자폭 — 기강 목소리의 시그니처(원래 묶음 맨 앞)
    extraQuips: ["기강 잡으러 나갔다가 기강 잡혔다"],
  },
};

/**
 * 홈 리드 활동지수 헤드라인 — 모든 팀 공통 묶음. `{name}` = 대표 이름, `{crew}` = 크루 이름.
 * 「요즘 제일 뜨거운」 결의 캐주얼 톤. 활동량 수치는 말하지 않는다(히든 운영).
 */
const BASE_HEADLINES = [
  "{name}, 요즘 제일 뜨겁다",
  "{name}, 지칠 줄을 모른다",
  "{name}, 이번 달 {crew}의 기준",
  "{name}, 오늘도 달리고 있다",
  "{name}, 두 발이 쉬질 않는다",
  "이번 달, {name}의 심장은 쉬지 않았다",
  "{name}, 심장에 모터라도 달았나",
  "이번 달 가장 뜨거운 심장, {name}",
  "쉬는 법을 잊은 사람, {name}",
  "아무도 못 말린다, 이번 달 {name}",
  "{name}, 이번 달 러닝화 밑창 갈아치울 기세",
  "이번 달 {crew}의 심박수는 {name} 담당",
  "{name}, 이번 달 {crew}의 페이스메이커",
] as const;

/**
 * 한마디 예시(placeholder) — 모든 팀 공통 묶음(`lib/quips.ts` 의 말투 규칙을 따른다: 18자 근처, 운동 일색 금지).
 * 「수배 풀렸습니다」는 현상수배존(모든 팀에 있는 기능) 농담이라 공통이다.
 */
const BASE_QUIPS = [
  "수배 풀렸습니다",
  "이상 없음. 다리만 없음",
  "임무 완수. 무릎은 전사",
  "완주했습니다. 폼은 버렸습니다",
  "무릎이 사직서를 냈다",
  "10km 뛰고 20km 먹었다",
  "달린 건 5km, 자랑은 50km",
  "다리보다 지갑이 먼저 털렸다",
  "심장이 퇴사하겠다는데",
  "앞사람만 보고 뛰었더니 끝나 있었다",
  "치킨 먹으려고 뛴 건 비밀",
] as const;

export type TeamCopy = {
  /** 크루 이름(팀 설정 `brand.name`, 없으면 「크루」) */
  crewName: string;
  /** 회원 호칭(팀 설정 `brand.member_noun`, 없으면 「크루원」) */
  memberNoun: string;
  /** 영문 워드마크(팀 설정 `brand.wordmark` — GIGANG·MOVOF, 없으면 크루 이름) — 칭호 배지 미리보기 기본 글자 */
  wordmark: string;
  /** 랭킹 탭 이름 — 「{이름}의 전당」 */
  hallName: string;
  /** 홈 지면 제호 — 「{이름}이야기」 */
  storyName: string;
  /** 정식 단체명(더보기 푸터) — 기강 「기강 스포츠 팀」, 그 밖 크루 이름 */
  orgName: string;
  /** 홈 사진 지면 이름 — 기강 「깅스타그램」, 그 밖 「갤러리」 */
  galleryName: string;
  /** 홈 사진 지면 영문 라벨 — 기강 「Gingstargram」, 그 밖 「Gallery」 */
  galleryLabel: string;
  pushPromptTitle: string;
  installPromptTitle: string;
  actvKicker: string;
  moodLabels: Record<MoodLevel, string>;
  cardMood: CardMoodMessages;
  /** 홈 리드 활동지수 헤드라인 — `{name}` 만 남아 있다(크루 이름은 채워 둠) */
  actvHeadlines: readonly string[];
  quips: readonly string[];
};

export type TeamCopyInput = {
  teamCd: string;
  /** 팀 설정 `brand.name` */
  crewName: string | null;
  /** 팀 설정 `brand.member_noun` */
  memberNoun: string | null;
  /** 팀 설정 `brand.wordmark` */
  wordmark?: string | null;
};

export function buildTeamCopy(input: TeamCopyInput): TeamCopy {
  const crewName = input.crewName?.trim() || NEUTRAL_CREW_NAME;
  const memberNoun = input.memberNoun?.trim() || NEUTRAL_MEMBER_NOUN;
  const voice = TEAM_VOICE[input.teamCd] ?? {};

  const headlines: string[] = BASE_HEADLINES.map((h) => h.replaceAll("{crew}", crewName));
  // 뒤에서부터 끼워야 앞 자리 번호가 안 밀린다
  for (const { before, text } of [...(voice.extraHeadlines ?? [])].sort((a, b) => b.before - a.before)) {
    headlines.splice(before, 0, text);
  }

  return {
    crewName,
    memberNoun,
    wordmark: input.wordmark?.trim() || crewName,
    hallName: `${crewName}의 전당`,
    storyName: `${crewName}이야기`,
    orgName: voice.orgName ?? crewName,
    galleryName: voice.galleryName ?? NEUTRAL_VOICE.galleryName,
    galleryLabel: voice.galleryLabel ?? NEUTRAL_VOICE.galleryLabel,
    pushPromptTitle: voice.pushPromptTitle ?? NEUTRAL_VOICE.pushPromptTitle,
    installPromptTitle: voice.installPromptTitle ?? NEUTRAL_VOICE.installPromptTitle,
    actvKicker: voice.actvKicker ?? NEUTRAL_VOICE.actvKicker,
    moodLabels: voice.moodLabels ?? NEUTRAL_VOICE.moodLabels,
    cardMood: voice.cardMood ?? NEUTRAL_VOICE.cardMood,
    actvHeadlines: headlines,
    quips: [...(voice.extraQuips ?? []), ...BASE_QUIPS],
  };
}
