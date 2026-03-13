
const intro = {
  heading: "기강단 소개",
  paragraphs: [
    "운동을 좋아하는 사람들이 모여 만든 스포츠 팀입니다.",
    "저희는 같이 운동하고 대회를 나가고 놀러 다니며 즐겁게 노는 것이 가장 중요합니다.",
    "운동이 처음이라면 즐기는데 조금 힘들겠지만 수많은 초보자를 키워 온 다수의 고인물들이 도와드립니다.",
    "겁날 수 있지만 일단 나와서 즐기다 가세요.",
  ],
};

const highlights = {
  ageRange: "20-30 러닝크루",
  activityArea: "강남, 양재천, 교대, 반포, 한강 및 그 외",
  primaryActivities: ["러닝", "자전거", "수영", "여행"],
};

const meetingPlaces = {
  heading: "주요 모임장소",
  items: [
    {
      id: 1,
      title: "영동2교 집합",
      description:
        "영동2교 하부 양재천 남쪽 방면에서 준비운동을 하고 출발합니다.",
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
        "트랙 훈련을 할 때는 주로 교대에서 진행하며 구령대 남쪽 방면에 집합합니다.",
      image:
        "https://prod-files-secure.s3.us-west-2.amazonaws.com/3f9c3cb2-230f-4166-8bcb-d730344dc3da/a04c4bce-7cd5-4b21-b295-49f8fd88f5ed/image.png",
      alt: "교대 트랙 집합 위치",
    },
  ],
};

const rules = {
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
      title: "카카오톡 일정 참석 여부 표시",
        details: ["벙주를 위해 당일 변경 사항은 댓글 또는 태그로 알려 주세요."],
    },
    {
      id: 4,
      title: "Sport Team입니다.",
      details: [
        "런닝, 자전거, 수영, 등산, 트레일런, 클라이밍, 탁구, 배드민턴 외 다수 벙 가능",
      ],
    },
    {
      id: 5,
      title: "기타",
      details: [
        "지각 시 스쿼트 50회, 연속 지각 시 +10 누적",
        "참석 취소 시 불참으로 누르기",
        "일정에 🔥 표시가 있으면 중요 일정입니다. (회비 사용가능)",
      ],
    },
  ],
};

const requests = {
  heading: "요청사항",
  note: "자주 바뀔 수 있어요.",
  items: [
    {
      id: 1,
      title: "JRC 인스타 팔로우 해 주세요.",
      href: "http://www.instagram.com/team_gigang",
      description: "Instagram (@team_gigang)",
    },
    {
      id: 2,
      title: "카카오톡 오픈채팅 💟 눌러 주세요.",
      description: "이미지 안내 참고",
    },
    {
      id: 3,
      title: "소모임 가입해 주세요.",
      href: "https://www.somoim.co.kr/3beed52a-0620-11ef-a71d-0aebcbdc4a071",
      description: "가입 후 하트도 눌러 주세요.",
    },
  ],
};

const contact = {
  heading: "문의사항, 연락 주세요.",
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
      label: "기강 공지사항 - November 19, 2025",
      href: "https://www.notion.so/15f57183edbf807fbab8d486a22ce7e1?pvs=21",
    },
  ],
};

const feeRule = rules.items.find((item) => item.id === 5);

export default function JoinPage() {
  return (
    <div className="mx-auto flex min-h-full max-w-xl flex-col px-6 pb-16 pt-4">
      <h1 className="text-3xl font-bold md:text-4xl">가입안내</h1>

      <section className="mt-8 space-y-3">
        {intro.paragraphs.map((p, i) => (
          <p key={i} className="text-muted-foreground leading-relaxed">
            {p}
          </p>
        ))}
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="text-xl font-semibold">활동 정보</h2>
        <dl className="space-y-2 text-muted-foreground">
          <div className="flex gap-2">
            <dt className="font-medium text-foreground">연령대</dt>
            <dd>{highlights.ageRange}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-medium text-foreground">활동지역</dt>
            <dd>{highlights.activityArea}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-medium text-foreground">주요 활동</dt>
            <dd>{highlights.primaryActivities.join(", ")}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-xl font-semibold">{meetingPlaces.heading}</h2>
        <div className="space-y-3">
          {meetingPlaces.items.map((place) => (
            <div
              key={place.id}
              className="rounded-lg border border-border bg-secondary p-4"
            >
              <h3 className="font-medium">{place.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {place.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {feeRule && (
        <section className="mt-10 space-y-3">
          <h2 className="text-xl font-semibold">{feeRule.title}</h2>
          <ul className="space-y-1 text-muted-foreground">
            {feeRule.details.map((detail, i) => (
              <li key={i} className="leading-relaxed">
                {detail}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10 space-y-3">
        <h2 className="text-xl font-semibold">{requests.heading}</h2>
        <p className="text-sm text-muted-foreground">{requests.note}</p>
        <ul className="space-y-2">
          {requests.items.map((item) => (
            <li key={item.id} className="text-muted-foreground">
              {item.href ? (
                <a
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  {item.title}
                </a>
              ) : (
                <span>{item.title}</span>
              )}
              {item.description && (
                <span className="ml-2 text-sm text-muted-foreground">
                  ({item.description})
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="text-xl font-semibold">{contact.heading}</h2>
        <p className="text-muted-foreground">{contact.description}</p>
        <div className="space-y-2">
          {contact.people.map((person, i) => (
            <div
              key={i}
              className="rounded-lg border border-border bg-secondary p-3 text-sm"
            >
              <span className="font-medium">{person.role}</span>
              {person.instagram && (
                <span className="ml-3 text-muted-foreground">
                  IG {person.instagram}
                </span>
              )}
              {person.kakaoId && (
                <span className="ml-3 text-muted-foreground">
                  카카오 {person.kakaoId}
                </span>
              )}
            </div>
          ))}
        </div>
      </section>

    </div>
  );
}
