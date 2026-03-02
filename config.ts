type NavItem = {
  label: string;
  href: string;
};

type LinkItem = {
  label: string;
  href: string;
};

type MeetingPlace = {
  id: number;
  title: string;
  description: string;
  image: string;
  alt: string;
};

type RequestItem = {
  id: number;
  title: string;
  description?: string;
  href?: string;
};

type RuleItem = {
  id: number;
  title: string;
  details: string[];
};

type ContactPerson = {
  role: string;
  instagram?: string;
  kakaoId?: string;
};

type SiteContent = {
  metadata: {
    title: string;
    description: string;
    generator: string;
  };
  brand: {
    shortName: string;
    fullName: string;
  };
  navigation: {
    items: NavItem[];
    toggleLabel: string;
  };
  hero: {
    titleLines: string[];
    subtitle: string;
    subtitleLines?: string[];
    ctaLabel: string;
    slideAltPrefix: string;
    aria: {
      previousSlide: string;
      nextSlide: string;
      goToSlidePrefix: string;
      slidePrefix: string;
    };
  };
  intro: {
    heading: string;
    paragraphs: string[];
  };
  highlights: {
    ageRange: string;
    activityArea: string;
    primaryActivities: string[];
  };
  meetingPlaces: {
    heading: string;
    items: MeetingPlace[];
  };
  requests: {
    heading: string;
    note: string;
    items: RequestItem[];
  };
  rules: {
    heading: string;
    items: RuleItem[];
  };
  contact: {
    heading: string;
    description: string;
    people: ContactPerson[];
    links: LinkItem[];
  };
};

export const siteContent: SiteContent = {
  metadata: {
    title: "기강",
    description:
      "운동을 좋아하는 사람들이 모여 만든 스포츠 팀. 러닝, 자전거, 수영, 여행을 함께합니다.",
    generator: "gigang.run",
  },
  brand: {
    shortName: "기강",
    fullName: "기강",
  },
  navigation: {
    items: [
      { label: "회칙", href: "/rules" },
      { label: "대회참여", href: "/races" },
      { label: "기강의전당", href: "/records" },
      { label: "가입안내", href: "/join" },
      {
        label: "소모임",
        href: "https://www.somoim.co.kr/3beed52a-0620-11ef-a71d-0aebcbdc4a071",
      },
      { label: "인스타그램", href: "http://www.instagram.com/team_gigang" },
      { label: "카카오톡", href: "https://open.kakao.com/o/grnMFGng" },
      {
        label: "가민 그룹",
        href: "https://connect.garmin.com/app/group/4857390",
      },
    ],
    toggleLabel: "메뉴 열기",
  },
  hero: {
    titleLines: ["기강"],
    subtitle: "놀다 보니 강해진다 !",
    subtitleLines: [
      "예의는 지키고 땀은 솔직하게, 운동은 같이",
      "가볍지 않게 오래 가는 기강단",
    ],
    ctaLabel: "문의하기",
    slideAltPrefix: "기강단 러닝크루 히어로 이미지",
    aria: {
      previousSlide: "이전 슬라이드",
      nextSlide: "다음 슬라이드",
      goToSlidePrefix: "슬라이드로 이동",
      slidePrefix: "슬라이드",
    },
  },
  intro: {
    heading: "기강단 소개",
    paragraphs: [
      "운동을 좋아하는 사람들이 모여 만든 스포츠 팀 입니다.",
      "저희는 같이 운동하고 대회나가고 놀러다니며 즐겁게 노는것이 가장 중요합니다.",
      "운동이 처음이라면 즐기는데 조금 힘들겠지만 수 많은 초보자를 키워온 다수의 고인물들이 도와드립니다.",
      "겁날 수 있지만 일단 나와서 즐기다 가세요.",
    ],
  },
  highlights: {
    ageRange: "20-30 러닝크루",
    activityArea: "강남, 양재천, 교대, 반포, 한강 및 그외",
    primaryActivities: ["러닝", "자전거", "수영", "여행"],
  },
  meetingPlaces: {
    heading: "주요 모임장소",
    items: [
      {
        id: 1,
        title: "영동2교 집합",
        description:
          "영동2교 하부 양재천 남쪽방면에서 준비운동을 하고 출발합니다.",
        image:
          "https://prod-files-secure.s3.us-west-2.amazonaws.com/3f9c3cb2-230f-4166-8bcb-d730344dc3da/802b99dd-95e3-42ba-a302-35a07e82563f/image.png",
        alt: "영동2교 집합 위치",
      },
      {
        id: 2,
        title: "영동2교 코스",
        description:
          "5K, 8K 코스가 있지만 참여자의 실력에 따라 맞춰 운동합니다.",
        image:
          "https://prod-files-secure.s3.us-west-2.amazonaws.com/3f9c3cb2-230f-4166-8bcb-d730344dc3da/b1d21b43-b3cb-4288-bb3a-9d14868e76e7/image.png",
        alt: "영동2교 코스 안내",
      },
      {
        id: 3,
        title: "교대 트랙",
        description:
          "트랙 훈련을 할 때는 주로 교대에서 진행하며 구령대 남쪽방면에 집합합니다.",
        image:
          "https://prod-files-secure.s3.us-west-2.amazonaws.com/3f9c3cb2-230f-4166-8bcb-d730344dc3da/a04c4bce-7cd5-4b21-b295-49f8fd88f5ed/image.png",
        alt: "교대 트랙 집합 위치",
      },
    ],
  },
  requests: {
    heading: "요청사항",
    note: "자주 바뀔 수 있어요.",
    items: [
      {
        id: 1,
        title: "JRC 인스타 팔로우 해주세요",
        href: "http://www.instagram.com/team_gigang",
        description: "인스타그램 (@team_gigang)",
      },
      {
        id: 2,
        title: "카카오톡 오픈채팅 💟 눌러주세요",
        description: "이미지 안내 참고",
      },
      {
        id: 3,
        title: "소모임 가입해주세요",
        href: "https://www.somoim.co.kr/3beed52a-0620-11ef-a71d-0aebcbdc4a071",
        description: "가입 후 하트도 눌러주세요",
      },
    ],
  },
  rules: {
    heading: "회칙",
    items: [
      {
        id: 1,
        title: "정보 공유 및 모임 개설",
        details: ["모임원 누구든 자유롭게 정보 공유 및 모임 개설 가능"],
      },
      {
        id: 2,
        title: "나이 제한",
        details: [
          "20 ~ 35 세 사이 (00년생 ~ 90년생)",
          "지인 소개 가입은 나이제한 없음",
        ],
      },
      {
        id: 3,
        title: "카카오톡 일정 참석여부 표시",
        details: ["벙주를 위해 당일 변경사항은 댓글 또는 태그로 알려주세요"],
      },
      {
        id: 4,
        title: "스포츠 팀입니다",
        details: [
          "런닝, 자전거, 수영, 등산, 트레일런, 클라이밍, 탁구, 배드민턴 외 다수 벙 가능",
        ],
      },
      {
        id: 5,
        title: "기타",
        details: [
          "지각시 스쿼트 50회 연속지각시 +10 누적",
          "참석 취소시 불참으로 누르기",
          "일정에 🔥 표시가 있으면 중요 일정입니다 (회비 사용 할 수도 있음)",
        ],
      },
    ],
  },
  contact: {
    heading: "문의사항 연락주세요",
    description: "궁금한 점이 있으면 아래로 연락 주세요.",
    people: [
      {
        role: "기강단장",
        instagram: "@leegun_indie_pnk",
        kakaoId: "winsu",
      },
      {
        role: "기강",
        instagram: "@temagignag",
      },
    ],
    links: [
      {
        label: "러닝크루 안전수칙",
        href: "https://www.notion.so/0295481a95f346a382705202830c6ae9?pvs=21",
      },
      {
        label: "회칙",
        href: "https://www.notion.so/e8e9be02b19a4ad48fd273658546ed5a?pvs=21",
      },
      {
        label: "기강 공지사항 - 2025년 11월 19일",
        href: "https://www.notion.so/15f57183edbf807fbab8d486a22ce7e1?pvs=21",
      },
    ],
  },
};
