import HeroSection from "@/components/hero-section";

export default function RulesPage() {
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
        title: "카카오톡 일정 참석여부 표시",
        details: ["벙주를 위해 당일 변경사항은 댓글 or 태그로 알려주세요"],
      },
      {
        id: 4,
        title: "Sport Team 입니다",
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
  };

  return (
    <div className="min-h-screen bg-black">
      <HeroSection
        showHeroContent={false}
        showSliderNav={false}
        overlay={
          <div className="h-full overflow-y-auto">
            <div className="mx-auto flex min-h-full max-w-3xl flex-col px-6 pb-16 pt-20 text-white md:px-12 md:pt-28">
              <h1 className="text-3xl font-bold md:text-4xl">
                {rules.heading}
              </h1>

              <ol className="mt-8 space-y-8 text-white/90">
                {rules.items.map((item) => (
                  <li key={item.id} className="space-y-3">
                    <h2 className="text-lg font-semibold md:text-xl">
                      {item.id}. {item.title}
                    </h2>
                    <ul className="list-disc space-y-2 pl-5 text-white/80">
                      {item.details.map((detail) => (
                        <li key={detail}>{detail}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        }
      />
    </div>
  );
}
