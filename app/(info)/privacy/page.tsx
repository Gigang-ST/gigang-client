/**
 * 개인정보처리방침 페이지를 렌더링합니다.
 * 방침 제목, 시행일, 번호가 매겨진 섹션과 세부 내용을 표시합니다.
 *
 * @returns 개인정보처리방침 페이지 JSX
 */
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
        details: ["이름, 연락처, 생년, 성별, 사진, 계좌번호, 은행명"],
      },
      {
        id: 3,
        title: "개인정보의 보유 및 이용 기간",
        details: [
          "회원 탈퇴 후 1년간 보유 후 파기",
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
        title: "개인정보의 국외 이전",
        details: [
          "이전 국가: 미국",
          "이전 업체: Supabase Inc.",
          "이전 목적: 데이터베이스 및 인증 인프라 운영",
          "이전 항목: 서비스 이용에 필요한 개인정보 전체",
          "보유·이용 기간: 회원 탈퇴 후 1년",
        ],
      },
      {
        id: 7,
        title: "개인정보의 파기 절차 및 방법",
        details: [
          "보유 기간 종료 또는 목적 달성 시 지체 없이 파기",
          "전자파일은 복구 불가능한 방식으로 삭제",
        ],
      },
      {
        id: 8,
        title: "정보주체의 권리",
        details: [
          "개인정보 열람, 정정, 삭제, 처리정지 요구 가능",
          "요청은 아래 책임자 연락처로 접수",
        ],
      },
      {
        id: 9,
        title: "안전성 확보 조치",
        details: [
          "개인정보 접근 권한 최소화",
          "데이터베이스 접근 제어 및 보안 정책 적용",
          "기기 잠금 및 기본 보안 조치 적용",
        ],
      },
      {
        id: 10,
        title: "개인정보 보호 책임자",
        details: ["이현근 (크루장)", "카카오톡 아이디: winsu"],
      },
      {
        id: 11,
        title: "고지의 의무",
        details: ["본 방침은 변경될 수 있으며 변경 시 사전 공지"],
      },
    ],
  };

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col px-6 pb-16 pt-4">
      <h1 className="text-3xl font-bold md:text-4xl">{policy.heading}</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        시행일: {policy.effectiveDate}
      </p>

      <ol className="mt-8 space-y-8 text-muted-foreground">
        {policy.sections.map((section) => (
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
