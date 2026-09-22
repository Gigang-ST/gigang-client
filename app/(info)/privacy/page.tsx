import type { Metadata } from "next";

/**
 * 약관류는 열려 있지만 검색으로 찾아올 지면이 아니다 — `robots.ts`에서 크롤을 막고
 * 여기서 `index: false`로 한 번 더 못박는다. 그래도 제목·설명은 고유해야 한다:
 * 비워 두면 루트 값을 상속해 **홈과 같은 제목·설명을 쓰는 문서**가 되고, 네이버는
 * 그걸 중복 문서로 본다(웹마스터 가이드 「동일 설명문 발견」).
 */
export const metadata: Metadata = {
  title: "개인정보처리방침",
  description: "기강 러닝크루 개인정보처리방침 — 수집 항목, 이용 목적, 보관 기간.",
  robots: { index: false, follow: true },
};

export default function PrivacyPage() {
  const policy = {
    heading: "개인정보처리방침",
    effectiveDate: "2026-09-30",
    history: ["2026-03-26 제정", "2026-09-30 개정 — 수집 항목·위탁·국외 이전 보완, 쿠키·연령·권익침해 구제 조항 추가"],
    sections: [
      {
        id: 1,
        title: "개인정보의 처리 목적",
        details: [
          "크루 가입 및 회원 관리",
          "모임 일정 안내 및 공지 전달(앱 알림·웹 푸시 포함)",
          "회비(계좌이체) 입금 확인 및 회비 잔액 관리",
          "활동 기록·사진 공유 및 크루 내 기록 랭킹·프로필 카드 제공",
          "대회 기록증 사진에서 기록을 읽어 자동 입력(이용자가 요청한 경우)",
        ],
      },
      {
        id: 2,
        title: "처리하는 개인정보 항목",
        details: [
          "회원 정보: 이름, 연락처, 생년월일, 성별, 이메일, 프로필 사진, 소셜 로그인 식별자(카카오·구글)",
          "회비 정보: 계좌번호(선택), 은행명(선택), 회비 입금 내역(입금자명·금액·일시)",
          "러닝 프로필(선택): 가까운 역, 평균 페이스·거리, 가입 목적, 가입 경로",
          "활동 정보: 모임 참석 이력, 대회 기록, 기록증 사진, UTMB 프로필 주소 및 지수, 게시한 사진·글·댓글",
          "자동 수집 정보: 접속 기록(IP 주소, 접속 일시, 브라우저 정보), 쿠키, 웹 푸시 구독 정보",
        ],
      },
      {
        id: 3,
        title: "개인정보의 보유 및 이용 기간",
        details: [
          "회원 탈퇴 후 1년간 보유 후 파기",
          "관계 법령에서 보존을 요구하는 정보는 해당 법령이 정한 기간 동안 보존",
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
        details: [
          "Supabase Inc.: 데이터베이스·인증·파일(사진) 저장 인프라 운영",
          "Vercel Inc.: 웹 서비스 호스팅 및 서버 운영(서울 리전)",
          "Google LLC: 대회 기록증 사진 인식(Gemini API)",
          "웹 푸시 전송: 이용자 브라우저 제공사의 푸시 서버(Google, Apple, Mozilla 등)",
        ],
      },
      {
        id: 6,
        title: "개인정보의 국외 이전",
        details: [
          "① Supabase Inc. — 이전 국가: 일본(도쿄 리전) · 연락처: https://supabase.com/privacy",
          "이전 목적: 데이터베이스·인증·파일 저장 인프라 운영",
          "이전 항목: 제2조의 개인정보 전체(접속 기록 제외), 회원 식별자(UUID), 가입일시, OAuth 제공자 정보",
          "이전 일시·방법: 서비스 이용 시점마다 네트워크를 통해 전송",
          "보유·이용 기간: 회원 탈퇴 후 1년",
          "② Google LLC — 이전 국가: 미국 · 연락처: https://policies.google.com/privacy",
          "이전 목적: 대회 기록증 사진에서 기록 추출",
          "이전 항목: 이용자가 올린 기록증 사진(사진에 담긴 이름·기록 포함)",
          "이전 일시·방법: 이용자가 기록증 인식을 요청할 때 네트워크를 통해 전송",
          "보유·이용 기간: 인식 결과만 돌려받으며 크루는 해당 사진을 저장하지 않음(Google 측 보관은 Google 정책에 따름)",
          "거부 방법 및 불이익: Supabase 이전을 거부하면 서비스를 이용할 수 없습니다. 기록증 인식은 사용하지 않고 기록을 직접 입력할 수 있으며, 이 경우 Google로 이전되지 않습니다.",
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
          "요청은 아래 책임자 연락처로 접수하며, 접수일로부터 10일 이내에 조치 결과를 알려드립니다.",
          "이름·프로필 사진·러닝 프로필 등은 앱의 프로필 수정 화면에서 직접 정정할 수 있습니다.",
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
        title: "쿠키 등 자동 수집 장치의 설치·운영 및 거부",
        details: [
          "로그인 상태 유지와 화면 설정(주 시작 요일, 다크모드, 화면 폭 등) 저장을 위해 쿠키 및 브라우저 저장소를 사용합니다.",
          "광고·추적 목적의 쿠키는 사용하지 않습니다.",
          "브라우저 설정에서 쿠키 저장을 거부할 수 있으나, 이 경우 로그인이 유지되지 않아 서비스 이용이 제한됩니다.",
        ],
      },
      {
        id: 11,
        title: "가입 연령",
        details: [
          "기강은 1986년생부터 성인까지 가입할 수 있으며, 미성년자의 개인정보는 수집하지 않습니다.",
          "가입 연령에 해당하지 않는 사실이 확인되면 해당 정보를 지체 없이 파기합니다.",
        ],
      },
      {
        id: 12,
        title: "개인정보 보호 책임자",
        details: ["이현근 (크루장)", "이메일: team.gigang@gmail.com"],
      },
      {
        id: 13,
        title: "권익침해 구제 방법",
        details: [
          "개인정보 침해에 대한 신고나 상담이 필요하면 아래 기관에 문의할 수 있습니다.",
          "개인정보분쟁조정위원회: 1833-6972 (www.kopico.go.kr)",
          "개인정보침해신고센터: 118 (privacy.kisa.or.kr)",
          "대검찰청: 1301 (www.spo.go.kr)",
          "경찰청: 182 (ecrm.police.go.kr)",
        ],
      },
      {
        id: 14,
        title: "고지의 의무",
        details: ["본 방침은 변경될 수 있으며 변경 시 시행 7일 전에 앱 공지사항으로 알립니다."],
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
