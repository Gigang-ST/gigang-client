export default function TermsPage() {
  const terms = {
    heading: "이용약관",
    effectiveDate: "2026-03-02",
    sections: [
      {
        id: 1,
        title: "목적",
        details: [
          "본 약관은 러닝 크루 서비스 이용에 관한 권리, 의무 및 책임사항을 규정합니다.",
        ],
      },
      {
        id: 2,
        title: "회원",
        details: [
          "가입 시 정확한 정보를 제공합니다.",
          "운영진의 안내 및 공지를 준수합니다.",
        ],
      },
      {
        id: 3,
        title: "서비스",
        details: ["정기 및 비정기 러닝 모임 운영", "일정 및 공지 제공"],
      },
      {
        id: 4,
        title: "회비 및 결제",
        details: [
          "회비는 계좌이체로 납부합니다.",
          "금액과 납부 기한은 공지합니다.",
        ],
      },
      {
        id: 5,
        title: "금지행위",
        details: [
          "타인에게 불쾌감을 주는 행위",
          "안전수칙 위반",
          "허위정보 기재",
        ],
      },
      {
        id: 6,
        title: "서비스 변경 및 종료",
        details: [
          "운영 사정에 따라 일정이 변경 또는 취소될 수 있습니다.",
        ],
      },
      {
        id: 7,
        title: "책임 제한",
        details: [
          "개인 부주의로 인한 사고는 회원 본인 책임입니다.",
          "다만, 크루의 중대한 과실이 있는 경우는 제외합니다.",
        ],
      },
      {
        id: 8,
        title: "분쟁 해결",
        details: ["상호 협의로 해결하며 관련 법령에 따릅니다."],
      },
    ],
  };

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col px-6 pb-16 pt-4">
      <h1 className="text-3xl font-bold md:text-4xl">{terms.heading}</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        시행일: {terms.effectiveDate}
      </p>

      <ol className="mt-8 space-y-8 text-muted-foreground">
        {terms.sections.map((section) => (
          <li key={section.id} className="space-y-3">
            <h2 className="text-lg font-semibold md:text-xl">
              {section.id}. {section.title}
            </h2>
            <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
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
