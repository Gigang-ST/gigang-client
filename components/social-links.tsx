"use client";

import { useState } from "react";

import { getKakaoChatPassword } from "@/app/actions/social/get-kakao-password";
import { detectInAppBrowser, openExternalBrowser } from "@/components/in-app-browser-gate";
import {
  GarminIcon,
  InstagramIcon,
  KakaoIcon,
  SomoimIcon,
} from "@/components/social-icons";
import { CardItem } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const KAKAO_OPEN_CHAT_URL = "https://open.kakao.com/o/grnMFGng";

/** 채널 넷. 아이콘은 단색 SVG라 `currentColor`로 테마를 따라간다(컬러 PNG를 대체) */
const SOCIAL_LINKS = [
  {
    key: "kakao",
    label: "오픈채팅",
    href: KAKAO_OPEN_CHAT_URL,
    Icon: KakaoIcon,
  },
  {
    key: "instagram",
    label: "인스타",
    href: "https://www.instagram.com/team_gigang",
    Icon: InstagramIcon,
  },
  {
    key: "somoim",
    label: "소모임",
    href: "https://www.somoim.co.kr/3beed52a-0620-11ef-a71d-0aebcbdc4a071",
    Icon: SomoimIcon,
  },
  {
    key: "garmin",
    label: "가민",
    href: "https://connect.garmin.com/app/group/4857390",
    Icon: GarminIcon,
  },
];

export function SocialLinksRow() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex items-center justify-center gap-5">
        {SOCIAL_LINKS.map(({ key, label, href, Icon }) =>
          key === "kakao" ? (
            <button
              key={key}
              type="button"
              onClick={() => setOpen(true)}
              className="flex flex-col items-center gap-1"
            >
              <Icon className="size-8 text-foreground" />
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
              <Icon className="size-8 text-foreground" />
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
          <button
            className="flex h-12 items-center justify-center rounded-xl bg-primary text-[15px] font-bold text-primary-foreground"
            onClick={() => {
              setOpen(false);
              const inApp = detectInAppBrowser();
              if (inApp) openExternalBrowser(window.location.origin + "/auth/login");
              else window.location.href = "/auth/login";
            }}
          >
            회원가입 / 로그인하기
          </button>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function SocialLinksGrid() {
  const [open, setOpen] = useState(false);
  // null = 미조회, undefined = 조회 완료(비멤버), string = 비밀번호
  const [kakaoChatPassword, setKakaoChatPassword] = useState<string | null | undefined>(null);
  const [loading, setLoading] = useState(false);

  /** 카카오 버튼 클릭 시 서버 액션으로 비밀번호 조회 */
  const handleKakaoClick = async () => {
    setOpen(true);
    if (kakaoChatPassword !== null || loading) return; // 이미 조회됐거나 조회 중
    setLoading(true);
    try {
      const pw = await getKakaoChatPassword();
      // null(비멤버)은 undefined로 구분하여 "미조회(null)" 상태와 구별
      setKakaoChatPassword(pw ?? undefined);
    } finally {
      setLoading(false);
    }
  };

  const isMember = typeof kakaoChatPassword === "string";

  return (
    <>
      {/* 판권면 — 지면 맨 끝에서 크루 바깥으로 나가는 문. 다른 존과 같은 괘선·라벨을 써야
          별도 위젯이 아니라 이 신문의 마지막 단으로 읽힌다 */}
      <div className="flex flex-col">
        <div className="rule-section flex items-center justify-between gap-2 pb-2">
          <h2 className="font-numeric text-[11px] font-medium uppercase tracking-[0.2em] text-foreground">
            Social
          </h2>
        </div>
        <p className="pt-2.5 font-serif text-[15px] leading-snug text-muted-foreground">
          기강이 모여 있는 곳
        </p>
        <div className="grid grid-cols-4 gap-2.5 pt-3">
          {SOCIAL_LINKS.map(({ key, label, href, Icon }) =>
            key === "kakao" ? (
              <CardItem asChild key={key} className="flex flex-col items-center gap-2 py-3">
                <button type="button" onClick={handleKakaoClick}>
                  <Icon className="size-7 text-foreground" />
                  <span className="whitespace-nowrap font-serif text-[13px] text-foreground">
                    {label}
                  </span>
                </button>
              </CardItem>
            ) : (
              <CardItem asChild key={key} className="flex flex-col items-center gap-2 py-3">
                <a href={href} target="_blank" rel="noopener noreferrer">
                  <Icon className="size-7 text-foreground" />
                  <span className="whitespace-nowrap font-serif text-[13px] text-foreground">
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
          {loading ? (
            // 비밀번호 조회 중 스피너
            <div className="flex items-center justify-center py-6">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
            </div>
          ) : isMember ? (
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
              <button
                className="flex h-12 items-center justify-center rounded-xl bg-primary text-[15px] font-bold text-primary-foreground"
                onClick={() => {
                  setOpen(false);
                  const inApp = detectInAppBrowser();
                  if (inApp) openExternalBrowser(window.location.origin + "/auth/login");
                  else window.location.href = "/auth/login";
                }}
              >
                회원가입 / 로그인하기
              </button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
