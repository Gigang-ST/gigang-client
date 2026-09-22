import type { Metadata } from "next";

/**
 * 약관류는 열려 있지만 검색으로 찾아올 지면이 아니다 — `robots.ts`에서 크롤을 막고
 * 여기서 `index: false`로 한 번 더 못박는다. 그래도 제목·설명은 고유해야 한다:
 * 비워 두면 루트 값을 상속해 **홈과 같은 제목·설명을 쓰는 문서**가 되고, 네이버는
 * 그걸 중복 문서로 본다(웹마스터 가이드 「동일 설명문 발견」).
 */
export const metadata: Metadata = {
  title: "이용약관",
  description: "기강 러닝크루 서비스 이용약관.",
  robots: { index: false, follow: true },
};

export default function TermsPage() {
  const terms = {
    heading: "이용약관",
    effectiveDate: "2026-09-30",
    history: ["2026-03-02 제정", "2026-09-30 개정 — 가입 자격·게시물·기록 공개·탈퇴·약관 변경 조항 추가"],
    sections: [
      {
        id: 1,
        title: "목적",
        details: [
          "본 약관은 러닝크루 기강(이하 \"크루\")과 기강 앱(gigang.team) 이용에 관한 권리, 의무 및 책임사항을 규정합니다.",
        ],
      },
      {
        id: 2,
        title: "가입 자격",
        details: [
          "1986년생부터 성인까지 가입할 수 있습니다.",
          "가입 자격을 충족하지 않는 사실이 확인되면 가입이 취소될 수 있습니다.",
        ],
      },
      {
        id: 3,
        title: "회원의 의무",
        details: [
          "가입 시 정확한 정보를 제공합니다.",
          "운영진의 안내 및 공지, 운영정책을 준수합니다.",
          "로그인에 사용하는 카카오·구글 계정은 본인이 관리하며, 타인에게 양도하거나 빌려주지 않습니다.",
        ],
      },
      {
        id: 4,
        title: "서비스",
        details: [
          "정기 및 비정기 러닝 모임 운영",
          "일정·공지 제공 및 앱 알림(웹 푸시) 발송",
          "대회 기록 관리 및 크루 내 기록 랭킹",
          "사진·글 공유(깅스타그램), 댓글",
          "마일리지런 등 크루 프로젝트 운영",
        ],
      },
      {
        id: 5,
        title: "기록 및 프로필 공개",
        details: [
          "회원의 이름, 프로필 사진, 한마디, 러닝 프로필, 대회 기록, 칭호는 기강 앱에 공개되며, 로그인하지 않은 방문자도 볼 수 있습니다.",
          "대회 기록은 이름과 함께 기록 랭킹(기강의 전당)에 표시됩니다.",
        ],
      },
      {
        id: 6,
        title: "게시물",
        details: [
          "회원이 올린 사진·글·댓글의 저작권은 작성자에게 있습니다.",
          "크루는 회원의 게시물을 기강 앱에 노출하고, 크루 공식 SNS(인스타그램 등)에 게시할 수 있습니다.",
          "크루 공식 SNS에 게시된 사진은 본인이 요청하면 삭제합니다.",
          "운영진은 금지 행위에 해당하거나 타인의 권리를 침해하는 게시물을 사전 통지 없이 삭제할 수 있습니다.",
        ],
      },
      {
        id: 7,
        title: "회비 및 결제",
        details: [
          "회비는 계좌이체로 납부합니다.",
          "금액과 납부 기한은 공지합니다.",
        ],
      },
      {
        id: 8,
        title: "금지 행위",
        details: [
          "타인에게 불쾌감을 주는 행위",
          "안전 수칙 위반",
          "허위 정보 기재",
          "타인의 계정 사용 또는 서비스 운영을 방해하는 행위",
        ],
      },
      {
        id: 9,
        title: "탈퇴 및 자격 제한",
        details: [
          "회원은 운영진에게 요청하여 탈퇴할 수 있습니다.",
          "운영정책에 따라 회원 자격이 비활성 처리되거나 제명될 수 있습니다.",
        ],
      },
      {
        id: 10,
        title: "서비스 변경 및 종료",
        details: [
          "운영 사정에 따라 일정이 변경 또는 취소될 수 있습니다.",
          "앱의 기능은 운영 사정에 따라 추가·변경·중단될 수 있습니다.",
        ],
      },
      {
        id: 11,
        title: "책임 제한",
        details: [
          "개인 부주의로 인한 사고는 회원 본인 책임입니다.",
          "다만, 크루의 중대한 과실이 있는 경우는 제외합니다.",
        ],
      },
      {
        id: 12,
        title: "약관의 변경",
        details: ["약관을 변경하는 경우 시행 7일 전에 앱 공지사항으로 알립니다."],
      },
      {
        id: 13,
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

      <div className="mt-10 space-y-1 text-sm text-muted-foreground">
        <p className="font-semibold">변경 이력</p>
        {terms.history.map((h) => (
          <p key={h}>{h}</p>
        ))}
      </div>
    </div>
  );
}
