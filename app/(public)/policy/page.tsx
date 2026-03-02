export default function PolicyPage() {
  const policy = {
    heading: "운영정책",
    effectiveDate: "2026-03-02",
    sections: [
      {
        id: 1,
        title: "안전수칙",
        details: [
          "집결 및 출발 전 준비운동 권장",
          "음주 후 참여 금지",
          "위험 구간에서는 운영진 안내 준수",
        ],
      },
      {
        id: 2,
        title: "출석 및 노쇼",
        details: [
          "참석 여부는 사전에 표시합니다.",
          "사전 취소 없이 불참이 반복될 경우 참여 제한될 수 있습니다.",
        ],
      },
      {
        id: 3,
        title: "사진 및 기록",
        details: [
          "모임 기록 목적의 촬영 및 공유가 있습니다.",
          "외부 게시가 필요한 경우 별도 안내합니다.",
        ],
      },
      {
        id: 4,
        title: "매너 및 금지행위",
        details: [
          "욕설, 비하, 성희롱, 차별 행위 금지",
          "타인 촬영 및 게시 시 사전 동의 필요",
        ],
      },
      {
        id: 5,
        title: "제재",
        details: [
          "경고 후 반복 시 일정 기간 참여 제한 또는 제명될 수 있습니다.",
        ],
      },
      {
        id: 6,
        title: "정책 변경",
        details: ["변경 사항은 사전에 공지합니다."],
      },
    ],
  };

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col px-6 pb-16 pt-20 text-white md:px-12 md:pt-28">
      <h1 className="text-3xl font-bold md:text-4xl">{policy.heading}</h1>
      <p className="mt-3 text-sm text-white/70">
        시행일: {policy.effectiveDate}
      </p>

      <ol className="mt-8 space-y-8 text-white/90">
        {policy.sections.map((section) => (
          <li key={section.id} className="space-y-3">
            <h2 className="text-lg font-semibold md:text-xl">
              {section.id}. {section.title}
            </h2>
            <ul className="list-disc space-y-2 pl-5 text-white/80">
              {section.details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}
