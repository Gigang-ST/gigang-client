"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useMember } from "@/contexts/member-context";
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
  Users,
  Trophy,
  Timer,
  UserCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

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
  { label: "가입 승인", href: "/admin/approvals", icon: UserCheck },
  { label: "회원 관리", href: "/admin/members", icon: Users },
  { label: "대회 관리", href: "/admin/competitions", icon: Trophy },
  { label: "기록 관리", href: "/admin/records", icon: Timer },
];

const infoItems: MenuItem[] = [
  { label: "이용약관", href: "/terms", icon: FileText },
  { label: "개인정보 처리방침", href: "/privacy", icon: ShieldCheck },
  { label: "운영 정책", href: "/policy", icon: ScrollText },
  { label: "도움말 및 지원", href: "/join", icon: LifeBuoy },
];

export default function SettingsPage() {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const { member } = useMember();
  const isAdmin = member?.admin ?? false;

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
        <span className="text-xs font-semibold tracking-widest text-muted-foreground">
          ACCOUNT
        </span>
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
          <span className="text-xs font-semibold tracking-widest text-muted-foreground">
            ADMIN
          </span>
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
        <span className="text-xs font-semibold tracking-widest text-muted-foreground">
          INFORMATION
        </span>
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
          <span className="text-sm text-muted-foreground">v1.0.0</span>
        </div>
      </div>

      {/* DANGER ZONE */}
      <div className="flex flex-col">
        <span className="text-xs font-semibold tracking-widest text-muted-foreground">
          DANGER ZONE
        </span>
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className="flex items-center gap-3 border-b border-border py-4 disabled:opacity-50"
        >
          <LogOut className="size-5 text-destructive" />
          <span className="text-[15px] font-medium text-destructive">
            {loggingOut ? "로그아웃 중..." : "로그아웃"}
          </span>
        </button>
        <button
          type="button"
          disabled
          onClick={() => alert("준비 중입니다.")}
          className="flex items-center gap-3 py-4 opacity-50"
        >
          <Trash2 className="size-5 text-destructive" />
          <span className="text-[15px] font-medium text-destructive">
            회원 탈퇴
          </span>
          <span className="ml-auto text-xs text-muted-foreground">
            준비 중입니다
          </span>
        </button>
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
