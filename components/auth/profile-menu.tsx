"use client";

import { useEffect, useRef, useState } from "react";
import { User } from "lucide-react";
import Link from "next/link";
import { LogoutButton } from "@/components/auth/logout-button";
import { createClient } from "@/lib/supabase/client";

export function ProfileMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setIsOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    const supabase = createClient();

    const loadUser = async () => {
      const { data } = await supabase.auth.getUser();
      setHasSession(Boolean(data.user));
    };

    void loadUser();

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(Boolean(session?.user));
      if (!session?.user) {
        setIsOpen(false);
      }
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  // 로딩 중이거나 비로그인: 클릭 시 로그인 페이지로 이동
  if (!hasSession) {
    return (
      <Link
        href="/auth/login"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/5 text-white/80 transition hover:border-white/40 hover:text-white"
        aria-label="로그인"
      >
        <User size={18} />
      </Link>
    );
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/5 text-white/80 transition hover:border-white/40 hover:text-white"
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <User size={18} />
        <span className="sr-only">프로필 메뉴</span>
      </button>

      {isOpen ? (
        <div
          ref={menuRef}
          role="menu"
          className="absolute right-0 mt-3 w-40 rounded-md border border-white/10 bg-black/80 p-2 text-white shadow-lg backdrop-blur"
        >
          <Link
            href="/profile"
            className="flex h-8 w-full items-center rounded-md px-2 text-sm text-white hover:bg-white/10"
          >
            프로필
          </Link>
          <LogoutButton
            variant="ghost"
            size="sm"
            className="h-8 w-full justify-start text-white hover:bg-white/10 hover:text-white"
          />
        </div>
      ) : null}
    </div>
  );
}
