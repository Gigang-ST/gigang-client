"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CardItem } from "@/components/ui/card";
import { SectionLabel } from "@/components/common/typography";

const KAKAO_OPEN_CHAT_URL = "https://open.kakao.com/o/grnMFGng";

const SOCIAL_LINKS = [
  {
    key: "kakao",
    label: "오픈채팅",
    href: KAKAO_OPEN_CHAT_URL,
    logo: "/kakao.png",
  },
  {
    key: "instagram",
    label: "인스타",
    href: "https://www.instagram.com/team_gigang",
    logo: "/Instagram.png",
  },
  {
    key: "somoim",
    label: "소모임",
    href: "https://www.somoim.co.kr/3beed52a-0620-11ef-a71d-0aebcbdc4a071",
    logo: "/somoim.png",
  },
  {
    key: "garmin",
    label: "가민",
    href: "https://connect.garmin.com/app/group/4857390",
    logo: "/garmin.png",
  },
] as const;

export function SocialLinksRow() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex items-center justify-center gap-5">
        {SOCIAL_LINKS.map(({ key, label, href, logo }) =>
          key === "kakao" ? (
            <button
              key={key}
              type="button"
              onClick={() => setOpen(true)}
              className="flex flex-col items-center gap-1"
            >
              <Image src={logo} alt={label} width={32} height={32} />
              <span className="text-[10px] font-medium text-muted-foreground">
                {label}
              </span>
            </button>
          ) : (
            <a
              key={key}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-1"
            >
              <Image src={logo} alt={label} width={32} height={32} />
              <span className="text-[10px] font-medium text-muted-foreground">
                {label}
              </span>
            </a>
          ),
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xs rounded-2xl">
          <DialogHeader>
            <DialogTitle>오픈채팅 참여</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            오픈채팅은 비밀번호가 필요합니다.
            <br />
            회원가입 후 비밀번호를 확인할 수 있어요.
          </p>
          <Link
            href="/auth/login"
            className="flex h-12 items-center justify-center rounded-xl bg-primary text-[15px] font-bold text-primary-foreground"
            onClick={() => setOpen(false)}
          >
            회원가입 / 로그인하기
          </Link>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function SocialLinksGrid({
  kakaoChatPassword,
}: {
  kakaoChatPassword?: string;
}) {
  const [open, setOpen] = useState(false);
  const isMember = !!kakaoChatPassword;

  return (
    <>
      <div className="flex flex-col gap-4">
        <SectionLabel>SOCIAL</SectionLabel>
        <div className="grid grid-cols-4 gap-2.5">
          {SOCIAL_LINKS.map(({ key, label, href, logo }) =>
            key === "kakao" ? (
              <CardItem asChild key={key} className="flex flex-col items-center gap-2 py-3">
                <button
                  type="button"
                  onClick={() => setOpen(true)}
                >
                  <Image src={logo} alt={label} width={28} height={28} />
                  <span className="text-xs font-semibold text-foreground">
                    {label}
                  </span>
                </button>
              </CardItem>
            ) : (
              <CardItem asChild key={key} className="flex flex-col items-center gap-2 py-3">
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Image src={logo} alt={label} width={28} height={28} />
                  <span className="text-xs font-semibold text-foreground">
                    {label}
                  </span>
                </a>
              </CardItem>
            ),
          )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xs rounded-2xl">
          <DialogHeader>
            <DialogTitle>오픈채팅 참여</DialogTitle>
          </DialogHeader>
          {isMember ? (
            <>
              <div className="rounded-2xl border border-border bg-secondary/50 px-5 py-4 text-center">
                <p className="text-xs text-muted-foreground">
                  오픈채팅 비밀번호
                </p>
                <p className="mt-1 text-2xl font-bold tracking-widest text-foreground">
                  {kakaoChatPassword}
                </p>
              </div>
              <a
                href={KAKAO_OPEN_CHAT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#FEE500] text-[15px] font-bold text-neutral-900"
              >
                카카오톡 오픈채팅 참여하기
              </a>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                오픈채팅은 비밀번호가 필요합니다.
                <br />
                회원가입 후 비밀번호를 확인할 수 있어요.
              </p>
              <Link
                href="/auth/login"
                className="flex h-12 items-center justify-center rounded-xl bg-primary text-[15px] font-bold text-primary-foreground"
                onClick={() => setOpen(false)}
              >
                회원가입 / 로그인하기
              </Link>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
