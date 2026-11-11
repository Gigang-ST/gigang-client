import { josa } from "@/lib/josa";
import type { MoodLevel } from "@/lib/mood-scale";

/**
 * 팀 문구 — 화면 곳곳의 크루 이름·호칭·기능 이름·말투를 **팀 기준으로** 만든다. 순수 함수라 서버·클라이언트 둘 다 쓴다.
 * 서버에서 지금 요청의 팀 문구를 꺼내는 건 `lib/queries/team-copy.ts`(`getTeamCopy`), 회귀 테스트 `lib/__tests__/team-copy.test.ts`.
 *
 * 2026-11-10 전에는 화면에 「기강」이 박혀 있어 울산(모보브) 화면에도 「기강에 합류」「기강인만 볼 수 있어요」가 떴다.
 *
 * ## 세 갈래 (유저 결정 2026-11-10)
 * 1. **크루 이름·호칭 = 팀 설정** — `brand.name`(크루 이름) · `brand.member_noun`(회원 호칭). 운영진이 화면에서 바꾼다.
 *    비어 있거나 못 읽으면 **팀 기본 이름**(아래 말투 표 — 기강 「기강」·「기강인」), 그것도 없으면 중립어(「크루」·「크루원」).
 *    **다른 팀 이름으로는 물러나지 않는다.**
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
  /**
   * **팀 기본 이름** — 팀 설정(`brand.name`·`brand.member_noun`·`brand.wordmark`)이 비었거나 **못 읽었을 때** 쓴다.
   * 이게 없으면 설정 조회가 한 번 실패한 순간 이름은 「크루」로 빠지는데 말장난(팀 코드로 붙는다)은 「기강이 빠졌군」
   * 그대로라 한 화면에 두 팀 말투가 섞인다(리뷰 2026-11-11). prd 에 마이그레이션보다 코드가 먼저 나가도 같은 일이 난다.
   * 팀 코드는 실패해도 알고 있으니(주소에서 온다) 이름도 여기서 채운다. 팀 설정 값이 있으면 그게 이긴다.
   */
  crewName?: string;
  memberNoun?: string;
  wordmark?: string;
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
  /** 지면 검색 설명(`<meta name="description">`) — 그 팀이 다듬은 문장. 없는 지면은 크루 이름으로 만든 중립 문장 */
  pageDescriptions?: Partial<Record<PageDescriptionKey, string>>;
};

const NEUTRAL_VOICE = {
  galleryName: "갤러리",
  galleryLabel: "Gallery",
  pushPromptTitle: "🔔 알림을 켜 두세요",
  installPromptTitle: "📲 홈 화면에 추가하고 알림을 켜 두세요",
  actvKicker: "이번 달 가장 뜨거운",
  moodLabels: { blazing: "불타는 중", steady: "꾸준히", resting: "스며드는 중", dormant: "실종" },
  cardMood: { blazing: "내가 곧 기준", steady: "슬슬 시동 거는 중", resting: "관심이 생기는 정도" },
} as const satisfies Required<
  Omit<TeamVoice, "extraHeadlines" | "extraQuips" | "orgName" | "crewName" | "memberNoun" | "wordmark" | "pageDescriptions">
>;

/**
 * 팀별 말투 표. **기강 값은 2026-11-10 이전 화면 문구 그대로다** — 바꾸면 기강 화면이 바뀐다(테스트가 지킨다).
 */
const TEAM_VOICE: Readonly<Record<string, TeamVoice>> = {
  gigang: {
    crewName: "기강",
    memberNoun: "기강인",
    wordmark: "GIGANG",
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
    // 검색에 걸리게 「러닝크루」·지역·종목을 넣어 다듬은 문장(2026-09 네이버 대응) — 2026-11-11 이전 그대로
    pageDescriptions: {
      board: "기강 러닝크루 공지사항과 업데이트 소식.",
      join: "기강 러닝크루 가입 신청. 양재천·강남 정기 모임 장소와 시간, 크루 규칙, 문의 방법을 확인하고 신청하세요.",
      newbie: "기강 러닝크루에 처음 오시는 분을 위한 안내. 가입 절차, 러닝 등급, 안전수칙, 회비를 한 장에 정리했습니다.",
      rules: "기강 러닝크루 회칙 — 함께 달리기 위해 지키는 활동 원칙.",
      terms: "기강 러닝크루 서비스 이용약관.",
      privacy: "기강 러닝크루 개인정보처리방침 — 수집 항목, 이용 목적, 보관 기간.",
      policy: "기강 러닝크루 운영정책 — 안전수칙과 모임 운영 기준.",
      schedule: "기강 러닝크루의 다가오는 러닝·자전거·수영 모임과 참가 대회 일정.",
      races: "기강 러닝크루가 함께 나가는 마라톤·대회 일정과 크루원 참가 현황.",
      records: "기강 러닝크루 종목별 최고 기록. 5K·10K·하프·풀코스 크루원 기록을 모았습니다.",
      projects: "기강 러닝크루의 마일리지런·PB 클래스 등 기간제 활동. 크루원 로그인이 필요합니다.",
      recap: "기강 마일리지런 시즌을 재미로 돌아보는 지면. 크루원 로그인이 필요합니다.",
    },
  },
};

/**
 * 지면 검색 설명 — 지면마다. 그 팀이 다듬은 문장이 없으면 크루 이름으로 만든 **중립 문장**(종목·지역 같은 그 팀 고유 내용은
 * 넣지 않는다 — 모르는 걸 지어내지 않게). 지면 본문(가입 안내·약관)은 아직 기강 것이다 — #650.
 */
export type PageDescriptionKey =
  | "board" | "join" | "newbie" | "rules" | "terms" | "privacy" | "policy"
  | "schedule" | "races" | "records" | "projects" | "recap";

const NEUTRAL_PAGE_DESCRIPTIONS: Record<PageDescriptionKey, (crew: string) => string> = {
  board: (c) => `${c} 공지사항과 업데이트 소식.`,
  join: (c) => `${c} 가입 신청. 모임 장소와 시간, 크루 규칙, 문의 방법을 확인하고 신청하세요.`,
  newbie: (c) => `${c}에 처음 오시는 분을 위한 안내. 가입 절차, 안전수칙, 회비를 한 장에 정리했습니다.`,
  rules: (c) => `${c} 회칙 — 함께 달리기 위해 지키는 활동 원칙.`,
  terms: (c) => `${c} 서비스 이용약관.`,
  privacy: (c) => `${c} 개인정보처리방침 — 수집 항목, 이용 목적, 보관 기간.`,
  policy: (c) => `${c} 운영정책 — 안전수칙과 모임 운영 기준.`,
  schedule: (c) => `${c}의 다가오는 모임과 참가 대회 일정.`,
  races: (c) => `${josa(c, "이/가")} 함께 나가는 대회 일정과 크루원 참가 현황.`,
  records: (c) => `${c} 종목별 최고 기록. 크루원 기록을 모았습니다.`,
  projects: (c) => `${c}의 기간제 활동(프로젝트). 크루원 로그인이 필요합니다.`,
  recap: (c) => `${c} 프로젝트 시즌을 재미로 돌아보는 지면. 크루원 로그인이 필요합니다.`,
};

/** 지면 검색 설명 — 팀 코드 + 그 팀 크루 이름(`TeamCopy.crewName`) */
export function pageDescription(key: PageDescriptionKey, teamCd: string, crewName: string): string {
  return TEAM_VOICE[teamCd]?.pageDescriptions?.[key] ?? NEUTRAL_PAGE_DESCRIPTIONS[key](crewName);
}

/** 팀 기본 크루 이름(말투 표) — 팀 설정을 못 읽었을 때 링크 미리보기 사이트 이름도 같은 이름을 쓰게(`lib/queries/site-metadata.ts`) */
export function teamDefaultCrewName(teamCd: string): string | null {
  return TEAM_VOICE[teamCd]?.crewName ?? null;
}

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
  const voice = TEAM_VOICE[input.teamCd] ?? {};
  // 팀 설정 → 팀 기본 이름(말투 표) → 중립어. 다른 팀 이름으로는 절대 안 물러난다
  const crewName = input.crewName?.trim() || voice.crewName || NEUTRAL_CREW_NAME;
  const memberNoun = input.memberNoun?.trim() || voice.memberNoun || NEUTRAL_MEMBER_NOUN;

  const headlines: string[] = BASE_HEADLINES.map((h) => h.replaceAll("{crew}", crewName));
  // 뒤에서부터 끼워야 앞 자리 번호가 안 밀린다
  for (const { before, text } of [...(voice.extraHeadlines ?? [])].sort((a, b) => b.before - a.before)) {
    headlines.splice(before, 0, text);
  }

  return {
    crewName,
    memberNoun,
    wordmark: input.wordmark?.trim() || voice.wordmark || crewName,
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

/**
 * **화면별로 필요한 칸만** 골라 클라이언트로 넘긴다 — 팀 문구 전체(헤드라인 14줄·한마디 12줄 등)를 통째로 넘기면 페이지를
 * 이동할 때마다 쓰지도 않는 문구가 RSC payload 에 실린다(리뷰 2026-11-11). 타입만 `Pick<>` 으로 좁혀선 소용없다 — 서버는
 * 받은 객체를 그대로 직렬화한다. 서버 페이지가 `pickTeamCopy(copy, ○○_COPY_KEYS)` 로 넘긴다.
 *
 * 키 묶음은 이 파일(클라이언트 아닌 모듈)에 둔다 — "use client" 파일에서 export 한 배열은 서버에서 참조값이 돼 못 쓴다.
 */
export function pickTeamCopy<K extends keyof TeamCopy>(copy: TeamCopy, keys: readonly K[]): Pick<TeamCopy, K> {
  const out = {} as Pick<TeamCopy, K>;
  for (const k of keys) out[k] = copy[k];
  return out;
}

/** 프로필 카드(다이얼로그·상세) */
export const CARD_COPY_KEYS = ["crewName", "memberNoun", "moodLabels", "cardMood"] as const;
export type CardCopy = Pick<TeamCopy, (typeof CARD_COPY_KEYS)[number]>;

/** 마일리지런 기록 폼(단건·다건) — 사진 안내문의 지면 이름·한마디 예시 */
export const ACTIVITY_FORM_COPY_KEYS = ["storyName", "galleryName", "quips"] as const;
export type ActivityFormCopy = Pick<TeamCopy, (typeof ACTIVITY_FORM_COPY_KEYS)[number]>;

/** 홈(전광판) 전체 — 리드·심박·갤러리·현상수배·채널·카드 */
export const STORY_COPY_KEYS = [
  ...CARD_COPY_KEYS,
  "storyName",
  "galleryName",
  "galleryLabel",
  "actvKicker",
  "actvHeadlines",
  "quips",
] as const;
export type StoryCopy = Pick<TeamCopy, (typeof STORY_COPY_KEYS)[number]>;

/** 프로필 탭 — 카드 + 칭호 미리보기 워드마크 + UTMB 해제 문구의 전당 이름 */
export const PROFILE_COPY_KEYS = [...CARD_COPY_KEYS, "wordmark", "hallName"] as const;
export type ProfileCopy = Pick<TeamCopy, (typeof PROFILE_COPY_KEYS)[number]>;

/** PB 팀 사진 — 릴스 뷰어(크루 이름·지면 이름) + 카드 */
export const PB_PHOTOS_COPY_KEYS = [...CARD_COPY_KEYS, "galleryName"] as const;
export type PbPhotosCopy = Pick<TeamCopy, (typeof PB_PHOTOS_COPY_KEYS)[number]>;

/** 더보기 — 채널 머리·도움말, 크루 소개 줄, 푸터 */
export const SETTINGS_COPY_KEYS = ["crewName", "memberNoun", "orgName"] as const;
export type SettingsCopy = Pick<TeamCopy, (typeof SETTINGS_COPY_KEYS)[number]>;

/** 가입 위저드 — 크루 이름·설치 안내 */
export const ONBOARDING_COPY_KEYS = ["crewName", "installPromptTitle"] as const;
export type OnboardingCopy = Pick<TeamCopy, (typeof ONBOARDING_COPY_KEYS)[number]>;
