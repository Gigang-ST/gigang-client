"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  ChevronRight,
  UserPen,
  CreditCard,
  FileText,
  ShieldCheck,
  ScrollText,
  LifeBuoy,
  Info,
  LogOut,
  Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SectionLabel } from "@/components/common/typography";
import { Button } from "@/components/ui/button";

type MenuItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

const accountItems: MenuItem[] = [
  { label: "프로필 수정", href: "/profile/edit", icon: UserPen },
  { label: "계좌 정보", href: "/profile/bank", icon: CreditCard },
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

export function SettingsClient({ isAdmin }: { isAdmin: boolean }) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

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
            <ChevronRight className="size-5 text-border" />
          </Link>
        ))}
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
          <span className="text-sm text-muted-foreground">{process.env.NEXT_PUBLIC_APP_VERSION ?? "v0.0.0"}</span>
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
