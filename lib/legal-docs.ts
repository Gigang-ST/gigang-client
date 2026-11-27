import { josaOf } from "@/lib/josa";

/**
 * 약관 3종(이용약관·개인정보처리방침·운영정책) 본문 — **팀별로** 만든다(#658). 순수 함수라 회귀 테스트가 팀마다 그려 본다
 * (`lib/__tests__/legal-docs.test.ts`). 지면은 `app/(info)/terms|privacy|policy/page.tsx`, 값을 모으는 건 `lib/queries/legal.ts`.
 *
 * 2026-11-15 전에는 세 문서가 기강 고정이라(「러닝크루 기강과 기강 앱(gigang.team)」·책임자 이현근·86년생) 울산 회원도 기강 문서에
 * 동의하게 됐다. 결정(2026-11-11 hglee): 울산 모비의 운영 주체·개인정보 책임자는 송창준 — 팀 설정 `legal.operator` 로 넣는다.
 *
 * ## 무엇이 팀마다 갈리나
 * - **크루 이름·앱 주소·전당/사진 지면 이름** — 팀 문구(`TeamCopy`)와 요청 주소에서.
 * - **운영 주체·책임자·연락처** — 팀 설정 `legal.operator`·`legal.contact`. 비어 있으면 연락처를 지어내지 않고 운영진 문의로 안내한다.
 * - **회비·칭호** — 그 기능을 끈 팀(울산 회비·칭호 끔)은 그 조항·항목을 싣지 않는다(안 하는 일에 동의를 받지 않는다).
 * - **가입 연령·서비스 목록·시행일** — 팀이 정한 문장(아래 `TEAM_LEGAL`). 없는 팀은 중립 문장 — 나이 제한 같은 그 팀 고유 규칙은
 *   지어내지 않고 「크루가 공지한 기준」으로 둔다.
 *
 * **기강 문서는 2026-11-15 이전 문장과 한 글자도 다르지 않다** — 테스트가 지킨다. 기강 문장을 고치면 시행일·변경 이력도 같이 고친다.
 */

export type LegalSection = { id: number; title: string; details: string[] };
export type LegalDoc = { heading: string; effectiveDate: string; history: string[]; sections: LegalSection[] };
export type LegalDocKind = "terms" | "privacy" | "policy";

export type LegalContext = {
  teamCd: string;
  /** 크루 이름(팀 문구) */
  crewName: string;
  /** 「{이름}의 전당」(팀 문구) */
  hallName: string;
  /** 사진 지면 이름(팀 문구 — 기강 「깅스타그램」, 그 밖 「갤러리」) */
  galleryName: string;
  /** 앱 주소(정식 주소의 호스트 — 「gigang.team」). 없으면 주소 없이 「○○ 앱」 */
  appHost: string | null;
  /** 팀 설정 `legal.operator` */
  operator: string | null;
  /** 팀 설정 `legal.contact` */
  contact: string | null;
  /** 팀 설정 `feature.dues` */
  duesEnabled: boolean;
  /** 팀 설정 `feature.titles` */
  titlesEnabled: boolean;
  /**
   * 팀 설정 `feature.running_profile` — 끈 팀(모비)은 러닝 프로필을 받지 않으므로 수집·공개 항목에서 뺀다. 생략하면 켬
   * (기강 문서는 2026-11-15 이전 문장 그대로).
   */
  runningProfileEnabled?: boolean;
};

/** 문서별 시행일·변경 이력 */
type DocMeta = { effectiveDate: string; history: string[] };

/** 고정 문장 목록, 또는 크루 이름 등 팀 문구를 받아 만드는 목록 */
type TeamLines = string[] | ((ctx: Pick<LegalContext, "crewName" | "galleryName">) => string[]);

function linesOf(v: TeamLines | undefined, ctx: LegalContext): string[] | undefined {
  return typeof v === "function" ? v(ctx) : v;
}

/** 팀이 정한 문장. 칸이 비면 중립 문장(`NEUTRAL_LEGAL`) */
type TeamLegal = {
  /** 약관 첫 조의 크루 정식 이름 — 없으면 크루 이름 */
  orgName?: string;
  /** 약관에 운영 주체 줄을 싣는가 — 기강은 예전 문서에 없던 줄이라 안 싣는다(문장 고정) */
  statesOperatorInTerms?: boolean;
  /** 설정을 못 읽었거나 비었을 때의 운영 주체·연락처(그 팀 것만) */
  operatorFallback?: string;
  contactFallback?: string;
  termsAge?: string[];
  /** 문장에 크루 이름·사진 지면 이름이 들어가면 함수로 둔다 — 팀 설정에서 이름을 바꾸면 약관도 따라온다(PR #745 리뷰) */
  privacyAge?: TeamLines;
  services?: TeamLines;
  meta?: Partial<Record<LegalDocKind, DocMeta>>;
};

const TEAM_LEGAL: Readonly<Record<string, TeamLegal>> = {
  gigang: {
    orgName: "러닝크루 기강",
    statesOperatorInTerms: false,
    operatorFallback: "이현근 (크루장)",
    contactFallback: "team.gigang@gmail.com",
    termsAge: ["1986년생부터 성인까지 가입할 수 있습니다.", "가입 자격을 충족하지 않는 사실이 확인되면 가입이 취소될 수 있습니다."],
    privacyAge: [
      "기강은 1986년생부터 성인까지 가입할 수 있으며, 미성년자의 개인정보는 수집하지 않습니다.",
      "가입 연령에 해당하지 않는 사실이 확인되면 해당 정보를 지체 없이 파기합니다.",
    ],
    services: [
      "정기 및 비정기 러닝 모임 운영",
      "일정·공지 제공 및 앱 알림(웹 푸시) 발송",
      "대회 기록 관리 및 크루 내 기록 랭킹",
      "사진·글 공유(깅스타그램), 댓글",
      "마일리지런 등 크루 프로젝트 운영",
    ],
    meta: {
      terms: {
        effectiveDate: "2026-09-30",
        history: ["2026-03-02 제정", "2026-09-30 개정 — 가입 자격·게시물·기록 공개·탈퇴·약관 변경 조항 추가"],
      },
      privacy: {
        effectiveDate: "2026-09-30",
        history: ["2026-03-26 제정", "2026-09-30 개정 — 수집 항목·위탁·국외 이전 보완, 쿠키·연령·권익침해 구제 조항 추가"],
      },
      policy: {
        effectiveDate: "2026-09-30",
        history: ["2026-03-02 제정", "2026-09-30 개정 — 사진 게시·제재 절차·비활성 조항 정비"],
      },
    },
  },
  // 울산 모비 — 2026-11-23 송창준 회신으로 확정. 가입 나이는 기강과 같다(가입 폼 검증 `lib/validations/member.ts` 도 같은 기준).
  // 연락처는 기강처럼 이메일만 싣는다(약관은 비로그인도 본다). 시행일 = 울산 공개일.
  ulsan: {
    contactFallback: "zkzkdksek2@naver.com",
    termsAge: ["1986년생부터 성인까지 가입할 수 있습니다.", "가입 자격을 충족하지 않는 사실이 확인되면 가입이 취소될 수 있습니다."],
    // 크루 이름·사진 지면 이름은 팀 문구에서 — 팀 설정에서 이름을 바꾸면 약관도 따라온다
    privacyAge: ({ crewName }) => [
      `${crewName}${josaOf(crewName, "은/는")} 1986년생부터 성인까지 가입할 수 있으며, 미성년자의 개인정보는 수집하지 않습니다.`,
      "가입 연령에 해당하지 않는 사실이 확인되면 해당 정보를 지체 없이 파기합니다.",
    ],
    services: ({ galleryName }) => [
      "정기 및 비정기 트레일러닝·산행 모임 운영",
      "일정·공지 제공 및 앱 알림(웹 푸시) 발송",
      "대회 기록 관리 및 크루 내 기록 랭킹",
      `사진·글 공유(${galleryName}), 댓글`,
      "크루 프로젝트 운영",
    ],
    meta: {
      terms: { effectiveDate: "2026-11-28", history: ["2026-11-28 제정"] },
      privacy: { effectiveDate: "2026-11-28", history: ["2026-11-28 제정"] },
      policy: { effectiveDate: "2026-11-28", history: ["2026-11-28 제정"] },
    },
  },
};

/**
 * 중립 문서의 시행일 — 팀별 문서로 나눈 날. ⚠ 그 팀이 주소를 공개하는 날로 바꾸고 싶으면 그 팀 칸(`TEAM_LEGAL`)에 `meta` 를 넣는다.
 */
const NEUTRAL_META: DocMeta = { effectiveDate: "2026-11-15", history: ["2026-11-15 제정"] };

const NEUTRAL_LEGAL = {
  statesOperatorInTerms: true,
  termsAge: [
    "가입 자격(나이 등)은 크루가 공지한 기준을 따릅니다.",
    "가입 자격을 충족하지 않는 사실이 확인되면 가입이 취소될 수 있습니다.",
  ],
  privacyAge: [
    "가입 연령은 크루가 공지한 기준을 따르며, 만 14세 미만 아동의 개인정보는 수집하지 않습니다.",
    "가입 연령에 해당하지 않는 사실이 확인되면 해당 정보를 지체 없이 파기합니다.",
  ],
} as const;

/** 운영 주체가 비었을 때 */
export const NEUTRAL_OPERATOR = "크루 운영진";

function teamLegal(teamCd: string): TeamLegal {
  return TEAM_LEGAL[teamCd] ?? {};
}

/** 운영 주체 — 팀 설정 → 그 팀 기본값 → 「크루 운영진」 */
export function resolveOperator(ctx: Pick<LegalContext, "teamCd" | "operator">): string {
  return ctx.operator?.trim() || teamLegal(ctx.teamCd).operatorFallback || NEUTRAL_OPERATOR;
}

/** 연락처 — 팀 설정 → 그 팀 기본값 → 없음(지어내지 않는다) */
export function resolveContact(ctx: Pick<LegalContext, "teamCd" | "contact">): string | null {
  return ctx.contact?.trim() || teamLegal(ctx.teamCd).contactFallback || null;
}

/**
 * 홈 푸터의 운영·문의 줄 — 약관과 같은 값. 운영 주체가 **어디에도 없을 때만**(팀 설정도 그 팀 코드 기본값도 없음) 줄째 안 싣는다.
 * 값이 「크루 운영진」인지로 가르지 않는다 — 운영진이 그 글자를 직접 적으면 약관엔 나오는데 푸터만 빠졌다(PR #747 리뷰).
 */
export type FooterContacts = { operator: string | null; contact: string | null };

export function resolveFooterContacts(ctx: Pick<LegalContext, "teamCd" | "operator" | "contact">): FooterContacts {
  const operator = ctx.operator?.trim() || teamLegal(ctx.teamCd).operatorFallback || null;
  return { operator, contact: resolveContact(ctx) };
}

/** 번호는 실린 조항 순서대로 매긴다 — 회비 조항이 빠지면 뒤 번호가 당겨진다 */
function numbered(sections: (Omit<LegalSection, "id"> | false)[]): LegalSection[] {
  return sections.filter((s): s is Omit<LegalSection, "id"> => s !== false).map((s, i) => ({ id: i + 1, ...s }));
}

function meta(kind: LegalDocKind, teamCd: string): DocMeta {
  return teamLegal(teamCd).meta?.[kind] ?? NEUTRAL_META;
}

function appName(ctx: LegalContext): string {
  return ctx.appHost ? `${ctx.crewName} 앱(${ctx.appHost})` : `${ctx.crewName} 앱`;
}

export function buildTermsDoc(ctx: LegalContext): LegalDoc {
  const team = teamLegal(ctx.teamCd);
  const org = team.orgName ?? ctx.crewName;
  const statesOperator = team.statesOperatorInTerms ?? NEUTRAL_LEGAL.statesOperatorInTerms;
  const app = `${ctx.crewName} 앱`;
  const profileItem = ctx.runningProfileEnabled === false ? "가입 목적" : "러닝 프로필";
  const publicItems = `회원의 이름, 프로필 사진, 한마디, ${profileItem}, 대회 기록${ctx.titlesEnabled ? ", 칭호는" : "은"}`;

  return {
    heading: "이용약관",
    ...meta("terms", ctx.teamCd),
    sections: numbered([
      {
        title: "목적",
        details: [
          `본 약관은 ${org}(이하 "크루")${josaOf(org, "과/와")} ${appName(ctx)} 이용에 관한 권리, 의무 및 책임사항을 규정합니다.`,
          ...(statesOperator ? [`크루와 앱의 운영 주체는 ${resolveOperator(ctx)}입니다.`] : []),
        ],
      },
      { title: "가입 자격", details: [...(team.termsAge ?? NEUTRAL_LEGAL.termsAge)] },
      {
        title: "회원의 의무",
        details: [
          "가입 시 정확한 정보를 제공합니다.",
          "운영진의 안내 및 공지, 운영정책을 준수합니다.",
          "로그인에 사용하는 카카오·구글 계정은 본인이 관리하며, 타인에게 양도하거나 빌려주지 않습니다.",
        ],
      },
      {
        title: "서비스",
        details: linesOf(team.services, ctx) ?? [
          "정기 및 비정기 모임 운영",
          "일정·공지 제공 및 앱 알림(웹 푸시) 발송",
          "대회 기록 관리 및 크루 내 기록 랭킹",
          `사진·글 공유(${ctx.galleryName}), 댓글`,
          "크루 프로젝트 운영",
        ],
      },
      {
        title: "기록 및 프로필 공개",
        details: [
          `${publicItems} ${app}에 공개되며, 로그인하지 않은 방문자도 볼 수 있습니다.`,
          `대회 기록은 이름과 함께 기록 랭킹(${ctx.hallName})에 표시됩니다.`,
        ],
      },
      {
        title: "게시물",
        details: [
          "회원이 올린 사진·글·댓글의 저작권은 작성자에게 있습니다.",
          `크루는 회원의 게시물을 ${app}에 노출하고, 크루 공식 SNS(인스타그램 등)에 게시할 수 있습니다.`,
          "크루 공식 SNS에 게시된 사진은 본인이 요청하면 삭제합니다.",
          "운영진은 금지 행위에 해당하거나 타인의 권리를 침해하는 게시물을 사전 통지 없이 삭제할 수 있습니다.",
        ],
      },
      ctx.duesEnabled && {
        title: "회비 및 결제",
        details: ["회비는 계좌이체로 납부합니다.", "금액과 납부 기한은 공지합니다."],
      },
      {
        title: "금지 행위",
        details: [
          "타인에게 불쾌감을 주는 행위",
          "안전 수칙 위반",
          "허위 정보 기재",
          "타인의 계정 사용 또는 서비스 운영을 방해하는 행위",
        ],
      },
      {
        title: "탈퇴 및 자격 제한",
        details: [
          "회원은 운영진에게 요청하여 탈퇴할 수 있습니다.",
          "운영정책에 따라 회원 자격이 비활성 처리되거나 제명될 수 있습니다.",
        ],
      },
      {
        title: "서비스 변경 및 종료",
        details: [
          "운영 사정에 따라 일정이 변경 또는 취소될 수 있습니다.",
          "앱의 기능은 운영 사정에 따라 추가·변경·중단될 수 있습니다.",
        ],
      },
      {
        title: "책임 제한",
        details: ["개인 부주의로 인한 사고는 회원 본인 책임입니다.", "다만, 크루의 중대한 과실이 있는 경우는 제외합니다."],
      },
      { title: "약관의 변경", details: ["약관을 변경하는 경우 시행 7일 전에 앱 공지사항으로 알립니다."] },
      { title: "분쟁 해결", details: ["상호 협의로 해결하며 관련 법령에 따릅니다."] },
    ]),
  };
}

/** 연락처 한 줄 — 이메일이면 「이메일:」, 그 밖이면 「연락처:」, 없으면 운영진 문의 안내 */
function contactLine(contact: string | null): string {
  if (!contact) return "연락처: 운영진에게 문의해 주세요(앱의 「건의하기」로도 받습니다).";
  return contact.includes("@") ? `이메일: ${contact}` : `연락처: ${contact}`;
}

export function buildPrivacyDoc(ctx: LegalContext): LegalDoc {
  const team = teamLegal(ctx.teamCd);
  const contact = resolveContact(ctx);

  return {
    heading: "개인정보처리방침",
    ...meta("privacy", ctx.teamCd),
    sections: numbered([
      {
        title: "개인정보의 처리 목적",
        details: [
          "크루 가입 및 회원 관리",
          "모임 일정 안내 및 공지 전달(앱 알림·웹 푸시 포함)",
          ...(ctx.duesEnabled ? ["회비(계좌이체) 입금 확인 및 회비 잔액 관리"] : []),
          "활동 기록·사진 공유 및 크루 내 기록 랭킹·프로필 카드 제공",
          "대회 기록증 사진에서 기록을 읽어 자동 입력(이용자가 요청한 경우)",
        ],
      },
      {
        title: "처리하는 개인정보 항목",
        details: [
          "회원 정보: 이름, 연락처, 생년월일, 성별, 이메일, 프로필 사진, 소셜 로그인 식별자(카카오·구글)",
          ...(ctx.duesEnabled ? ["회비 정보: 계좌번호(선택), 은행명(선택), 회비 입금 내역(입금자명·금액·일시)"] : []),
          ctx.runningProfileEnabled === false
            ? "가입 정보(선택): 가입 목적, 가입 경로"
            : "러닝 프로필(선택): 가까운 역, 평균 페이스·거리, 가입 목적, 가입 경로",
          "활동 정보: 모임 참석 이력, 대회 기록, 기록증 사진, UTMB 프로필 주소 및 지수, 게시한 사진·글·댓글",
          "자동 수집 정보: 접속 기록(IP 주소, 접속 일시, 브라우저 정보), 쿠키, 웹 푸시 구독 정보",
        ],
      },
      {
        title: "개인정보의 보유 및 이용 기간",
        details: ["회원 탈퇴 후 1년간 보유 후 파기", "관계 법령에서 보존을 요구하는 정보는 해당 법령이 정한 기간 동안 보존"],
      },
      { title: "개인정보의 제3자 제공", details: ["현재 제3자 제공 없음"] },
      {
        title: "개인정보 처리의 위탁",
        details: [
          "Supabase Inc.: 데이터베이스·인증·파일(사진) 저장 인프라 운영",
          "Vercel Inc.: 웹 서비스 호스팅 및 서버 운영(서울 리전)",
          "Google LLC: 대회 기록증 사진 인식(Gemini API)",
          "웹 푸시 전송: 이용자 브라우저 제공사의 푸시 서버(Google, Apple, Mozilla 등)",
        ],
      },
      {
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
        title: "개인정보의 파기 절차 및 방법",
        details: ["보유 기간 종료 또는 목적 달성 시 지체 없이 파기", "전자파일은 복구 불가능한 방식으로 삭제"],
      },
      {
        title: "정보주체의 권리",
        details: [
          "개인정보 열람, 정정, 삭제, 처리정지 요구 가능",
          contact
            ? "요청은 아래 책임자 연락처로 접수하며, 접수일로부터 10일 이내에 조치 결과를 알려드립니다."
            : "요청은 운영진에게(앱의 「건의하기」로도) 접수하며, 접수일로부터 10일 이내에 조치 결과를 알려드립니다.",
          `이름·프로필 사진·${ctx.runningProfileEnabled === false ? "가입 목적" : "러닝 프로필"} 등은 앱의 프로필 수정 화면에서 직접 정정할 수 있습니다.`,
        ],
      },
      {
        title: "안전성 확보 조치",
        details: ["개인정보 접근 권한 최소화", "데이터베이스 접근 제어 및 보안 정책 적용", "기기 잠금 및 기본 보안 조치 적용"],
      },
      {
        title: "쿠키 등 자동 수집 장치의 설치·운영 및 거부",
        details: [
          "로그인 상태 유지와 화면 설정(주 시작 요일, 다크모드, 화면 폭 등) 저장을 위해 쿠키 및 브라우저 저장소를 사용합니다.",
          "광고·추적 목적의 쿠키는 사용하지 않습니다.",
          "브라우저 설정에서 쿠키 저장을 거부할 수 있으나, 이 경우 로그인이 유지되지 않아 서비스 이용이 제한됩니다.",
        ],
      },
      { title: "가입 연령", details: [...(linesOf(team.privacyAge, ctx) ?? NEUTRAL_LEGAL.privacyAge)] },
      { title: "개인정보 보호 책임자", details: [resolveOperator(ctx), contactLine(contact)] },
      {
        title: "권익침해 구제 방법",
        details: [
          "개인정보 침해에 대한 신고나 상담이 필요하면 아래 기관에 문의할 수 있습니다.",
          "개인정보분쟁조정위원회: 1833-6972 (www.kopico.go.kr)",
          "개인정보침해신고센터: 118 (privacy.kisa.or.kr)",
          "대검찰청: 1301 (www.spo.go.kr)",
          "경찰청: 182 (ecrm.police.go.kr)",
        ],
      },
      { title: "고지의 의무", details: ["본 방침은 변경될 수 있으며 변경 시 시행 7일 전에 앱 공지사항으로 알립니다."] },
    ]),
  };
}

export function buildPolicyDoc(ctx: LegalContext): LegalDoc {
  return {
    heading: "운영정책",
    ...meta("policy", ctx.teamCd),
    sections: numbered([
      {
        title: "안전수칙",
        details: ["집결 및 출발 전 준비운동 권장", "음주 후 참여 금지", "위험 구간에서는 운영진 안내 준수"],
      },
      {
        title: "출석 및 노쇼",
        details: ["참석 여부는 사전에 표시합니다.", "사전 취소 없이 불참이 반복될 경우 참여 제한될 수 있습니다."],
      },
      {
        title: "사진 및 기록",
        details: [
          `모임 중 촬영한 사진은 ${ctx.crewName} 앱과 크루 공식 인스타그램 등 SNS에 게시될 수 있습니다.`,
          "게시를 원하지 않는 사진은 운영진에게 요청하면 삭제합니다.",
        ],
      },
      {
        title: "매너 및 금지행위",
        details: ["욕설, 비하, 성희롱, 차별 행위 금지", "촬영을 원하지 않는 회원의 의사를 존중합니다."],
      },
      {
        title: "제재",
        details: [
          "운영정책 위반 시 먼저 경고하며, 제재 전에 사유를 알리고 소명할 기회를 드립니다.",
          "경고 후에도 반복되면 일정 기간 참여 제한 또는 제명될 수 있습니다.",
        ],
      },
      {
        title: "비활성 회원",
        details: [
          "회원은 운영진에게 요청하여 비활성 상태로 전환할 수 있습니다.",
          "운영진은 운영정책에 따라 회원을 비활성 처리할 수 있습니다.",
          "비활성 회원은 모임 참여·기록 등록 등 크루 활동이 제한되며, 활동을 재개하려면 운영진 승인이 필요합니다.",
        ],
      },
      { title: "정책 변경", details: ["변경 사항은 시행 7일 전에 앱 공지사항으로 알립니다."] },
    ]),
  };
}

export const LEGAL_DOC_BUILDERS: Readonly<Record<LegalDocKind, (ctx: LegalContext) => LegalDoc>> = {
  terms: buildTermsDoc,
  privacy: buildPrivacyDoc,
  policy: buildPolicyDoc,
};
