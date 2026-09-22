import type { Metadata } from "next";

/**
 * 약관류는 열려 있지만 검색으로 찾아올 지면이 아니다 — `robots.ts`에서 크롤을 막고
 * 여기서 `index: false`로 한 번 더 못박는다. 그래도 제목·설명은 고유해야 한다:
 * 비워 두면 루트 값을 상속해 **홈과 같은 제목·설명을 쓰는 문서**가 되고, 네이버는
 * 그걸 중복 문서로 본다(웹마스터 가이드 「동일 설명문 발견」).
 */
export const metadata: Metadata = {
  title: "운영정책",
  description: "기강 러닝크루 운영정책 — 안전수칙과 모임 운영 기준.",
  robots: { index: false, follow: true },
};

export default function PolicyPage() {
  const policy = {
    heading: "운영정책",
    effectiveDate: "2026-09-30",
    history: ["2026-03-02 제정", "2026-09-30 개정 — 사진 게시·제재 절차·비활성 조항 정비"],
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
          "모임 중 촬영한 사진은 기강 앱과 크루 공식 인스타그램 등 SNS에 게시될 수 있습니다.",
          "게시를 원하지 않는 사진은 운영진에게 요청하면 삭제합니다.",
        ],
      },
      {
        id: 4,
        title: "매너 및 금지행위",
        details: [
          "욕설, 비하, 성희롱, 차별 행위 금지",
          "촬영을 원하지 않는 회원의 의사를 존중합니다.",
        ],
      },
      {
        id: 5,
        title: "제재",
        details: [
          "운영정책 위반 시 먼저 경고하며, 제재 전에 사유를 알리고 소명할 기회를 드립니다.",
          "경고 후에도 반복되면 일정 기간 참여 제한 또는 제명될 수 있습니다.",
        ],
      },
      {
        id: 6,
        title: "비활성 회원",
        details: [
          "회원은 운영진에게 요청하여 비활성 상태로 전환할 수 있습니다.",
          "운영진은 운영정책에 따라 회원을 비활성 처리할 수 있습니다.",
          "비활성 회원은 모임 참여·기록 등록 등 크루 활동이 제한되며, 활동을 재개하려면 운영진 승인이 필요합니다.",
        ],
      },
      {
        id: 7,
        title: "정책 변경",
        details: ["변경 사항은 시행 7일 전에 앱 공지사항으로 알립니다."],
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

      <div className="mt-10 space-y-1 text-sm text-muted-foreground">
        <p className="font-semibold">변경 이력</p>
        {policy.history.map((h) => (
          <p key={h}>{h}</p>
        ))}
      </div>
    </div>
  );
}
