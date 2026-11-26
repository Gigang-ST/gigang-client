/**
 * 기강 소개 페이지(`/about`, 이슈 #752) 글·사진 모음 — 문구를 고칠 땐 이 파일만 만진다.
 *
 * ⚠️ 확정 전 항목은 `PENDING_*` 상수에 따로 모았다. 확정되면 값만 바꾸고 이름에서 `PENDING_`을 뗀다.
 * 사진 중 얼굴이 나오는 것은 공개 전 본인 동의가 필요하다(`ABOUT_PHOTO_CONSENT`).
 */

const IMG = "/images/about";

/** 사진 경로 한 곳 — 파일을 바꾸면 여기만 고친다. */
export const ABOUT_PHOTO = {
  hero: `${IMG}/photo_hero.jpg`,
  story: `${IMG}/photo_story.jpg`,
  run: `${IMG}/photo_run.jpg`,
  hyrox: `${IMG}/photo_hyrox.jpg`,
  trail: `${IMG}/photo_trail.jpg`,
  pb: `${IMG}/photo_pb.jpg`,
  pbTrain: `${IMG}/photo_pbtrain.jpg`,
  night: `${IMG}/photo_night.jpg`,
  night2: `${IMG}/photo_night2.jpg`,
  a1: `${IMG}/photo_a1.jpg`,
  a2: `${IMG}/photo_a2.jpg`,
  a4: `${IMG}/photo_a4.jpg`,
  a7: `${IMG}/photo_a7.jpg`,
  a8: `${IMG}/photo_a8.jpg`,
} as const;

/** 얼굴이 나오는 사진 — 공개 전 본인 동의 확인 전까지 운영 반영 금지(PR 본문 참고). */
export const ABOUT_PHOTO_CONSENT = "동의 확인 필요";

/**
 * 자리표시 — 아직 확정되지 않은 문구. 화면에는 그대로 나가므로 확정 전엔 운영(main)에 올리지 않는다.
 * (이슈 #752 두 번째 체크박스: 정기런 요일·장소, 연표 사건)
 */
export const PENDING_REGULAR_RUN = {
  schedule: "격주 수요일 저녁 7시 30분.",
  groups: "고수·중수·초보 조로 나눠 인터벌을 뜁니다.",
} as const;

export const PENDING_TIMELINE = [
  { when: "2024.04", title: "양재천에서 시작", text: "같이 뛸 사람 몇 명이 모인 게 시작이었습니다." },
  { when: "2024 ~ 2025", title: "정기런이 생기다", text: "격주 수요일 저녁, 수준별 조로 나눠 뜁니다." },
  { when: "2026", title: "종목이 늘다", text: "하이록스, 트레일, 동계 훈련 PB클래스. 종목마다 팀이 생겼습니다." },
  { when: "지금", title: "스포츠팀 기강", text: "활동 지역은 양재천, 강남, 교대, 대치유수지, 한강." },
] as const;

export const ABOUT_NAV_LINKS = [
  { href: "#story", label: "STORY" },
  { href: "#what", label: "WHAT WE DO" },
  { href: "#spirit", label: "SPIRIT" },
  { href: "#events", label: "EVENTS" },
  { href: "#archive", label: "ARCHIVE" },
] as const;

export const ABOUT_HERO = {
  slogan: "NO TIME TO BE WEAK",
  titleTop: "기강은",
  titleEm: "스포츠팀",
  titleEnd: "입니다.",
  lead: "러닝도, 하이록스도, 트레일도.",
  leadSub: "종목은 달라도 같이 합니다.",
  photoAlt: "정기런 단체",
  ticker: ["RUNNING", "HYROX", "TRAIL", "PB CLASS", "NO TIME TO BE WEAK"],
} as const;

export const ABOUT_STORY = {
  tag: "01 STORY",
  title: ["혼자 하면 쉬게 되고,", "같이 하면 뛰게 됩니다."],
  paragraphs: [
    ["기강은 2024년 4월 23일에 시작했습니다.", "양재천에서 같이 뛸 사람을 모으는 것으로요."],
    ["지금은 하이록스, 트레일도 합니다.", "같이 훈련하고, 같이 대회에 나갑니다."],
  ],
  strong: ["러닝클럽이 아니라 스포츠팀입니다.", "종목이 늘어도 기세는 그대로입니다."],
  photoAlt: "기강 단체 사진",
} as const;

export type AboutCard = {
  key: string;
  name: string;
  en: string;
  photo: string;
  photoAlt: string;
  position: string;
  /** 사진 왼쪽 위 라벨 */
  label?: string;
  body: readonly (readonly string[])[];
  /** 아래 줄: 굵은 부분 + 나머지 */
  getBold: string;
  getRest: string;
};

export const ABOUT_WHAT = {
  tag: "02 WHAT WE DO",
  title: ["종목은 여럿,", "팀은 하나."],
  lead: ["한 팀에 종목이 여럿 있습니다.", "하고 싶은 것부터 오면 됩니다."],
  cards: [
    {
      key: "run",
      name: "정기런",
      en: "RUNNING",
      photo: ABOUT_PHOTO.run,
      photoAlt: "정기런 트랙 인터벌",
      position: "center 40%",
      label: "RUN",
      body: [[PENDING_REGULAR_RUN.schedule, PENDING_REGULAR_RUN.groups], ["처음이어도 내 조가 있습니다."]],
      getBold: "기강 러너",
      getRest: "가 되는 곳",
    },
    {
      key: "hyrox",
      name: "하이록스 기강",
      en: "HYROX SQUAD",
      photo: ABOUT_PHOTO.hyrox,
      photoAlt: "하이록스 훈련",
      position: "center",
      body: [["러닝과 8개 운동 스테이션.", "일정에서 같이 연습하고, 대회도 같이 나갑니다."]],
      getBold: "하이록스 선수",
      getRest: "가 되는 곳",
    },
    {
      key: "trail",
      name: "트레일 기강",
      en: "TRAIL",
      photo: ABOUT_PHOTO.trail,
      photoAlt: "트레일 정상 단체 사진",
      position: "center 35%",
      body: [["산길을 같이 달립니다.", "트레일러닝 일정에 나오면 됩니다."]],
      getBold: "트레일 러너",
      getRest: "가 되는 곳",
    },
    {
      key: "pb",
      name: "PB클래스",
      en: "WINTER 10K PROJECT",
      photo: ABOUT_PHOTO.pbTrain,
      photoAlt: "PB클래스 야간 트랙 훈련",
      position: "center 70%",
      label: "PB CLASS",
      body: [
        ["12주 동계 훈련.", "기록을 깰 사람과 10K가 처음인 사람이 같이 뜁니다."],
        ["마지막엔 10K 기록을 잽니다."],
      ],
      getBold: "",
      getRest: "사이트 「프로젝트」 탭에서 신청 · 3기 진행 중",
    },
  ] satisfies AboutCard[],
};

export const ABOUT_SPIRIT = {
  tag: "03 GIGANG SPIRIT",
  title: ["NO TIME", "TO BE WEAK."],
  quotes: ["우는 소리 안 하고.", "도전하고.", "하기로 했으면 열심히."],
  paragraphs: [
    ["에너지 넘치고, 약한 소리 안 하는 기세.", "이게 기강정신입니다."],
    ["기강정신이 빠진 사람에겐 장난스럽게 긁습니다.", "긁힌 사람은 오기로 이겨냅니다.", "거기까지가 기강입니다."],
  ],
} as const;

export const ABOUT_EVENTS = {
  tag: "04 SIGNATURE",
  title: "기강이 모이는 날들",
  lead: "평소엔 일정으로 만나고, 가끔 크게 모입니다.",
  items: [
    {
      kicker: "YEAR-END",
      name: "기강의밤",
      body: ["1년을 같이 보낸 사람들의 송년회.", "먹고 마시고, 한 해 자랑(꺼드럭)을 풀어놓습니다."],
      photo: ABOUT_PHOTO.night,
      photoAlt: "2025 송년회 기강의밤",
    },
    {
      kicker: "PROJECT",
      name: "PB클래스 · 동계 훈련",
      body: ["수요일 저녁에 같이 뛰고, 12주 뒤 10K 기록을 잽니다."],
      photo: ABOUT_PHOTO.pbTrain,
      photoAlt: "야간 트랙 훈련",
    },
  ],
} as const;

export const ABOUT_JOIN = {
  tag: "05 JOIN",
  title: "오는 길은 세 단계입니다.",
  steps: [
    { main: "사이트에서 가입", sub: "gigang.team · 카카오 또는 구글 계정" },
    { main: "일정에서 모임 골라 참석 누르기", sub: "정기런부터 오면 가장 쉽습니다." },
    { main: "단톡방에서 같이 이야기", sub: "입장은 홈페이지(gigang.team) 상단 메뉴 ≡ 의 「오픈채팅」에 있습니다." },
  ],
  cta: { label: "gigang.team 가입하기", href: "/" },
  contact: "궁금한 건 인스타 DM으로 물어보세요.",
  instagram: { handle: "@team_gigang", href: "https://www.instagram.com/team_gigang/" },
  note: ["모임 소식과 사진은 인스타에 먼저 올라옵니다.", "사이트는 신청·출석·기록을 하는 곳입니다."],
} as const;

export const ABOUT_ARCHIVE = {
  tag: "06 VISUAL ARCHIVE",
  title: "기강의 장면들",
  lead: "모인 날마다 찍은 사진들입니다.",
  photos: [
    { src: ABOUT_PHOTO.a1, alt: "정기런 출발 단체샷" },
    { src: ABOUT_PHOTO.a2, alt: "인터벌 달리는 모습" },
    { src: ABOUT_PHOTO.hyrox, alt: "하이록스 스테이션" },
    { src: ABOUT_PHOTO.a4, alt: "트레일 정상" },
    { src: ABOUT_PHOTO.pbTrain, alt: "PB클래스" },
    { src: ABOUT_PHOTO.night2, alt: "기강의밤" },
    { src: ABOUT_PHOTO.a7, alt: "기강티" },
    { src: ABOUT_PHOTO.a8, alt: "대회 단체 인증" },
  ],
} as const;

export const ABOUT_FOOTER = {
  lets: "TEAM GIGANG · LET'S GO",
  sub: "RUNNING BASED SPORTS TEAM · SEOUL",
} as const;

export const ABOUT_META = {
  title: "기강 소개 — No time to be weak",
  description: "기강은 스포츠팀입니다. 러닝·하이록스·트레일·PB클래스를 같이 훈련하고 대회에도 같이 나가는 서울 팀을 소개합니다.",
} as const;
