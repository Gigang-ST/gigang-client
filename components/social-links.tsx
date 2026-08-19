"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getKakaoChatPassword } from "@/app/actions/social/get-kakao-password";
import { detectInAppBrowser, openExternalBrowser } from "@/components/in-app-browser-gate";
import {
  GarminIcon,
  InstagramIcon,
  KakaoIcon,
  SomoimIcon,
} from "@/components/social-icons";
import { HelpTip } from "@/components/common/help-tip";
import { StoryZoneHeader } from "@/components/story/story-zone-header";
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

/**
 * 채널 블록 설명 — **전광판 판권면과 더보기가 같은 문장을 쓴다.**
 * 각자 타이핑해 두면 한쪽만 고쳐져 "여기선 비번이 보인다던데" 같은 어긋남이 생긴다.
 */
export const SOCIAL_HELP_TEXT =
  "기강 소식이 오가는 바깥 채널이에요. 오픈채팅 비밀번호는 가입한 기강인에게만 보여요.";

/**
 * 비번 다이얼로그의 상태 — **한 값으로 든다.**
 *
 * 예전엔 `password(null | undefined | string)`와 `loading(boolean)` 둘로 들고 있었는데,
 * 그러면 "아직 조회 전"(`null` + `loading=false`)이 "조회했는데 비멤버"와 **같은 화면**으로
 * 떨어진다. 실제로 그 조합이 새어서, 멤버가 카톡을 눌렀을 때 다이얼로그가 열리는 동안
 * **"회원가입 / 로그인하기"가 보였다** — React는 렌더를 먼저 하고 이펙트를 나중에 돌리므로,
 * 조회를 이펙트로 옮긴 순간 그 프레임이 반드시 한 번 지나간다(다이얼로그 열림 애니메이션
 * 내내 보인다).
 *
 * 유니온으로 들면 **그 조합 자체가 없다.** 타이밍을 맞추는 대신 표현할 수 없게 만든다.
 * 초기값도 `loading`이다 — 열자마자 우리가 아는 건 "아직 모른다"뿐이고, 그건 스피너다.
 */
type KakaoState =
  | { kind: "loading" }
  | { kind: "member"; password: string }
  | { kind: "guest" }
  | { kind: "error" };

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

/**
 * 채널 4칸 격자 + 오픈채팅 비번 다이얼로그. **헤더는 그리지 않는다.**
 *
 * 이 블록이 서는 지면이 둘인데 헤더 어휘가 다르기 때문이다 — 전광판 판권면은 존 괘선
 * (`StoryZoneHeader`), 더보기는 목록의 다른 그룹과 같은 `SectionLabel`. 헤더까지 여기서
 * 그리면 지면 하나가 남의 어휘를 뒤집어쓴다. 반대로 **링크 목록과 비번 조회 경로는 여기
 * 하나뿐이라**, 채널이 하나 늘어도 고칠 곳은 한 곳이다.
 */
export function SocialTiles({
  autoOpenKakao = false,
}: {
  /** 딥링크(`/settings?social=kakao`)로 들어왔나 — 마운트 직후 비번 다이얼로그를 연다 */
  autoOpenKakao?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<KakaoState>({ kind: "loading" });
  const started = useRef(false);

  // 딥링크로 들어오면 바로 연다. 운영진이 문의에 "홈 맨 아래로 내려가서 카톡 아이콘을…"을
  // 매번 타이핑하는 대신 링크 한 줄로 답할 수 있게 하는 것이 이 경로의 존재 이유다.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (autoOpenKakao) setOpen(true);
  }, [autoOpenKakao]);

  // 조회 → 결과 반영. **시작할 때 상태를 건드리지 않는다** — 초기값이 이미 `loading`이라
  // 불필요하고, 이펙트 안에서 동기 `setState`를 하면 열자마자 재렌더가 한 번 더 돈다
  // (`react-hooks/set-state-in-effect`가 잡는 그것이고, 이 버그의 원인이던 여분 프레임이다).
  const load = useCallback(async () => {
    try {
      const res = await getKakaoChatPassword();
      setState(
        res.status === "member"
          ? { kind: "member", password: res.password }
          : // `unavailable`(설정 사고)을 `guest`로 접지 않는다 — 멤버에게 "회원가입 하세요"가
            // 뜨는 게 정확히 이 화면이 겪은 오해다. 사용자에겐 "못 불러왔다"가 맞는 말이고,
            // 진짜 원인은 서버 로그가 말한다.
            res.status === "guest"
            ? { kind: "guest" }
            : { kind: "error" },
      );
    } catch {
      // 실패를 "비멤버"로 못 박지 않는다 — 네트워크가 한 번 흔들렸다고 멤버에게
      // "회원가입 하세요"를 띄우면 그게 바로 이 화면이 고치려던 오해다.
      setState({ kind: "error" });
    }
  }, []);

  // 비번 조회는 **다이얼로그가 열리는 순간**에 건다 — 클릭 핸들러에 두면 딥링크로 열린
  // 다이얼로그가 조회를 영영 안 해 스피너에 머문다. 여는 길이 둘이어도 조회 경로는 하나.
  // ref로 한 번만 쏜다(닫았다 다시 열어도 재조회하지 않는다. 에러는 '다시 시도'가 쏜다).
  useEffect(() => {
    if (!open || started.current) return;
    started.current = true;
    void load();
  }, [open, load]);

  return (
    <>
      <div className="grid grid-cols-4 gap-2.5">
        {SOCIAL_LINKS.map(({ key, label, href, Icon }) =>
          key === "kakao" ? (
            <CardItem asChild key={key} className="flex flex-col items-center gap-2 py-3">
              <button type="button" onClick={() => setOpen(true)}>
                <Icon className="size-7 text-foreground" />
                <span className="whitespace-nowrap text-[13px] text-foreground">
                  {label}
                </span>
              </button>
            </CardItem>
          ) : (
            <CardItem asChild key={key} className="flex flex-col items-center gap-2 py-3">
              <a href={href} target="_blank" rel="noopener noreferrer">
                <Icon className="size-7 text-foreground" />
                <span className="whitespace-nowrap text-[13px] text-foreground">
                  {label}
                </span>
              </a>
            </CardItem>
          ),
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xs rounded-2xl">
          <DialogHeader>
            <DialogTitle>오픈채팅 참여</DialogTitle>
          </DialogHeader>
          {/* 아직 모르는 것과 비멤버인 것은 다르다 — 모르면 스피너다(§KakaoState) */}
          {state.kind === "loading" ? (
            <div className="flex items-center justify-center py-6">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
            </div>
          ) : state.kind === "member" ? (
            <>
              <div className="rounded-2xl border border-border bg-secondary/50 px-5 py-4 text-center">
                <p className="text-xs text-muted-foreground">
                  오픈채팅 비밀번호
                </p>
                <p className="mt-1 text-2xl font-bold tracking-widest text-foreground">
                  {state.password}
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
          ) : state.kind === "error" ? (
            <>
              <p className="text-sm text-muted-foreground">
                비밀번호를 불러오지 못했어요.
                <br />
                잠시 뒤 다시 시도해 주세요.
              </p>
              <button
                type="button"
                onClick={() => {
                  setState({ kind: "loading" });
                  void load();
                }}
                className="flex h-12 items-center justify-center rounded-xl bg-primary text-[15px] font-bold text-primary-foreground"
              >
                다시 시도
              </button>
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

/**
 * 전광판 판권면 — 지면 맨 끝에서 크루 바깥으로 나가는 문. 다른 존과 같은 괘선·라벨을 써야
 * 별도 위젯이 아니라 이 신문의 마지막 단으로 읽힌다.
 *
 * 더보기 최상단에도 같은 격자가 서지만(§`settings-client`) **여기를 걷어내지 않는다** —
 * 발견 채널을 둘로 두는 것이 목적이고, 판권면은 이 지면의 마감 장치이기도 하다.
 */
export function SocialLinksGrid() {
  return (
    <div className="flex flex-col">
      <StoryZoneHeader
        label="Social"
        lead="기강이 모여 있는 곳"
        action={<HelpTip title="기강 채널">{SOCIAL_HELP_TEXT}</HelpTip>}
      />
      <div className="pt-3">
        <SocialTiles />
      </div>
    </div>
  );
}
