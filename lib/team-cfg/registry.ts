import { z } from "zod";

import { parseEventTime } from "@/lib/dayjs";
import { RECORD_CATEGORIES, RECORD_CATEGORY_KEYS } from "@/lib/records-categories";
import { GTHR_SPRT_TYPES, gthrSprtLabels } from "@/lib/validations/gathering";
import { guideActivitiesSchema, guideSectionsSchema } from "@/lib/newbie-guide";

/**
 * 팀 설정 사전 — `team_cfg` 에 들어갈 수 있는 키의 **정본**.
 *
 * DB(`team_cfg`)엔 값만 살고, 키의 형식·기본값·설명은 여기 한 곳에 둔다. 새 설정은 그걸 읽는 코드가
 * 있어야 의미가 있으므로 정의도 코드에 둔다(DB 에 따로 두면 두 군데가 어긋난다).
 *
 * 규칙
 * - **행이 없으면 `default`.** 대부분의 키는 default 가 "지금 기강 동작"이라 기강은 행 0개로 그대로 돈다.
 * - **값이 형식에 안 맞으면 `default` + 경고 로그.** 잘못 넣어도 화면이 깨지지 않는다.
 * - **값은 의미로 저장한다.** 폰트면 `"명조"` 같은 선택지, 기간이면 개월 수 — CSS·구현 세부를 넣지 않는다.
 * - **분기는 기능 입구에서 한 번.** 화면 컴포넌트가 "어느 팀인지"를 몰라도 되게 한다.
 * - `visibility`: `server` 는 서버만 읽는다(브라우저로 내보내지 않는다).
 *
 * 테이블·이력 규칙은 `supabase/migrations/20261109120000_team_cfg.sql`, 읽기는 `./read.ts`.
 */

/**
 * 관리자 「팀 설정」 화면(`/admin/team-settings`)이 묶는 칸. 화면은 이 사전을 보고 그리므로,
 * **키를 사전에 더하면 모든 팀의 설정 화면에 저절로 올라온다**(팀마다 빈 행을 미리 넣을 필요가 없다).
 */
export type CfgGroup = "feature" | "member_info" | "legal" | "newbie" | "operation" | "brand" | "seo";

/**
 * 입력칸 모양. `secret` 은 지금 값을 화면에 내보내지 않고(설정됨/안 됨만) 새 값 입력만 받는다.
 * 새 모양이 필요하면 여기와 `app/(info)/admin/team-settings/team-settings-client.tsx` 의 편집기를 같이 늘린다.
 */
export type CfgInput =
  | { kind: "boolean" }
  | { kind: "text"; placeholder?: string }
  | { kind: "secret"; placeholder?: string }
  | { kind: "bank" }
  | { kind: "channels" }
  | { kind: "regular_template" }
  /** 정기 모임 이름 + 일정(가입 「참석 약속」 안내) */
  | { kind: "regular_intro" }
  | { kind: "team_links" }
  /** 짧은 글 여러 줄(한 줄에 하나) — 칩 목록 등 */
  | { kind: "lines"; placeholder?: string }
  /** 신입 안내 칸 목록(제목·아이콘·마크다운 본문·보이기) — 행 추가·삭제·순서(§lib/newbie-guide) */
  | { kind: "guide_sections" }
  /**
   * 여러 개 고르기(체크박스), 최소 하나. `orderable` 이면 위아래로 순서를 바꿀 수 있고 **고른 순서 그대로** 저장한다
   * (화면이 그 순서로 세운다). 아니면 `options` 순서로 저장한다.
   */
  | { kind: "choices"; options: readonly { value: string; label: string }[]; orderable?: boolean }
  /** 하나 고르기 */
  | { kind: "choice"; options: readonly { value: string; label: string }[] };

type CfgDef<S extends z.ZodTypeAny> = {
  schema: S;
  default: z.infer<S>;
  /** 사람이 읽는 이름 — 관리자 「팀 설정」 화면이 이걸로 입력칸을 그린다 */
  label: string;
  description: string;
  /**
   * 이 값이 **앱 어디에 보이는지** — 관리자 「팀 설정」의 물음표(?)가 보여 준다. 캡처 대신 글로 적는다(화면이 바뀌면 캡처가
   * 낡고 팀마다 모양이 달라서, 2026-11-27 유저 결정). 사용처를 바꾸면 이 문장도 같이 고친다.
   */
  shownAt: string;
  visibility: "server" | "member" | "public";
  group: CfgGroup;
  input: CfgInput;
  /** 관리자 설정 화면에 올리지 않는다 — 거의 안 바꾸는 값이라 코드·마이그레이션으로 관리한다 */
  hidden?: boolean;
  /**
   * 설정을 **못 읽었을 때**(DB 오류) 쓸 값. 없으면 `default`.
   * 기본값이 '없음'인 키는 그대로 안전하지만, 기본값이 '켬'인 키는 실패 순간 그 기능을 꺼 둔 팀(울산)에서도
   * 켜진다 — 그런 키는 여기에 보수적인 값(끔)을 준다. 기강도 그 순간엔 꺼지지만 잠깐이고 다른 팀으로 새지 않는다.
   */
  onReadError?: z.infer<S>;
  /**
   * **owner 만** 바꾼다 — 돈·공지가 걸린 값(계좌·카톡방). 관리자 누구나 바꾸면 계좌가 바뀌어도 아무도 모른다.
   * 바뀌면 그 팀 owner·관리자에게 알림이 간다(`app/actions/admin/team-settings.ts`). 2026-11-10 유저 결정.
   */
  ownerOnly?: boolean;
};

function defineCfg<S extends z.ZodTypeAny>(def: CfgDef<S>): CfgDef<S> {
  return def;
}

/**
 * 채널 주소 — http(s) 만. `z.string().url()` 은 `javascript:` 같은 주소도 통과시켜, 관리자가 넣은 값이
 * 회원 화면의 링크(`<a href>`)로 그대로 나가면 누르는 순간 스크립트가 돈다. 길이도 묶는다.
 */
const channelUrl = z
  .string()
  .trim()
  .max(500)
  .url()
  .refine((v) => /^https?:\/\//i.test(v), "http:// 또는 https:// 로 시작하는 주소만 넣을 수 있어요");

/** 날짜 하나(YYYY-MM-DD). 형식만 보면 `2026-02-30` 같은 없는 날도 통과해 화면에 3월 2일로 찍힌다 — 되읽어 같아야 한다 */
const dateOnly = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "2024-04-23 처럼 넣어 주세요")
  .refine((v) => parseEventTime(v).format("YYYY-MM-DD") === v, "없는 날짜예요");

export const TEAM_CFG_REGISTRY = {
  /**
   * 카톡 공지방(노티봇 허브의 방 고정 ID). **기본값이 없다** — 비어 있으면 그 팀은 카톡 공지를 보내지 않는다.
   * 다른 키처럼 "기강 동작"을 기본으로 두면 다른 팀 공지가 기강 단톡방으로 샌다(예전 환경변수 방식의 구멍).
   * API 키는 비밀값이라 여기 두지 않고 환경변수(`KAKAO_SERVICE_API_KEY`)에 남는다 — 방 ID 만으로는 보낼 수 없다.
   */
  "kakao.room_id": defineCfg({
    schema: z.string().trim().min(1).nullable(),
    default: null,
    label: "카톡 공지방 ID",
    description: "노티봇 허브 콘솔의 방 고정 ID. 비우면 이 팀은 단톡방 공지를 보내지 않아요.",
    shownAt: "모임을 만들거나 바꿀 때, 동계훈련(PB 클래스) 안내, 운영 MCP 공지 메시지가 이 단톡방으로 가요. 회원 화면에는 보이지 않아요.",
    visibility: "server",
    group: "operation",
    input: { kind: "secret", placeholder: "노티봇 허브의 방 고정 ID" },
    ownerOnly: true,
  }),

  /**
   * 모임 계좌(회비·프로젝트 입금 안내). **기본값이 없다** — 비어 있으면 계좌 안내를 그리지 않는다.
   * 기본값을 기강 계좌로 두면 다른 팀 회원이 기강 계좌로 돈을 보낸다.
   * 번호는 화면에 보이는 형식(하이픈 포함)으로 넣는다 — 복사할 땐 숫자만 뽑는다.
   */
  "bank.team_account": defineCfg({
    schema: z
      .object({
        bank: z.string().trim().min(1),
        number: z.string().trim().min(1),
        holder: z.string().trim().min(1),
      })
      .nullable(),
    default: null,
    label: "모임 계좌",
    description: "회비·프로젝트 입금 안내에 보이는 계좌. 비우면 계좌 안내가 안 보여요.",
    shownAt: "회원의 회비 내역 화면과 프로젝트(마일리지런·동계훈련) 참가비 안내에 「이 계좌로 보내 주세요」로 보여요.",
    visibility: "member",
    group: "member_info",
    input: { kind: "bank" },
    ownerOnly: true,
  }),

  /**
   * 팀 채널(오픈채팅·인스타·소모임·가민) 주소. **기본값이 없다** — 없는 채널은 칸째 안 그린다.
   * 다른 키처럼 기강 값을 기본으로 두면 다른 팀 화면에 기강 채널이 뜬다.
   */
  "social.channels": defineCfg({
    schema: z.object({
      kakao_open_chat: channelUrl.optional(),
      instagram: channelUrl.optional(),
      somoim: channelUrl.optional(),
      garmin: channelUrl.optional(),
    }),
    default: {},
    label: "팀 채널",
    description: "오픈채팅·인스타·소모임·가민 주소. 비운 채널은 화면에 안 보여요.",
    shownAt: "홈 맨 아래 채널 칸, 더보기 맨 위 채널 칸, 로그인 화면 아래 아이콘, 가입 완료 화면 「오픈채팅 참여」 버튼에 나와요.",
    visibility: "public",
    group: "member_info",
    input: { kind: "channels" },
  }),

  /**
   * 오픈채팅 비밀번호 — 그 팀 회원에게만 보인다(서버가 회원 여부를 다시 판정한다). 비밀값이라 `server`.
   * 기본값 없음 — 행이 없으면 안 보인다(예전 환경변수 `KAKAO_CHAT_PASSWORD` 전환 분기는 2026-11-15 걷었다).
   */
  "social.kakao_open_chat_password": defineCfg({
    schema: z.string().trim().min(1).nullable(),
    default: null,
    label: "오픈채팅 비밀번호",
    description: "그 팀 회원에게만 보여요. 비우면 비밀번호 안내가 안 보여요.",
    shownAt: "회원이 오픈채팅 칸을 누르면 뜨는 비밀번호 창과 가입 완료 화면에 보여요. 크루 회원에게만 보여요.",
    visibility: "server",
    group: "member_info",
    input: { kind: "secret", placeholder: "오픈채팅 비밀번호" },
  }),


  /**
   * 운영 주체·개인정보 보호 책임자 — 약관(운영 주체)·개인정보처리방침(보호 책임자)에 적히는 이름(`lib/legal-docs.ts`, #658).
   * **기본값이 없다** — 기강 값을 기본으로 두면 다른 팀 회원이 동의하는 문서에 기강 책임자가 적힌다. 비어 있으면 「크루 운영진」.
   * 기강은 못 읽었을 때도 코드의 팀 기본값(`lib/legal-docs.ts` 기강 표)으로 물러난다. 문서에 실리는 이름이라 owner 만 바꾼다.
   */
  "legal.operator": defineCfg({
    schema: z.string().trim().min(1).max(40).nullable(),
    default: null,
    label: "운영 주체·개인정보 책임자",
    description: "이용약관(운영 주체)과 개인정보처리방침(개인정보 보호 책임자)에 적히는 이름. 비우면 「크루 운영진」으로 보여요.",
    shownAt: "이용약관 「운영 주체」, 개인정보처리방침 「개인정보 보호 책임자」, 홈 맨 아래 「운영」 줄에 나와요.",
    visibility: "public",
    group: "legal",
    input: { kind: "text", placeholder: "예: 홍길동 (크루장)" },
    ownerOnly: true,
  }),

  /**
   * 개인정보 문의 연락처 — 개인정보처리방침의 보호 책임자 연락처(열람·정정·삭제 요청 창구, `lib/legal-docs.ts`, #658).
   * 이메일이면 「이메일:」, 그 밖(전화 등)이면 「연락처:」로 적힌다. **기본값이 없다** — 비어 있으면 연락처를 지어내지 않고
   * 「운영진에게 문의(앱의 건의하기)」로 안내한다. 공개 문서에 실리는 값이라 owner 만 바꾼다.
   */
  "legal.contact": defineCfg({
    schema: z.string().trim().min(1).max(100).nullable(),
    default: null,
    label: "개인정보 문의 연락처",
    description: "개인정보처리방침에 공개되는 책임자 연락처(이메일이나 전화). 비우면 「운영진에게 문의해 주세요」로 보여요.",
    shownAt: "개인정보처리방침의 책임자 연락처와 홈 맨 아래 「문의」 줄에 나와요. 로그인하지 않은 사람도 볼 수 있어요.",
    visibility: "public",
    group: "legal",
    input: { kind: "text", placeholder: "예: team@example.com" },
    ownerOnly: true,
  }),

  /**
   * 워드마크 — 모임 공유 이미지(OG) 맨 아래에 찍는 팀 글자. **기본값이 없다** — 비어 있으면 글자 줄을 안 그린다.
   * 기본값을 `GIGANG` 으로 두면 울산 모임 공유 카드에 기강 글자가 찍힌다.
   */
  "brand.wordmark": defineCfg({
    schema: z.string().trim().min(1).max(30).nullable(),
    default: null,
    label: "워드마크",
    description: "모임 공유 이미지 아래에 찍히는 팀 영문 글자(예: MY CREW). 비우면 안 보여요.",
    shownAt: "모임을 카톡 등으로 공유할 때 뜨는 미리보기 이미지 아래쪽 영문 글자, 그리고 내 컬렉션에서 대표 칭호를 안 골랐을 때 미리보기 배지 글자예요.",
    visibility: "public",
    group: "brand",
    input: { kind: "text", placeholder: "예: MY CREW" },
  }),

  /**
   * 슬로건 — 일정 탭 헤더 가운데(큰 글자)와 모임 공유 이미지(OG) 맨 위에 찍는다. **기본값이 없다** — 비어 있으면
   * 그 줄을 안 그린다. 기본값을 기강 문구로 두면 울산 화면·공유 카드에 기강 슬로건이 뜬다.
   * 예전엔 `components/home/header-slogan.tsx`·`lib/gathering-og.ts` 에 기강 문구가 박혀 있었다(2026-11-10 데이터로 옮김).
   * 헤더 가운데 폭(224px)에 13px 굵은 대문자로 들어가야 해서 짧게 묶는다 — 넘치면 화면이 `…` 로 자른다.
   */
  "brand.slogan": defineCfg({
    schema: z.string().trim().min(1).max(24).nullable(),
    default: null,
    label: "슬로건",
    description: "일정 탭 맨 위와 모임 공유 이미지에 대문자로 찍히는 한 줄(24자까지). 비우면 안 보여요.",
    shownAt: "일정 탭 맨 위 가운데(창설일 아래)와 모임 공유 미리보기 이미지 맨 위에 보여요. 검색 설명이 비어 있으면 그 자리에도 쓰여요.",
    visibility: "public",
    group: "brand",
    input: { kind: "text", placeholder: "예: 함께 달리면 더 멀리" },
  }),

  /**
   * 창설일 — 일정 탭 헤더 슬로건 위 작은 글자 「Since 2024.04.23」. **기본값이 없다**(비어 있으면 안 그린다).
   * 아직 안 온 날(울산 2026-11-28)이어도 그대로 찍는다 — 창설 예정일도 그 크루의 시작일이다.
   */
  "brand.founded_dt": defineCfg({
    schema: dateOnly.nullable(),
    default: null,
    label: "창설일",
    description: "일정 탭 맨 위 슬로건 위에 「Since 2024.04.23」로 보여요. 비우면 안 보여요.",
    shownAt: "일정 탭 맨 위 가운데 슬로건 위 「SINCE 2024」 같은 작은 줄이에요.",
    visibility: "public",
    group: "brand",
    input: { kind: "text", placeholder: "예: 2024-04-23" },
  }),

  /**
   * 크루 이름 — **앱 전체의 크루 이름**(「○○에 합류」「○○의 전당」「○○이야기」 등 화면 곳곳, `lib/team-copy.ts`)이자
   * 링크 미리보기 사이트 이름·iOS 홈 화면 제목. **기본값이 없다** — 기본값을 「기강」으로 두면 설정을 안 채운 팀에 기강 이름이
   * 뜬다. 비어 있으면 팀 기본 이름(코드의 말투 표 — 기강 「기강」), 그것도 없으면 「크루」.
   * `team_mst.team_nm`(관리용 이름, 울산은 「울산지부」)과 다르다 — 이건 사람들에게 보이는 크루 이름이다(울산 = 모비).
   */
  "brand.name": defineCfg({
    schema: z.string().trim().min(1).max(20).nullable(),
    default: null,
    label: "크루 이름",
    description: "화면 곳곳(「○○에 합류」「○○의 전당」 등)과 링크 미리보기에 쓰는 크루 이름이에요. 비우면 팀 기본 이름, 그것도 없으면 「크루」로 보여요.",
    shownAt: "앱 곳곳의 크루 이름이에요 — 홈 「○○이야기」, 랭킹 「○○의 전당」, 가입·신입 안내 인사, 약관, 링크 미리보기 제목 등.",
    visibility: "public",
    group: "brand",
    input: { kind: "text", placeholder: "예: 크루 이름" },
  }),

  /**
   * 회원 호칭 — 「기강인만 볼 수 있어요」「기강인 42명의 이번 주 심박」의 「기강인」 자리(`lib/team-copy.ts`).
   * 크루 이름에 「인」만 붙이면 어색한 팀이 있어(「모비인」) 따로 둔다(유저 결정 2026-11-10).
   * **기본값 없음** — 비어 있으면 팀 기본 호칭(코드의 말투 표), 그것도 없으면 중립어 「크루원」(다른 팀 호칭으로 물러나지 않는다).
   */
  "brand.member_noun": defineCfg({
    schema: z.string().trim().min(1).max(10).nullable(),
    default: null,
    label: "회원 호칭",
    description: "화면에서 회원을 부르는 말(예: 크루원). 비우면 팀 기본 호칭, 그것도 없으면 「크루원」으로 보여요.",
    shownAt: "회원을 부르는 말이에요 — 「○○만 볼 수 있어요」, 홈 「새로 들어온 ○○」 같은 문장에 들어가요.",
    visibility: "public",
    group: "brand",
    input: { kind: "text", placeholder: "예: 크루원" },
  }),

  /**
   * 검색·공유 문구 — 홈 제목·탭 제목·설명. 화면에 쓰는 크루 이름(`brand.name`)과 **따로 둔다**: 「기강」 단독은
   * 동음이의어라 검색에 안 걸려서 기강은 제목에 「러닝크루」·활동 지역을 일부러 넣었다(2026-09-01 네이버 실검색).
   * 이름으로 제목을 조합하면 그 제목이 깨진다. 셋 다 **기본값이 없다** — 기강 문구가 다른 팀 미리보기에 뜨지 않게.
   * 읽는 곳은 `lib/seo/site-metadata.ts` 한 곳.
   */
  "seo.title": defineCfg({
    schema: z.string().trim().min(1).max(60).nullable(),
    default: null,
    label: "홈 제목",
    description: "링크 미리보기·검색결과에 뜨는 제목. 크루 이름만 쓰면 검색에 안 걸릴 수 있어 활동 지역·종목을 같이 넣는 게 좋아요.",
    shownAt: "카톡·검색에서 홈 주소를 공유하거나 찾았을 때 뜨는 제목, 브라우저 탭에서 홈을 열었을 때의 제목이에요.",
    visibility: "public",
    group: "seo",
    input: { kind: "text", placeholder: "예: 크루 이름 | 지역·종목 크루" },
  }),
  "seo.title_suffix": defineCfg({
    schema: z.string().trim().min(1).max(30).nullable(),
    default: null,
    label: "탭 제목 뒤에 붙는 말",
    description: "다른 화면 제목 뒤에 「일정 | ○○」처럼 붙어요. 비우면 크루 이름이 붙어요.",
    shownAt: "홈이 아닌 화면의 브라우저 탭 제목 뒤에 붙는 말이에요(예: 「일정 | ○○」).",
    visibility: "public",
    group: "seo",
    input: { kind: "text", placeholder: "예: 크루 이름" },
  }),
  "seo.description": defineCfg({
    schema: z.string().trim().min(1).max(160).nullable(),
    default: null,
    label: "설명 한 줄",
    description: "링크 미리보기·검색결과 제목 아래에 보이는 소개(160자까지). 비우면 슬로건이 보여요.",
    shownAt: "카톡·검색 결과에서 제목 아래에 뜨는 한 줄 소개예요.",
    visibility: "public",
    group: "seo",
    input: { kind: "text", placeholder: "예: 우리 동네에서 함께 달리는 크루" },
  }),

  /**
   * 정기 모임 템플릿 — 모임 만들기에서 유형을 「정기」로 고르면 비어 있는 제목·비고와 시작 시각을 채운다.
   * **기본값이 없다** — 비어 있으면 자동 채움을 하지 않는다(기강 코스·문구가 다른 팀에 채워지지 않게).
   * 예전엔 `lib/gathering/templates.ts` 에 기강 문구가 상수로 박혀 있었다(2026-11-09 데이터로 옮김).
   */
  "gathering.regular_template": defineCfg({
    schema: z
      .object({
        title: z.string().trim().min(1),
        /** KST "HH:mm" — 날짜는 폼에서 고른 날을 유지하고 시각만 바꾼다 */
        default_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        desc: z.string(),
      })
      .nullable(),
    default: null,
    label: "정기 모임 템플릿",
    description: "모임 만들기에서 「정기」를 고르면 채워지는 제목·시작 시각·비고. 비우면 자동으로 채우지 않아요.",
    shownAt: "관리자·회원이 모임을 만들 때 유형을 「정기」로 고르면 제목·시작 시각·비고 칸이 이 값으로 채워져요.",
    visibility: "member",
    group: "operation",
    input: { kind: "regular_template" },
  }),

  /**
   * 정기 모임 안내 — 가입 마지막 「참석 약속」 단계의 추천 문구(「정기런(격주 수요일 저녁)을 추천해요」). 예전엔 기강 문구가
   * 화면에 박혀 있어 울산 가입자에게도 「격주 수요일」이 떴다(2026-11-27). **기본값이 없다** — 비어 있으면 요일 없이 중립 문장.
   */
  "gathering.regular_intro": defineCfg({
    schema: z
      .object({
        /** 정기 모임을 부르는 이름(예: 정기런) */
        name: z.string().trim().min(1).max(20),
        /** 언제 열리나(예: 격주 수요일 저녁) */
        when: z.string().trim().min(1).max(40),
      })
      .nullable(),
    default: null,
    label: "정기 모임 안내",
    description: "가입하는 사람에게 「○○(언제)을 추천해요」로 보여 줄 정기 모임 이름과 일정. 비우면 요일 없이 안내해요.",
    shownAt: "가입 마지막 「참석 약속」 단계에서 「정기런(격주 수요일 저녁)을 추천해요」처럼 보여요. 열린 모임이 없을 때 「다음 정기런이 열리면 알려드릴게요」 안내에도 쓰여요.",
    visibility: "public",
    group: "operation",
    input: { kind: "regular_intro" },
  }),

  /**
   * 모임 만들기를 열 때 먼저 골라 두는 종목. 기본값 = 러닝(지금 기강 동작). 울산은 트레일러닝(2026-11-10 유저 결정).
   * 새로 만들 때만 쓴다 — 수정·「이 내용으로 새 모임」은 원래 모임 종목을 따른다.
   */
  "gathering.default_sport": defineCfg({
    schema: z.enum(GTHR_SPRT_TYPES),
    default: "running",
    label: "모임 기본 종목",
    description: "모임 만들기를 열면 먼저 골라져 있는 종목이에요.",
    shownAt: "모임 만들기를 열었을 때 먼저 골라져 있는 종목이에요.",
    visibility: "member",
    group: "operation",
    input: { kind: "choice", options: GTHR_SPRT_TYPES.map((v) => ({ value: v, label: gthrSprtLabels[v] })) },
  }),

  /**
   * 가입 폼 첫 화면에 띄우는 「다른 팀 가입이세요? 여기로 →」 안내 — 다른 팀에 가려다 이 주소로 온 사람을 넘겨준다.
   * 주소는 적지 않고 팀 코드만 둔다 — 링크는 접속 환경(운영·dev·로컬)에 맞는 그 팀 주소로 만든다(`teamLinkOrigin`).
   * 기본값 = 빈 목록(안내 없음).
   */
  "signup.other_teams": defineCfg({
    schema: z.array(z.object({ team_cd: z.string().trim().min(1), name: z.string().trim().min(1) })),
    default: [],
    label: "다른 팀 가입 안내",
    description: "가입 폼 첫 화면에 「○○ 가입이세요? 여기로 →」를 띄울 팀. 비우면 안 보여요.",
    shownAt: "이 크루 가입 화면 첫 칸에 뜨는 「○○ 가입이세요? 여기로 →」 안내예요.",
    visibility: "public",
    group: "operation",
    input: { kind: "team_links" },
    hidden: true,
  }),

  /**
   * 회비 기능 사용 여부. 기본값 = 지금 기강 동작(켬). 끈 팀은 회비가 화면 어디에도 안 나온다 —
   * 더보기 「회비 내역」 줄·미납 점, 회비 내역 화면, 관리자 회비 메뉴·대시보드 카드(울산, 2026-11-09 유저 결정).
   * 끈 팀의 회비 배치(DUES_EXEMPTION_BATCH)도 같이 꺼 둔다(마이그레이션에서 use_yn=false).
   */
  "feature.dues": defineCfg({
    schema: z.boolean(),
    default: true,
    label: "회비 기능",
    description: "회비 내역·미납 표시·관리자 회비 메뉴를 써요. 끄면 화면 어디에도 회비가 안 보여요.",
    shownAt: "끄면 더보기 「회비 내역」 줄, 회비 화면, 관리자 회비 메뉴, 가입 완료 화면 「계좌 등록」 링크, 약관의 회비 조항이 모두 빠져요.",
    visibility: "member",
    group: "feature",
    input: { kind: "boolean" },
    // 못 읽었을 땐 끈다 — 기본값(켬)으로 물러나면 회비를 안 쓰는 팀에 그 순간 회비 메뉴·관리자 회비 화면이 열린다
    onReadError: false,
  }),

  /**
   * 칭호 기능 사용 여부. 기본값 = 지금 기강 동작(켬). 끈 팀은 칭호가 화면 어디에도 안 나오고(대표 칭호·컬렉션·
   * 획득 이력·카드 칭호·기강이야기 「칭호획득」·전당 칭호·관리자 칭호 메뉴) **새로 주지도 않는다**(자동 평가·배치·
   * 관리자 수여). 이미 준 칭호 행은 지우지 않는다 — 다시 켜면 그대로 돌아온다(울산, 2026-11-10 유저 결정).
   * 카드 팝업은 DB 함수(`get_public_member_card`)가 같은 설정을 직접 읽는다(`team_feature_on`).
   */
  "feature.titles": defineCfg({
    schema: z.boolean(),
    default: true,
    label: "칭호 기능",
    description: "칭호를 주고 카드·프로필에 보여요. 끄면 새로 주지 않고 화면 어디에도 칭호가 안 보여요.",
    shownAt: "끄면 프로필 카드·랭킹·홈의 칭호, 내 컬렉션·획득 이력, 관리자 칭호 수여가 모두 빠지고 새로 주지도 않아요.",
    visibility: "member",
    group: "feature",
    input: { kind: "boolean" },
    // 못 읽었을 땐 끈다 — 회비와 같은 이유(켬으로 물러나면 칭호를 안 쓰는 팀에 그 순간 칭호 화면이 열린다)
    onReadError: false,
  }),

  /**
   * 러닝 프로필(가까운 역·평균 페이스·평균 거리 + 시작 정보 — 경력·주간 거리·기록) 사용 여부. 기본값 = 지금 기강 동작(켬).
   * 끈 팀은 **어디서도** 받지도 보이지도 않는다 — 가입 단계(「러닝 프로필」 단계째 없음)·신입 안내·프로필 카드·간단 카드·
   * 홈 리드·프로필 수정·관리자 회원 목록·개인정보처리방침·운영 MCP(2026-11-26 유저 결정 — 「팀이 안 쓰기로 한 기능은 같이
   * 적용돼야 한다」). 가입 목적은 러닝 프로필과 별개로 남는다. 값은 **사람 것**이라 지우지 않는다 — 다른 팀 주소에선 그대로 보인다.
   * 모비(울산)는 끔 — 수도권 지하철역·로드 페이스가 트레일 크루에 안 맞는다.
   */
  "feature.running_profile": defineCfg({
    schema: z.boolean(),
    default: true,
    label: "러닝 프로필",
    description:
      "가입·프로필에서 가까운 역·평균 페이스·평균 거리·시작 정보를 받고 카드에 보여요. 끄면 어디서도 안 보이고 가입 목적만 남아요.",
    shownAt: "끄면 가입 「러닝 프로필」 단계, 프로필 카드·홈 새 얼굴의 역·페이스·거리, 프로필 수정의 러닝 칸, 관리자 회원 상세, 약관의 해당 항목이 모두 빠져요.",
    visibility: "public",
    group: "feature",
    input: { kind: "boolean" },
    // 못 읽었을 땐 끈다 — 회비·칭호와 같은 이유(켬으로 물러나면 안 쓰는 팀(모비)에 그 순간 수도권 지하철역 가입 단계가 열린다).
    // 운영 MCP 쪽 읽기(`lib/mcp/queries.ts` readRunningProfileOn)도 실패하면 끈다
    onReadError: false,
  }),

  /**
   * 이 팀의 **기록 종목** — 기강의 전당(랭킹탭)에 세울 종목과 **그 순서**(저장된 순서대로 탭이 서고, 첫 종목이 처음
   * 열린다), 그리고 **프로필 카드의 기록 칸·페이스 추이**도 같은 종목만 세운다(카드 함수가 이 값을 실어 준다 —
   * `get_public_member_card` 의 `record_categories`, 2026-11-10 유저 결정). 기본값 = 넷 다
   * 지금 순서(기강). 하나만 고르면 랭킹탭 맨 위 종목 탭 줄을 없애고 그 종목 이름을 고정으로 세운다(울산 = 트레일러닝만,
   * 2026-11-10 유저 결정). 기록 등록(프로필)은 이 설정과 무관하다 — 어느 종목이든 올릴 수 있다.
   */
  "records.categories": defineCfg({
    schema: z
      .array(z.enum(RECORD_CATEGORY_KEYS))
      .min(1, "종목을 하나는 골라야 해요")
      .refine((v) => new Set(v).size === v.length, "같은 종목이 두 번 들어 있어요"),
    default: [...RECORD_CATEGORY_KEYS],
    label: "기록 종목",
    description:
      "랭킹탭과 프로필 기록 칸에 세울 종목과 순서. 위에 둔 종목이 랭킹탭에 먼저 나오고, 하나만 고르면 종목 탭 없이 그 종목만 보여요. 프로필엔 고른 종목의 기록 칸만 보여요(러닝이 없으면 FULL·HALF·10K와 페이스 그래프도 빠져요).",
    shownAt: "랭킹 탭 맨 위 종목 탭(순서 그대로)과 프로필 카드 「개인 기록」 칸에 나와요.",
    visibility: "public",
    group: "feature",
    input: { kind: "choices", options: RECORD_CATEGORIES, orderable: true },
  }),

  /**
   * 신입 안내(`/newbie`) 「이런 활동을 해요」 칩(#650, 2026-11-23). **기본값이 없다** — 비어 있으면 그 줄째 안 그린다.
   * 예전엔 기강 칩이 화면 코드에 박혀 기강에서만 섰다(`crewGuide`). 기강 값은 마이그레이션이 그대로 옮겨 넣었다.
   */
  "newbie.activities": defineCfg({
    schema: guideActivitiesSchema,
    default: [],
    label: "이런 활동을 해요",
    description: "신입 안내 화면에 칩으로 보여요. 한 줄에 하나씩(이모지 포함 20자까지). 비우면 이 줄이 안 보여요.",
    shownAt: "신입 안내 화면(가입 첫 화면 /newbie) 가운데 「이런 활동을 해요」 칩이에요.",
    visibility: "public",
    group: "newbie",
    input: { kind: "lines", placeholder: "예: 🏃 러닝" },
  }),

  /**
   * 신입 안내 「더 알아보기」 칸 목록 — 칸마다 제목·아이콘·마크다운 본문·보이기(#650). **기본값이 없다** — 보이는 칸이 없으면
   * 「더 알아보기」째 안 그린다. 기강의 안내말씀·회칙·모임 안전수칙·러닝팁은 마이그레이션이 지금 문구 그대로 옮겨 넣었다.
   */
  "newbie.sections": defineCfg({
    schema: guideSectionsSchema,
    default: [],
    label: "더 알아보기",
    description:
      "신입 안내 화면 아래 펼쳐 보는 칸들(안내말씀·회칙·안전수칙 등). 칸을 더하고 지우고 순서를 바꿀 수 있고, 본문은 게시판처럼 마크다운으로 써요. 엔터를 누르면 화면에서도 줄이 바뀌어요.",
    shownAt: "신입 안내 화면(가입 첫 화면 /newbie) 아래 「○○이 더 궁금하다면」 펼침 칸들이에요.",
    visibility: "public",
    group: "newbie",
    input: { kind: "guide_sections" },
  }),
} as const;

export type TeamCfgCd = keyof typeof TEAM_CFG_REGISTRY;
export type TeamCfgValue<K extends TeamCfgCd> = z.infer<(typeof TEAM_CFG_REGISTRY)[K]["schema"]>;

export function isTeamCfgCd(cd: string): cd is TeamCfgCd {
  return Object.prototype.hasOwnProperty.call(TEAM_CFG_REGISTRY, cd);
}

/**
 * DB 값 → 사전 형식. 행이 없거나(`undefined`) 형식이 틀리면 기본값.
 * 순수 함수 — 회귀 테스트 `lib/team-cfg/__tests__/registry.test.ts`.
 */
/** 설정을 못 읽었을 때 쓸 값 — 키의 `onReadError`, 없으면 기본값 */
export function resolveTeamCfgReadErrorValue<K extends TeamCfgCd>(cd: K): TeamCfgValue<K> {
  const def = TEAM_CFG_REGISTRY[cd] as CfgDef<z.ZodTypeAny>;
  return (def.onReadError !== undefined ? def.onReadError : def.default) as TeamCfgValue<K>;
}

export function resolveTeamCfgValue<K extends TeamCfgCd>(cd: K, raw: unknown): TeamCfgValue<K> {
  const def = TEAM_CFG_REGISTRY[cd];
  if (raw === undefined) return def.default as TeamCfgValue<K>;
  const parsed = def.schema.safeParse(raw);
  if (parsed.success) return parsed.data as TeamCfgValue<K>;
  console.warn(`[team-cfg] ${cd} 값이 형식에 맞지 않아 기본값으로 동작합니다`, parsed.error.issues[0]?.message);
  return def.default as TeamCfgValue<K>;
}
