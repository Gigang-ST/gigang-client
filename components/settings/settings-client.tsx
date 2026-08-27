"use client";

import { Fragment, useState } from "react";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import {
  ChevronRight,
  UserPen,
  CreditCard,
  Wallet,
  ShieldCheck,
  LifeBuoy,
  LogOut,
  Trash2,
  Moon,
  Trophy,
  MessageSquare,
  KeyRound,
  Megaphone,
  Zap,
  CalendarDays,
} from "lucide-react";

import { markBoardTypeRead } from "@/app/actions/mark-board-type-read";
import { APP_VERSION } from "@/lib/app-version";
import { nowKST } from "@/lib/dayjs";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { WeekStart } from "@/lib/week-start";

import { HelpTip } from "@/components/common/help-tip";
import { ThemeToggle } from "@/components/common/theme-toggle";
import { Body, Caption, Micro, SectionLabel } from "@/components/common/typography";
import { SOCIAL_HELP_TEXT, SocialTiles } from "@/components/social-links";
import { WeekStartControl } from "@/components/settings/week-start-control";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * 더보기 화면 — 햄버거 뒤의 큰 방. 주소는 `/settings` 그대로다(북마크·알림 딥링크·
 * `InfoBackHeader`의 `/mcp-tokens` 폴백이 전부 이 경로를 가리킨다). 바뀐 건 **화면이 자기를 뭐라고
 * 부르는가**와 그 안의 정렬이다.
 *
 * ## 한 화면, 두 덩어리
 *
 * 위는 **어디론가 가는 문**(소셜·내 것·크루), 아래는 **한 번 정하거나 평생 안 누르는 것**
 * (표시 설정·계정·약관). 사이를 굵은 띠 하나로 가른다. 예전엔 7섹션 18줄이 성격 구분 없이
 * 한 줄로 늘어서서, 프로필 수정과 이용약관과 다크모드가 같은 무게로 읽혔다.
 *
 * **새 항목은 이 질문으로 자리를 정한다 — "눌러서 어디론가 가나?"** 가면 위, 아니면 아래.
 * 애매하면 "이걸 한 달에 한 번이라도 누르나"를 묻는다(누르면 위).
 *
 * ## 소셜이 맨 위인 이유
 *
 * 오픈채팅 비번을 다시 볼 곳이 전광판 지면 맨 끝뿐이라(§`story-client`의 판권면) 가입 때
 * 지나친 사람은 못 찾아 문의로 왔다. 사람이 못 찾을 때 여는 방이 여기라, 답이 여기 있어야
 * 한다. 격자는 홈과 **같은 컴포넌트**(`SocialTiles`)를 쓴다 — 따로 만들면 채널이 하나 늘 때
 * 한쪽만 고쳐 어긋난다.
 *
 * ## 딥링크
 *
 * `/settings?social=kakao`로 들어오면 비번 다이얼로그가 바로 열린다. 운영진이 문의에
 * 길 안내를 타이핑하는 대신 링크 한 줄로 답하게 하는 것이 이 파라미터의 목적이다.
 * 비회원에게 링크가 새어 나가도 비번은 안 나간다 — `getKakaoChatPassword()`가 서버에서
 * 멤버 여부를 다시 판정한다.
 */

type RowTone = "default" | "primary" | "destructive";

type MenuItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

/** 내 것 — 나에 관한 것을 보고 고치는 자리 */
const myItems: MenuItem[] = [
  { label: "프로필 수정", href: "/profile/edit", icon: UserPen },
  { label: "계좌 정보", href: "/profile/bank", icon: CreditCard },
  { label: "회비 내역", href: "/profile/dues", icon: Wallet },
  { label: "건의하기", href: "/profile/feedback", icon: MessageSquare },
];

/**
 * 크루 — 크루 쪽으로 나가는 문.
 *
 * - `대회 목록`: 예전 TEAM 섹션(한 줄짜리)을 흡수했다. ⚠️ **`/races`로 가는 실사용
 *   진입점이 지금 이 줄 하나뿐이다** — 일정탭·랭킹탭에서 대회로 가는 길을 따로 내기 전에는
 *   여기서 뺄 수 없다(별도 건).
 * - `기강 소개`: 예전 이름은 "도움말 및 지원"이었는데 목적지(`/join`)는 크루 소개·모임장소·
 *   회칙이라 이름이 딴소리를 했다. 문의 창구는 위 "건의하기"가 이미 맡고 있다.
 */
const crewItems: MenuItem[] = [
  { label: "대회 목록", href: "/races", icon: Trophy },
  { label: "기강 소개", href: "/join", icon: LifeBuoy },
];

/**
 * 법적 문서 — 푸터로 내려간 셋.
 *
 * 예전엔 INFORMATION 섹션에서 각각 한 줄씩 차지했는데, 눌릴 일이 거의 없는 문서가 그 섹션의
 * 대부분이었다. 법적으로는 **접근 가능하면 충분**하고 푸터가 원래 이 문서들의 자리다.
 */
const legalItems = [
  { label: "이용약관", href: "/terms" },
  { label: "개인정보 처리방침", href: "/privacy" },
  { label: "운영 정책", href: "/policy" },
];

/**
 * 더보기·설정 공통 행.
 *
 * 예전엔 같은 마크업이 그룹마다 복제돼 있어(Link 3벌 + button 2벌) dot 규칙이나 여백을
 * 고칠 때 다섯 군데를 찾아다녀야 했다. 한 곳으로 모은다.
 *
 * - `href` → `Link`, `onClick`·`disabled` → `button`, 아무것도 없으면 컨트롤 행(토글·세그먼트)
 * - `trailing`을 주면 그걸 오른쪽에 세우고 chevron은 생략한다
 * - chevron은 **이동 행에만** 선다. 로그아웃처럼 그 자리에서 실행되는 행은 `chevron={false}`
 */
function MenuRow({
  icon: Icon,
  label,
  sub,
  href,
  onClick,
  dot = false,
  dotLabel,
  trailing,
  chevron,
  disabled = false,
  tone = "default",
}: {
  icon: LucideIcon;
  label: string;
  /** 라벨 밑 한 줄 — 이 설정이 **다른 화면**에서만 결과가 보일 때 어디인지 적는다 */
  sub?: string;
  href?: string;
  onClick?: () => void;
  /** 안읽음·미납 점. 색만으로는 뜻이 안 전해지므로 `dotLabel`을 스크린리더에 남긴다 */
  dot?: boolean;
  dotLabel?: string;
  trailing?: ReactNode;
  /** 기본은 "trailing이 없는 이동 행". 실행 행(로그아웃)은 `false`로 끈다 */
  chevron?: boolean;
  /** 아직 못 쓰는 줄. 눌리지 않고 흐려진다 */
  disabled?: boolean;
  tone?: RowTone;
}) {
  const iconTone =
    tone === "primary"
      ? "text-primary"
      : tone === "destructive"
        ? "text-destructive"
        : "text-muted-foreground";
  const textTone = tone === "destructive" ? "text-destructive" : "text-foreground";
  // chevron은 "이동한다"는 약속이다. trailing이 이미 오른쪽을 쓰고 있거나 그 자리에서
  // 실행되는 행이면 세우지 않는다.
  const showChevron =
    chevron ?? (trailing === undefined && (href !== undefined || onClick !== undefined));

  const inner = (
    <>
      <div className="flex min-w-0 items-center gap-3">
        <Icon className={cn("size-5 shrink-0", iconTone)} />
        <div className="flex min-w-0 flex-col">
          <Body className={cn("font-medium", textTone)}>{label}</Body>
          {sub && <Caption>{sub}</Caption>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {dot && (
          <>
            <span aria-hidden className="size-1.5 rounded-full bg-destructive" />
            <span className="sr-only">{dotLabel}</span>
          </>
        )}
        {trailing}
        {showChevron && <ChevronRight className="size-5 text-border" />}
      </div>
    </>
  );

  // 포커스 링은 여기 한 곳에서 준다 — 예전엔 계정 행만 `Button`이 그리고 나머지 링크 행엔
  // 아예 없었다. 키보드로 훑으면 어디에 있는지 알 수 없는 줄이 대부분이었다는 뜻이다.
  const rowClass = cn(
    "flex w-full items-center justify-between gap-3 border-b border-border py-4 text-left",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    "disabled:opacity-50",
  );

  if (href) {
    return (
      <Link href={href} className={rowClass}>
        {inner}
      </Link>
    );
  }
  if (onClick || disabled) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={rowClass}
      >
        {inner}
      </button>
    );
  }
  return <div className={rowClass}>{inner}</div>;
}

export function SettingsClient({
  isAdmin,
  boardUnread,
  duesUnpaid = false,
  weekStart,
}: {
  isAdmin: boolean;
  /** 공지·업데이트 안읽음 — 각 메뉴 옆 dot. 없으면 둘 다 false로 온다 */
  boardUnread?: { notice: boolean; update: boolean };
  /** 회비 잔액이 마이너스인가 — "회비 내역" 줄 옆 dot */
  duesUnpaid?: boolean;
  /** 주 시작 요일 — 서버가 쿠키에서 읽어 넘긴다(§lib/week-start) */
  weekStart: WeekStart;
}) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  // 안읽음은 낙관적으로 끈다 — 눌러서 게시판으로 넘어가는 순간 dot을 지운다(서버 왕복을
  // 기다리면 넘어간 뒤에도 잠깐 점이 남는다). 서버 읽음 처리는 fire-and-forget.
  const [unread, setUnread] = useState(
    boardUnread ?? { notice: false, update: false },
  );

  // 딥링크 — `?social=kakao`면 비번 다이얼로그를 열어 준다(위 §딥링크).
  // 칭호 이력 시트(`/profile?ttl=history`)와 같은 방식이다.
  const searchParams = useSearchParams();
  const wantKakao = searchParams.get("social") === "kakao";

  function openBoard(tab: "notice" | "update") {
    if (unread[tab]) {
      setUnread((u) => ({ ...u, [tab]: false }));
      void markBoardTypeRead(tab);
    }
    router.push(`/board?tab=${tab}`);
  }

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      setLoggingOut(false);
      alert("로그아웃에 실패했습니다. 다시 시도해 주세요.");
      return;
    }
    router.refresh();
    router.push("/auth/login");
  };

  return (
    <div className="flex flex-col pb-6">
      {/* ══════════ 위 덩어리 — 어디론가 가는 문 ══════════ */}
      <div className="flex flex-col gap-8 px-6 pt-4">
        {/* SOCIAL — 화면 최상단. 못 찾는 사람이 여는 방의 첫 칸이 답이어야 한다.
            헤더는 아래 그룹들과 같은 `SectionLabel` 층으로 그린다 — 전광판의 존 괘선
            (`StoryZoneHeader`)을 여기 가져오면 목록 사이에 남의 어휘가 끼어든다. */}
        <div className="flex flex-col">
          <div className="flex items-center gap-2.5 pb-3">
            <SectionLabel>SOCIAL</SectionLabel>
            <Caption>기강이 모여 있는 곳</Caption>
            <div className="-my-2 ml-auto flex items-center">
              <HelpTip title="기강 채널">{SOCIAL_HELP_TEXT}</HelpTip>
            </div>
          </div>
          <SocialTiles autoOpenKakao={wantKakao} />
        </div>

        {/* MY */}
        <div className="flex flex-col">
          <SectionLabel>MY</SectionLabel>
          {myItems.map((item) => (
            <MenuRow
              key={item.href}
              icon={item.icon}
              label={item.label}
              href={item.href}
              // 회비 미납 dot은 **이 줄에만** 찍는다 — 사용자가 지울 수 없는 점이라
              // 햄버거까지 올리면 미납자가 몇 주씩 이고 다닌다(§HeaderActions).
              dot={item.href === "/profile/dues" && duesUnpaid}
              dotLabel="회비 미납"
            />
          ))}
        </div>

        {/* CREW — 공지·업데이트(옛 BOARD) + 대회 목록(옛 TEAM) + 기강 소개.
            한 줄짜리 섹션 둘을 흡수했다: 섹션 이름만 있고 내용이 한 줄이면 그 이름은
            정보가 아니라 여백이다. */}
        <div className="flex flex-col">
          <SectionLabel>CREW</SectionLabel>
          {/* 관리자 페이지는 **CREW 맨 위**다. 자기 섹션을 갖지 않는 건 한 줄짜리 ADMIN
              섹션이 위에서 흡수한 TEAM/BOARD와 같은 꼴이 되기 때문이고, 그중에서도 맨 위인
              건 운영진이 이 화면에서 가장 자주 누르는 줄이라서다. 목적지도 성격이 맞는다 —
              `/admin`은 하위 20여 개를 거느린 **다른 구역으로 가는 문**이라, 폼 하나 고치고
              나오는 MY의 잎사귀들보다 대회 목록·기강 소개와 한 무리다.
              primary 색이 "관리자 것"임을 이미 말하므로 라벨을 따로 달지 않는다. */}
          {isAdmin && (
            <MenuRow
              icon={ShieldCheck}
              label="관리자 페이지"
              href="/admin"
              tone="primary"
            />
          )}
          <MenuRow
            icon={Megaphone}
            label="공지사항"
            onClick={() => openBoard("notice")}
            dot={unread.notice}
            dotLabel="읽지 않은 공지"
          />
          <MenuRow
            icon={Zap}
            label="업데이트"
            onClick={() => openBoard("update")}
            dot={unread.update}
            dotLabel="읽지 않은 업데이트"
          />
          {crewItems.map((item) => (
            <MenuRow
              key={item.href}
              icon={item.icon}
              label={item.label}
              href={item.href}
            />
          ))}
        </div>
      </div>

      {/* ══════════ 두 덩어리를 가르는 띠 ══════════
          `px-6` 바깥이라 지면 좌우 끝까지 간다 — 안쪽에 두면 여백이 남아 그냥 굵은 구분선이
          되고, 층이 갈렸다는 게 안 읽힌다. */}
      <div className="mt-8 h-2 border-y border-border bg-secondary" />

      {/* ══════════ 아래 덩어리 — 한 번 정하거나 평생 안 누르는 것 ══════════ */}
      <div className="flex flex-col px-6 pt-6">
        <Body className="font-bold">설정</Body>

        <div className="flex flex-col gap-8 pt-5">
          {/* 앱 설정 */}
          <div className="flex flex-col">
            <SectionLabel className="font-semibold tracking-normal">
              앱 설정
            </SectionLabel>
            <MenuRow
              icon={Moon}
              label="다크모드"
              trailing={<ThemeToggle />}
            />
            {/* 어디에 적용되는지를 라벨 밑에 적는다 — 이 설정은 **다른 화면**(일정탭)에서만
                결과가 보여서, 바꾸고 나서 이 화면엔 아무 변화가 없다. */}
            <MenuRow
              icon={CalendarDays}
              label="주 시작 요일"
              sub="일정탭 캘린더"
              trailing={<WeekStartControl weekStart={weekStart} />}
            />
            {/* MCP 토큰은 여기로 내려왔다 — 예전엔 프로필 수정 바로 옆이라 일반 회원 눈에
                제일 먼저 걸렸는데, 이름만으로는 뭔지 알 수 없는 개발자용 기능이다.
                캡션으로 무엇에 쓰는지 한 줄 붙인다. */}
            <MenuRow
              icon={KeyRound}
              label="MCP 토큰"
              sub="AI 도구 연결용"
              href="/mcp-tokens"
            />
          </div>

          {/* 계정 */}
          <div className="flex flex-col">
            <SectionLabel className="font-semibold tracking-normal">
              계정
            </SectionLabel>
            {/* 이 둘도 `MenuRow`를 탄다 — 여기만 `Button`을 쓰면 행 여백·구분선 규칙이 두
                곳에 살아서 한쪽만 고쳐진다(행 마크업을 하나로 모은 이유가 그것이다).
                chevron은 끈다: 눌러도 이동하지 않고 그 자리에서 실행된다. */}
            <MenuRow
              icon={LogOut}
              label={loggingOut ? "로그아웃 중..." : "로그아웃"}
              onClick={handleLogout}
              disabled={loggingOut}
              chevron={false}
              tone="destructive"
            />
            {/* `onClick`을 주지 않는다 — `disabled` 버튼은 어차피 발화하지 않아서
                `alert("준비 중입니다")`가 죽은 코드였다. 안내는 오른쪽 라벨이 한다. */}
            <MenuRow
              icon={Trash2}
              label="회원 탈퇴"
              disabled
              tone="destructive"
              trailing={<Micro>준비 중입니다</Micro>}
            />
          </div>
        </div>
      </div>

      {/* ══════════ 푸터 ══════════ */}
      <div className="flex flex-col items-center gap-1.5 px-6 pt-10">
        {/* 약관 셋. `py-2`로 세로 히트 영역을 벌린다 — 12px 글자를 손가락으로 겨냥해야 하니
            글자 크기만 믿고 눕히면 누르기 어려운 링크가 된다. 구분점은 장식이라 aria에서 뺀다. */}
        <div className="flex flex-wrap items-center justify-center gap-x-2">
          {legalItems.map((item, i) => (
            <Fragment key={item.href}>
              {i > 0 && (
                <span aria-hidden className="text-border">
                  ·
                </span>
              )}
              <Link
                href={item.href}
                className="py-2 text-xs text-muted-foreground underline underline-offset-2"
              >
                {item.label}
              </Link>
            </Fragment>
          ))}
        </div>
        {/* 버전도 푸터로 왔다 — 한 줄을 차지할 만큼 자주 보는 값이 아니고, 문의할 때
            찾을 수만 있으면 된다. */}
        <div className="flex items-baseline gap-1.5">
          <span className="text-sm font-bold text-muted-foreground">기강</span>
          <span className="font-numeric text-xs text-muted-foreground/70">
            {APP_VERSION}
          </span>
        </div>
        <span className="text-xs text-muted-foreground/70">{`© ${nowKST().year()} 기강 스포츠 팀`}</span>
        <Micro className="text-muted-foreground/70">
          운동을 좋아하는 사람들이 함께 만드는 팀
        </Micro>
      </div>
    </div>
  );
}
