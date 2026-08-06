"use client";

import { useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  ChevronRight,
  UserPen,
  CreditCard,
  Wallet,
  FileText,
  ShieldCheck,
  ScrollText,
  LifeBuoy,
  Info,
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
import { createClient } from "@/lib/supabase/client";
import type { WeekStart } from "@/lib/week-start";

import { ThemeToggle } from "@/components/common/theme-toggle";
import { Caption, SectionLabel } from "@/components/common/typography";
import { WeekStartControl } from "@/components/settings/week-start-control";
import { Button } from "@/components/ui/button";

import type { LucideIcon } from "lucide-react";


type MenuItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

const accountItems: MenuItem[] = [
  { label: "프로필 수정", href: "/profile/edit", icon: UserPen },
  { label: "계좌 정보", href: "/profile/bank", icon: CreditCard },
  { label: "회비 내역", href: "/profile/dues", icon: Wallet },
  { label: "건의하기", href: "/profile/feedback", icon: MessageSquare },
  { label: "MCP 토큰", href: "/mcp-tokens", icon: KeyRound },
];

const teamItems: MenuItem[] = [
  { label: "대회 목록", href: "/races", icon: Trophy },
];

const adminItems: MenuItem[] = [
  { label: "관리자 페이지", href: "/admin", icon: ShieldCheck },
];

const infoItems: MenuItem[] = [
  { label: "이용약관", href: "/terms", icon: FileText },
  { label: "개인정보 처리방침", href: "/privacy", icon: ShieldCheck },
  { label: "운영 정책", href: "/policy", icon: ScrollText },
  { label: "도움말 및 지원", href: "/join", icon: LifeBuoy },
];

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
    <div className="flex flex-col gap-8 px-6 pb-6 pt-4">
      {/* ACCOUNT */}
      <div className="flex flex-col">
        <SectionLabel>ACCOUNT</SectionLabel>
        {accountItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center justify-between border-b border-border py-4"
          >
            <div className="flex items-center gap-3">
              <item.icon className="size-5 text-muted-foreground" />
              <span className="text-[15px] font-medium text-foreground">
                {item.label}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {/* 회비 미납 dot — 프로필탭의 바로가기 4버튼을 걷어내면서 이 줄이 유일한
                  표면이 됐다. **여기까지만 올라간다** — 햄버거 아이콘엔 안 단다(§HeaderActions:
                  미납은 사용자가 지울 수 없는 점이라 바깥에 두면 몇 주씩 켜져 있다).
                  색만으로는 뜻이 안 전해지므로 스크린리더용 텍스트를 함께 둔다. */}
              {item.href === "/profile/dues" && duesUnpaid && (
                <>
                  <span
                    aria-hidden
                    className="size-1.5 rounded-full bg-destructive"
                  />
                  <span className="sr-only">회비 미납</span>
                </>
              )}
              <ChevronRight className="size-5 text-border" />
            </div>
          </Link>
        ))}
      </div>

      {/* BOARD — 공지·업데이트. 게시판 아이콘을 걷어내며 여기로 왔다. 각 항목 옆 dot이
          안읽음을 가리키고, 눌러 들어가면 그 타입만 읽음 처리된다(실제로 본 것만). */}
      <div className="flex flex-col">
        <SectionLabel>BOARD</SectionLabel>
        <button
          type="button"
          onClick={() => openBoard("notice")}
          className="flex items-center justify-between border-b border-border py-4"
        >
          <div className="flex items-center gap-3">
            <Megaphone className="size-5 text-muted-foreground" />
            <span className="text-[15px] font-medium text-foreground">공지사항</span>
          </div>
          <div className="flex items-center gap-2">
            {unread.notice && (
              <span className="size-1.5 rounded-full bg-destructive" />
            )}
            <ChevronRight className="size-5 text-border" />
          </div>
        </button>
        <button
          type="button"
          onClick={() => openBoard("update")}
          className="flex items-center justify-between border-b border-border py-4"
        >
          <div className="flex items-center gap-3">
            <Zap className="size-5 text-muted-foreground" />
            <span className="text-[15px] font-medium text-foreground">업데이트</span>
          </div>
          <div className="flex items-center gap-2">
            {unread.update && (
              <span className="size-1.5 rounded-full bg-destructive" />
            )}
            <ChevronRight className="size-5 text-border" />
          </div>
        </button>
      </div>

      {/* TEAM */}
      <div className="flex flex-col">
        <SectionLabel>TEAM</SectionLabel>
        {teamItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center justify-between border-b border-border py-4"
          >
            <div className="flex items-center gap-3">
              <item.icon className="size-5 text-muted-foreground" />
              <span className="text-[15px] font-medium text-foreground">
                {item.label}
              </span>
            </div>
            <ChevronRight className="size-5 text-border" />
          </Link>
        ))}
      </div>

      {/* DISPLAY */}
      <div className="flex flex-col">
        <SectionLabel>DISPLAY</SectionLabel>
        <div className="flex items-center justify-between border-b border-border py-4">
          <div className="flex items-center gap-3">
            <Moon className="size-5 text-muted-foreground" />
            <span className="text-[15px] font-medium text-foreground">다크모드</span>
          </div>
          <ThemeToggle />
        </div>
        {/* 어디에 적용되는지를 라벨 밑에 적는다 — 이 설정은 **다른 화면**(일정탭)에서만
            결과가 보여서, 바꾸고 나서 이 화면에 아무 변화가 없다. */}
        <div className="flex items-center justify-between border-b border-border py-4">
          <div className="flex items-center gap-3">
            <CalendarDays className="size-5 text-muted-foreground" />
            <div className="flex flex-col">
              <span className="text-[15px] font-medium text-foreground">주 시작 요일</span>
              <Caption>일정탭 캘린더</Caption>
            </div>
          </div>
          <WeekStartControl weekStart={weekStart} />
        </div>
      </div>

      {/* ADMIN */}
      {isAdmin && (
        <div className="flex flex-col">
          <SectionLabel>ADMIN</SectionLabel>
          {adminItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center justify-between border-b border-border py-4"
            >
              <div className="flex items-center gap-3">
                <item.icon className="size-5 text-primary" />
                <span className="text-[15px] font-medium text-foreground">
                  {item.label}
                </span>
              </div>
              <ChevronRight className="size-5 text-border" />
            </Link>
          ))}
        </div>
      )}

      {/* INFORMATION */}
      <div className="flex flex-col">
        <SectionLabel>INFORMATION</SectionLabel>
        {infoItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center justify-between border-b border-border py-4"
          >
            <div className="flex items-center gap-3">
              <item.icon className="size-5 text-muted-foreground" />
              <span className="text-[15px] font-medium text-foreground">
                {item.label}
              </span>
            </div>
            <ChevronRight className="size-5 text-border" />
          </Link>
        ))}
        {/* 버전 정보 - chevron 없음 */}
        <div className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <Info className="size-5 text-muted-foreground" />
            <span className="text-[15px] font-medium text-foreground">
              버전 정보
            </span>
          </div>
          <span className="text-sm text-muted-foreground">{APP_VERSION}</span>
        </div>
      </div>

      {/* DANGER ZONE */}
      <div className="flex flex-col">
        <SectionLabel>DANGER ZONE</SectionLabel>
        <Button
          type="button"
          variant="ghost"
          onClick={handleLogout}
          disabled={loggingOut}
          className="h-auto w-full justify-start gap-3 rounded-none border-b border-border px-0 py-4"
        >
          <LogOut className="size-5 text-destructive" />
          <span className="text-[15px] font-medium text-destructive">
            {loggingOut ? "로그아웃 중..." : "로그아웃"}
          </span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled
          onClick={() => alert("준비 중입니다.")}
          className="h-auto w-full justify-start gap-3 rounded-none px-0 py-4"
        >
          <Trash2 className="size-5 text-destructive" />
          <span className="text-[15px] font-medium text-destructive">
            회원 탈퇴
          </span>
          <span className="ml-auto text-xs text-muted-foreground">
            준비 중입니다
          </span>
        </Button>
      </div>

      {/* Footer */}
      <div className="flex flex-col items-center gap-1.5 pt-6">
        <span className="text-sm font-bold text-muted-foreground">기강</span>
        <span className="text-xs text-muted-foreground/70">{`© ${new Date().getFullYear()} 기강 스포츠 팀`}</span>
        <span className="text-[11px] text-muted-foreground/70">
          운동을 좋아하는 사람들이 함께 만드는 팀
        </span>
      </div>
    </div>
  );
}
