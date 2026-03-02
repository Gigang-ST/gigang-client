export default function PrivacyPage() {
  const policy = {
    heading: "개인정보처리방침",
    effectiveDate: "2026-03-02",
    sections: [
      {
        id: 1,
        title: "개인정보의 처리 목적",
        details: [
          "크루 가입 및 회원 관리",
          "모임 일정 안내 및 공지 전달",
          "회비(계좌이체) 입금 확인",
          "활동 기록 및 사진 공유",
        ],
      },
      {
        id: 2,
        title: "처리하는 개인정보 항목",
        details: ["이름, 연락처, 생년, 성별, 사진"],
      },
      {
        id: 3,
        title: "개인정보의 보유 및 이용 기간",
        details: [
          "회원 탈퇴 시까지 보유",
          "관련 법령에 따라 보관이 필요한 경우 해당 기간 동안 보관",
        ],
      },
      {
        id: 4,
        title: "개인정보의 제3자 제공",
        details: ["현재 제3자 제공 없음"],
      },
      {
        id: 5,
        title: "개인정보 처리의 위탁",
        details: ["현재 위탁 없음"],
      },
      {
        id: 6,
        title: "개인정보의 파기 절차 및 방법",
        details: [
          "보유 기간 종료 또는 목적 달성 시 지체 없이 파기",
          "전자파일은 복구 불가능한 방식으로 삭제",
        ],
      },
      {
        id: 7,
        title: "정보주체의 권리",
        details: [
          "개인정보 열람, 정정, 삭제, 처리정지 요구 가능",
          "요청은 아래 책임자 연락처로 접수",
        ],
      },
      {
        id: 8,
        title: "안전성 확보 조치",
        details: [
          "개인정보 접근 권한 최소화",
          "엑셀 파일 비밀번호 설정 및 접근 제한",
          "기기 잠금 및 기본 보안 조치 적용",
        ],
      },
      {
        id: 9,
        title: "개인정보 보호 책임자",
        details: ["이현근 (크루장)", "연락처: 010-1234-5678"],
      },
      {
        id: 10,
        title: "고지의 의무",
        details: ["본 방침은 변경될 수 있으며 변경 시 사전 공지"],
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
