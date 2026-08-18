"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";

import {
  CalendarDays,
  Camera,
  ChevronDown,
  ChevronRight,
  History,
  Lock,
  Pencil,
  Plus,
} from "lucide-react";

import { goToLogin } from "@/lib/auth/go-to-login";
import { dayjs, secondsToTime } from "@/lib/dayjs";
import {
  buildPbRows,
  getActivityMood,
  getDaysSinceJoin,
  getMemberIntro,
  getRaceDday,
  getRunningProfileSlots,
  hasPaceTrend,
  pbEmptyValue,
  toPaceChartRecords,
  MOOD_STEPS,
} from "@/lib/member-card";
import { RCTN_LABEL } from "@/lib/story-reaction";
import { cn } from "@/lib/utils";

import { Avatar } from "@/components/common/avatar";
import { EmptyState } from "@/components/common/empty-state";
import { HelpTip } from "@/components/common/help-tip";
import { TitleBadge } from "@/components/common/title-badge";
import { Body, Caption, Micro, SectionLabel } from "@/components/common/typography";
import { PaceChartDynamic } from "@/components/profile/pace-chart-dynamic";
import { Button } from "@/components/ui/button";

import type { ActivityMood } from "@/lib/member-card";
import type { MemberCardData } from "@/lib/queries/member-card";

/** 점등 시퀀스 — 플리커(0.28s) 직후 조명이 들어온다 */
const IGNITE_LIT_MS = 300;

/** 접힌 상태에서 보여줄 칭호 수 — 한 줄에 들어가는 만큼 */
const TITLES_COLLAPSED = 4;

/** 컨디션 단계별 강조색 — 존 밖으로 새지 않게 보드 앰버 대신 앱 상태 토큰을 쓴다 */
const MOOD_COLOR: Record<ActivityMood["level"], string> = {
  blazing: "text-warning",
  steady: "text-success",
  resting: "text-info",
  dormant: "text-muted-foreground",
};

const MOOD_BAR: Record<ActivityMood["level"], string> = {
  blazing: "bg-warning",
  steady: "bg-success",
  resting: "bg-info",
  dormant: "bg-muted-foreground/50",
};

/** 툴팁 자동 소멸 시간 — 칭호 배지(TitleBadge)와 같은 3초 */
const PURPOSE_TIP_MS = 3000;

/**
 * 편집판(내 프로필탭) 전용 묶음.
 *
 * **이 prop의 유무가 곧 판의 성격을 정한다** — 있으면 편집판(지면에 인쇄된 판),
 * 없으면 공개판(손에 쥐는 카드). 두 화면이 한 컴포넌트를 쓰는 건 순서·서체·간격이
 * 구조적으로 갈라질 수 없게 하기 위해서다(따로 만들면 한쪽만 고쳐 어긋난다).
 */
export type MemberCardEdit = {
  /** 얼굴·이름 탭 → 남들에게 보이는 내 카드(팝업) */
  onOpenPublicCard: () => void;
  /** 얼굴 우하단 카메라 배지 → 프로필 사진 변경 */
  onEditAvatar: () => void;
  /** 한마디 줄 탭 → 한 줄 인라인 편집 */
  onEditIntro: () => void;
  /** 대표 칭호 옆 연필 → 내 컬렉션 */
  onEditTitles: () => void;
  /** 하단 칭호 섹션 우측 "획득 이력" → 언제 무엇을 땄나(시간축) */
  onOpenTitleHistory: () => void;
  /** 러닝 프로필 + 가입 목적 — 같은 테이블·같은 액션이라 진입점도 하나다 */
  onEditProfile: () => void;
  onManageRecords: () => void;
  onAddRecord: () => void;
  onLinkUtmb: () => void;
  /** 총 활동 포인트 — **본인 화면에만** 노출한다(공개판엔 없음) */
  point: number;
};

/**
 * 가입 목적 칩 — 짧은 라벨(`코칭`)을 찍되, 탭하면 문장형(`자세·훈련 코칭을 받고 싶어요`)이
 * 위에 뜬다. 칭호 배지의 탭 툴팁과 같은 UX다: 짧은 라벨만으론 뜻이 안 읽히므로 그 자리에서
 * 풀어 준다. 매 프레임 움직이지 않는 정적 요소라 `onClick`으로 충분하다.
 */
function PurposeTooltipChip({ short, full }: { short: string; full: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 언마운트 시 타이머 정리
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // 스크롤하면 닫는다(위치가 어긋나므로) — 칭호 툴팁과 동일
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, { passive: true, capture: true });
    return () =>
      window.removeEventListener("scroll", close, { capture: true });
  }, [open]);

  // 열린 뒤 버블 크기를 재서 앵커 위 중앙에 배치, 화면 밖으로 나가면 안쪽으로 당긴다.
  // pos가 아직 없을 때만 계산한다(칭호 툴팁과 같은 1회 측정) — 효과 안에서 매번
  // setState하면 렌더가 연쇄되므로, 닫을 때 pos를 비우는 건 toggle 쪽에서 한다.
  useEffect(() => {
    if (!open || pos !== null) return;
    const anchor = btnRef.current;
    const bubble = bubbleRef.current;
    if (!anchor || !bubble) return;

    const aRect = anchor.getBoundingClientRect();
    const bRect = bubble.getBoundingClientRect();
    const vw = window.innerWidth;
    const MARGIN = 8;

    let left = aRect.left + aRect.width / 2 - bRect.width / 2;
    const top = aRect.top - bRect.height - 6;
    if (left + bRect.width + MARGIN > vw) left = vw - bRect.width - MARGIN;
    if (left < MARGIN) left = MARGIN;

    setPos({ top, left });
  }, [open, pos]);

  function toggle() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setPos(null); // 다음 열림에서 위치를 다시 잰다(스크롤 등으로 앵커가 움직였을 수 있음)
    setOpen(true);
    timerRef.current = setTimeout(() => setOpen(false), PURPOSE_TIP_MS);
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-label={full}
        className="inline-flex shrink-0 items-center rounded-full border border-border px-2.5 py-1 text-[12px] font-medium text-foreground transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {short}
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={bubbleRef}
            style={
              pos
                ? { position: "fixed", top: pos.top, left: pos.left }
                : { position: "fixed", visibility: "hidden" }
            }
            className={cn(
              "z-[9999] max-w-[220px] break-words rounded-md px-2.5 py-1.5",
              "bg-zinc-800 text-[11px] leading-relaxed text-zinc-100",
              "dark:bg-zinc-700 dark:text-zinc-50",
              "pointer-events-none select-none",
              "animate-in fade-in-0 zoom-in-95 duration-150",
            )}
          >
            {full}
          </div>,
          document.body,
        )}
    </>
  );
}

/** 지면 위 조용한 연필 — 있는 줄은 알되 시선을 뺏지 않는 무게 */
function EditPencil({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="-m-1.5 shrink-0 rounded p-1.5 text-muted-foreground/60 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Pencil className="size-3" />
    </button>
  );
}

/**
 * 상세 프로필 카드 — 야간 스타디움 선수 소개판.
 *
 * 상단 스크린 존은 라이트/다크 무관하게 항상 어둡다(`--board`). glow 기반 프레임·칭호 이펙트가
 * 흰 배경에서 죽는 문제를 이 존이 해결한다 — 컬렉션 보상이 두 테마 모두에서 발광하는 무대.
 *
 * **한 컴포넌트가 두 판을 그린다**(`edit` prop):
 * - 없으면 **공개판** — 팝업 안의 카드 한 장. 안 쓴 항목은 아예 안 뜬다.
 * - 있으면 **편집판** — 내 프로필탭. 지면을 가로지르는 띠 + 빈 칸 + 연필 + 포인트.
 *
 * 빈 상태 규칙은 성격에 따라 셋으로 갈린다:
 * - *내가 적는 것*(러닝 프로필·다음 대회) → 편집판만 점선 칸, 공개판은 통째로 생략
 * - *쌓이는 격자*(최근활동·개인 최고기록) → 양쪽 다 빈 값으로 자리를 지킨다
 * - *모이는 것*(페이스 추이·칭호) → 0일 때 보여줄 형태가 없어 양쪽 다 사라진다
 */
export function MemberCardDetail({
  memId,
  data,
  locked = false,
  edit,
}: {
  memId: string;
  data: MemberCardData;
  /**
   * 비로그인인가 — true면 아래 정보 존을 흐리게 덮고 로그인 안내를 얹는다.
   * 스크린 존(얼굴·이름·칭호)은 그대로 보인다.
   *
   * **가리되 없애지는 않는다**: 빈 카드를 보여주면 "이 사람은 실적이 없구나"로 읽히지만,
   * 흐린 판 아래 뭔가 있는 게 비치면 "로그인하면 볼 수 있는 것"으로 읽힌다.
   */
  locked?: boolean;
  /** 편집판(내 프로필탭)에서만 전달 — §MemberCardEdit */
  edit?: MemberCardEdit;
}) {
  const isEdit = edit != null;

  // ⚠️ 편집판은 **처음부터 점등 상태로 시작한다.** `board-lit`은 연출 스위치가 아니라
  // 가시성 스위치이기도 하다 — `.board-rise`는 `opacity: 0`이고 `.board-lit .board-rise`에서만
  // 1이 되므로, 점등을 끄면 이름·칭호·한마디가 통째로 안 보인다(`.board-cone`도 같은 구조).
  // 그래서 "탭에선 연출을 끈다"는 **플리커 애니메이션과 rise 클래스를 안 붙이는 것**으로 이루고,
  // lit 자체는 켠 채로 둔다. CSS 트랜지션은 최초 렌더에 실행되지 않으므로 깜빡임도 없다.
  const [lit, setLit] = useState(isEdit);
  const [titlesOpen, setTitlesOpen] = useState(false);
  const [actvOpen, setActvOpen] = useState(false);

  useEffect(() => {
    // 점등 시퀀스는 "카드를 여는 순간"이 있는 공개판에서만 돈다. 편집판(탭)은 매번 들어오는
    // 자리라 진입할 때마다 깜빡이면 피곤하다.
    if (isEdit) return;
    const timer = window.setTimeout(() => setLit(true), IGNITE_LIT_MS);
    return () => window.clearTimeout(timer);
  }, [isEdit]);

  /** 스태거 상승 클래스 — 편집판에선 안 붙인다(연출 없이 그냥 자리에 있다) */
  const rise = (step: 1 | 2 | 3) =>
    isEdit ? undefined : `board-rise board-rise-${step}`;

  const daysSinceJoin = getDaysSinceJoin(data.join_dt);
  const mood = getActivityMood(data.stats.recent_actv_cnt, data.last_actv_dt);
  const intro = getMemberIntro(data.running_profile);
  const dday = data.upcoming_race ? getRaceDday(data.upcoming_race.stt_dt) : null;

  const profileSlots = getRunningProfileSlots(data.running_profile);
  const pbRows = buildPbRows(data.best_records, data.utmb_index);
  const showPace = hasPaceTrend(data.race_records);
  const recvCnt = data.rctn_recv_cnt ?? 0;

  const visibleTitles = titlesOpen
    ? data.titles
    : data.titles.slice(0, TITLES_COLLAPSED);
  const hiddenCount = data.titles.length - TITLES_COLLAPSED;

  const raceHref = data.upcoming_race
    ? `/schedule?comp=${data.upcoming_race.short_id ?? data.upcoming_race.comp_id}`
    : null;

  // 칭호에서 고른 프레임 이펙트(getFrameCls)는 카드에 적용하지 않는다 — 화려한 테두리가
  // 스크린 존과 싸워서 정보가 안 읽힌다. 이펙트는 칭호 뱃지에만 남긴다.
  return (
    <div
      className={cn(
        isEdit
          ? // 편집판은 페이지 지면이다 — 스크롤은 페이지가 하고 카드 테두리를 두르지 않는다.
            // 테두리를 두르면 화면 높이만큼 긴 상자가 생겨 "카드"도 "지면"도 아니게 된다.
            "flex flex-col"
          : // 공개판은 이 wrapper가 스크롤 컨테이너다 — 스크린 존을 sticky로 붙이려면 sticky
            // 조상 중 overflow가 걸린 스크롤러가 바로 여기여야 한다(중간에 overflow:hidden이
            // 끼면 sticky가 깨진다).
            // **min-h-0 flex-1**: 다이얼로그(max-h-88dvh flex flex-col)의 flex 높이를 받아
            // 콘텐츠가 넘칠 때 shrink → overflow-y-auto가 스크롤을 건다. `max-h-full`은
            // 부모가 확정 height를 가져야 계산되는데 flex item엔 없어 무력화된다.
            "min-h-0 flex-1 overflow-y-auto rounded-2xl border-[1.5px] border-border",
        lit && "board-lit",
      )}
    >
      {/* ── 스크린 존 (항상 야간) ─────────────────────────────
          공개판에선 스크롤 컨테이너 위쪽에 고정한다 — 이름·얼굴·칭호는 카드의 정체성이라
          아래 정보를 훑는 동안에도 계속 보여야 한다. 편집판(탭)에선 고정하지 않는다:
          화면 3분의 1을 계속 먹는 데다, 아래로 길게 읽어 내리는 지면이라 붙잡을 이유가 없다.

          편집판의 `-mx-6`은 페이지 좌우 패딩(px-6)을 거슬러 올라 **화면 좌우 끝까지** 띠를
          늘인다. 흰 지면 중간에 떠 있는 검은 상자는 광고 배너로 읽히지만, 지면을 가로지르는
          띠는 끼워 넣은 계기 출력물로 읽힌다(§DESIGN.md 심전도 밴드와 같은 어법). */}
      <div
        className={cn(
          "relative bg-board px-5 pb-5 pt-4 text-board-foreground",
          isEdit ? "-mx-6 px-6" : "board-flicker sticky top-0 z-10",
        )}
      >
        <div
          aria-hidden
          className="board-cone pointer-events-none absolute inset-0"
        />

        {data.back_no != null && (
          // 좌표는 그 판의 안쪽 패딩에 맞춘다 — 편집판은 px-6(페이지 좌우 패딩과 같은 자리라
          // 아래 섹션들과 세로줄이 맞는다), 공개판은 카드의 px-5.
          <span
            className={cn(
              "absolute top-4 font-mono text-[11px] font-bold tracking-[0.1em] text-board-amber tabular-nums",
              isEdit ? "left-6" : "left-5",
            )}
          >
            NO.{data.back_no}
          </span>
        )}

        {/* 받은 응원 — 좌상단 등번호와 대칭인 계기 표시.
            `right-11`은 공개판 다이얼로그의 닫기 X(right-3 + 폭 약 28px)를 비켜선 자리다.
            두 판이 같은 좌표를 쓰도록 편집판도 같은 값을 쓴다(탭에선 X가 없어 여백만 조금 남는다).
            0이어도 숨기지 않고 색만 낮춘다 — 자리는 지키되 "아직 안 켜진 계기"로 읽히게. */}
        <span
          className={cn(
            "absolute right-11 top-4 inline-flex items-center gap-1 font-mono text-[11px] font-bold tabular-nums",
            recvCnt > 0 ? "text-board-amber" : "text-board-muted",
          )}
          aria-label={`받은 응원 ${recvCnt}회`}
        >
          {/* 이모지는 상수(문자열 리터럴)에서 가져온다 — JSX 본문에 직접 타이핑하면
              Tailwind v4 스캐너가 서로게이트 페어를 깨뜨려 빌드가 터진다(§KNOWLEDGE). */}
          <span aria-hidden>{RCTN_LABEL.fire.emoji}</span>
          {recvCnt.toLocaleString()}
        </span>

        <div className="relative flex flex-col items-center gap-1.5">
          {edit ? (
            // 얼굴 탭은 이미 공개판 팝업을 여는 자리라, 사진 변경은 우하단 배지로 뗀다.
            // 배지는 아바타 버튼의 **형제**여야 한다 — 안에 넣으면 버튼 속 버튼이라 마크업이
            // 깨지고, 사진 변경 탭이 팝업까지 같이 연다.
            <div className="relative">
              <button
                type="button"
                onClick={edit.onOpenPublicCard}
                aria-label="남들에게 보이는 내 카드 보기"
                className="rounded-full transition-opacity active:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-board-amber"
              >
                <Avatar
                  src={data.avatar_url}
                  seed={memId}
                  alt={data.mem_nm}
                  size="2xl"
                  className="ring-2 ring-board-foreground/15"
                />
              </button>

              {/* 판 색으로 테를 둘러(ring-board) 아바타에서 떼어 놓는다. 앰버는 계기 표시
                  전용이라 여기 안 쓰고, 히트 영역은 28px로 손가락이 겨냥할 수 있게 잡는다. */}
              <button
                type="button"
                onClick={edit.onEditAvatar}
                aria-label="프로필 사진 변경"
                className="absolute bottom-0 right-0 inline-flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-board transition-opacity active:opacity-80 focus-visible:outline-none focus-visible:ring-board-amber"
              >
                <Camera aria-hidden className="size-3.5" />
              </button>
            </div>
          ) : (
            <Avatar
              src={data.avatar_url}
              seed={memId}
              alt={data.mem_nm}
              size="2xl"
              className="ring-2 ring-board-foreground/15"
            />
          )}

          {/* 이름 + 대표 칭호 — 칭호를 이름 오른쪽에 나란히 둔다.
              편집판에선 대표 칭호를 안 골랐어도 점선 `?` 껍데기가 자리를 지킨다:
              자리를 비워 두면 고를 수 있다는 걸 영영 모른다. 연필은 껍데기든 배지든 늘 붙는다. */}
          <div className={cn("flex flex-wrap items-center justify-center gap-x-2 gap-y-1", rise(1))}>
            {edit ? (
              <button
                type="button"
                onClick={edit.onOpenPublicCard}
                aria-label="남들에게 보이는 내 카드 보기"
                className="rounded text-xl font-bold tracking-tight text-board-foreground transition-opacity active:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-board-amber"
              >
                {data.mem_nm}
              </button>
            ) : (
              <span className="text-xl font-bold tracking-tight text-board-foreground">
                {data.mem_nm}
              </span>
            )}

            {data.primary_title ? (
              <TitleBadge
                name={data.primary_title.ttl_nm}
                effect={data.badge_effect}
                size="sm"
                tooltip={{
                  desc: data.primary_title.ttl_desc,
                  visibility: data.primary_title.desc_visibility,
                  isHeld: true,
                }}
              />
            ) : (
              edit && (
                <button
                  type="button"
                  onClick={edit.onEditTitles}
                  aria-label="대표 칭호 고르기"
                  className="inline-flex items-center rounded-full border border-dashed border-board-muted/70 px-3 py-0.5 text-[11px] font-bold text-board-muted transition-colors hover:border-board-foreground/60 hover:text-board-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-board-amber"
                >
                  ?
                </button>
              )
            )}

            {edit && (
              <button
                type="button"
                onClick={edit.onEditTitles}
                aria-label="대표 칭호 수정"
                className="-m-1 shrink-0 rounded p-1 text-board-muted transition-colors hover:text-board-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-board-amber"
              >
                <Pencil className="size-3" />
              </button>
            )}
          </div>

          {/* 한마디 — 인용구. 편집판에선 **줄 전체가 버튼**이다: 연필만 히트 영역이면
              12px 아이콘을 겨냥해야 한다. 연필은 "누를 수 있다"는 시각 힌트로만 남는다.
              빈 문구는 한 줄로 고정해(줄바꿈 없음) 두 줄로 벌어지지 않게 한다.

              **공개판은 내 카드여도 편집하지 않는다** — 고치는 자리는 프로필탭 한 곳이다.
              팝업은 "남들에게 보이는 내 카드"를 확인하는 자리라, 거기서 손을 대면 그 성격이
              흐려진다(그리고 같은 걸 두 곳에서 고치게 된다). 그래서 한마디가 없으면
              공개판에선 줄 자체가 안 뜬다 — 공개판의 빈 항목 규칙 그대로. */}
          {(data.intro_txt || edit) &&
            (edit ? (
              <button
                type="button"
                onClick={edit.onEditIntro}
                aria-label={data.intro_txt ? "한마디 수정" : "한마디 남기기"}
                className={cn("mt-0.5 flex max-w-full items-center gap-1.5 rounded-lg bg-board-foreground/[0.04] px-2 py-0.5 ring-1 ring-inset ring-board-foreground/[0.07] transition-colors hover:bg-board-foreground/[0.09] focus-visible:outline-none focus-visible:ring-board-amber", rise(2))}
              >
                {data.intro_txt ? (
                  <span className="truncate text-[15px] leading-snug text-board-foreground">
                    <span aria-hidden className="text-board-amber/70">
                      &ldquo;
                    </span>
                    {data.intro_txt}
                    <span aria-hidden className="text-board-amber/70">
                      &rdquo;
                    </span>
                  </span>
                ) : (
                  <span className="whitespace-nowrap text-[13px] text-board-muted">
                    한마디를 남겨보세요
                  </span>
                )}
                <Pencil
                  aria-hidden
                  className="size-3 shrink-0 text-board-muted"
                />
              </button>
            ) : (
              <blockquote className={cn("mt-0.5 px-2 text-center text-[15px] leading-snug text-board-foreground", rise(2))}>
                <span aria-hidden className="text-board-amber/70">
                  &ldquo;
                </span>
                {data.intro_txt}
                <span aria-hidden className="text-board-amber/70">
                  &rdquo;
                </span>
              </blockquote>
            ))}

          {/* 합류일만 — 러닝 프로필은 아래 섹션으로 뺐다.
              스크린 존은 "누구인가"를 보여주는 자리라 스펙을 나열하면 소개가 아니라 스펙표가 된다. */}
          {data.join_dt && (
            <Micro className={cn("mt-0.5 text-board-muted tabular-nums", rise(3))}>
              {dayjs(data.join_dt).format("YY.MM.DD")} 합류
              {daysSinceJoin != null && ` (${daysSinceJoin}일째)`}
            </Micro>
          )}
        </div>
      </div>

      {/* ── 정보 존 (앱 테마) ─────────────────────────────────
          비로그인이면 이 존만 흐리게 덮고 로그인 안내를 얹는다(`locked`). 스크린 존은 그대로
          두는데, "누구인지"까지 막으면 얼굴을 눌러 카드를 연 동작 자체가 헛수고가 된다.
          여기부터가 크루원끼리 보는 실적이라 문턱은 이 경계에 세운다. */}
      <div className="relative">
        <div
          className={cn(
            "flex flex-col gap-5",
            // 편집판은 페이지가 좌우 패딩(px-6)을 이미 갖고 있어 위아래만 띄운다.
            isEdit ? "py-6" : "bg-card p-5",
            // `select-none`까지 걸어 흐린 글자를 드래그로 긁어가지 못하게 한다.
            // 진짜 차단은 아니지만(클라이언트 가림막이다), 실수로 읽히는 건 막는다.
            locked && "pointer-events-none select-none blur-[5px]",
          )}
          // 흐려진 내용은 스크린리더에도 읽히면 안 된다 — 눈으로 못 보는 걸 소리로는
          // 다 들려주면 가린 의미가 없다.
          aria-hidden={locked || undefined}
          inert={locked || undefined}
        >
          {/* ── ① 러닝 프로필 (가입 목적 포함) ──────────────────
              둘은 같은 테이블(mem_onbd_prf)이고 저장 액션도 하나(updateRunningProfile)라,
              섹션을 갈라 두면 연필이 둘인데 눌러 보면 같은 폼으로 간다. 하나로 묶어 연필도 하나. */}
          {(isEdit || intro) && (
            <section className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <SectionLabel>
                  러닝 프로필
                </SectionLabel>
                {edit && (
                  <EditPencil
                    label="러닝 프로필 수정"
                    onClick={edit.onEditProfile}
                  />
                )}
              </div>

              {isEdit && !intro ? (
                <EmptyState
                  variant="card"
                  role="button"
                  tabIndex={0}
                  onClick={edit?.onEditProfile}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      edit?.onEditProfile();
                    }
                  }}
                  message="다른 사람들에게 내 러닝 프로필을 공유해보세요"
                  className="cursor-pointer gap-2 py-5 text-[13px] transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  action={
                    <span className="inline-flex items-center gap-0.5 text-[12px] font-semibold text-primary">
                      프로필 작성하기
                      <ChevronRight className="size-3" />
                    </span>
                  }
                />
              ) : (
                <>
                  <ul className="flex flex-col gap-1.5">
                    {/* 편집판은 미입력 칸도 자리를 지키고(`—`), 공개판은 채워진 줄만 보인다 —
                        남에게 "이 사람 아무것도 안 썼다"를 보여줄 이유가 없다. */}
                    {(isEdit
                      ? profileSlots
                      : profileSlots.filter((slot) => slot.value != null)
                    ).map((slot) => (
                      <li key={slot.label} className="flex items-baseline gap-2">
                        <Caption className="shrink-0">{slot.label}</Caption>
                        <span
                          aria-hidden
                          className="min-w-2 flex-1 -translate-y-0.5 border-b border-dashed border-border"
                        />
                        <Caption
                          className={cn(
                            "shrink-0 tabular-nums",
                            slot.value
                              ? "font-medium text-foreground"
                              : "text-muted-foreground/70",
                          )}
                        >
                          {slot.value ?? "—"}
                        </Caption>
                      </li>
                    ))}
                  </ul>

                  {/* 가입 목적 — 라벨 자리를 위 도트 리더와 맞춰 리듬을 잇는다.
                      직접 쓴 한마디가 있으면 그 문장을, 없으면 목적 칩을 보여준다.
                      칩은 짧은 라벨(`코칭`)이라 뜻이 안 읽히므로 탭하면 문장형 툴팁이 뜬다. */}
                  {(isEdit ||
                    intro?.purposeTxt ||
                    (intro?.purposes.length ?? 0) > 0) && (
                    <div className="flex items-baseline gap-2 pt-0.5">
                      <Caption className="shrink-0">가입 목적</Caption>
                      {intro?.purposeTxt ? (
                        <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-foreground">
                          &ldquo;{intro.purposeTxt}&rdquo;
                        </p>
                      ) : (intro?.purposes.length ?? 0) > 0 ? (
                        <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                          {intro?.purposes.map((purpose) => (
                            <PurposeTooltipChip
                              key={purpose.short}
                              short={purpose.short}
                              full={purpose.full}
                            />
                          ))}
                        </div>
                      ) : (
                        <Caption className="text-muted-foreground/70">
                          아직 안 정했어요
                        </Caption>
                      )}
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          {/* ── ② 최근활동 ───────────────────────────────────
              쌓이는 격자라 값이 0이어도 자리를 지킨다(양쪽 판 공통).
              누적 참석·출전은 헤더 우측으로 올려 자리를 안 쓰면서 대비된다. */}
          <section className="flex flex-col gap-2">
            {/* 375px에서 `최근활동 + 모임 N + 대회 N + 포인트 + 물음표`가 한 줄에 들어가지만
                자릿수가 늘면(10,000 P) 빠듯하다 — 넘치면 가로 스크롤이 생기는 대신 아래로
                접히도록 wrap을 열어 둔다. 물음표가 버튼(28px)이라 baseline 대신 center 정렬. */}
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
              <SectionLabel>
                최근활동
              </SectionLabel>
              <div className="flex shrink-0 items-center gap-2">
                <Micro>
                  모임{" "}
                  <span className="font-mono font-bold text-foreground tabular-nums">
                    {data.stats.gthr_attd_cnt}
                  </span>
                </Micro>
                <Micro>
                  대회{" "}
                  <span className="font-mono font-bold text-foreground tabular-nums">
                    {data.stats.comp_reg_cnt}
                  </span>
                </Micro>
                {/* 포인트는 **본인 화면에만**. 남의 카드에 띄우면 공개 랭킹 지표가 된다. */}
                {edit && (
                  <>
                    <span className="rounded-md bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] font-bold text-primary tabular-nums">
                      {edit.point.toLocaleString()} P
                    </span>
                    <HelpTip title="활동 포인트" className="-mx-1.5 size-7">
                      모임 참석·대회 출전·기록 등록으로 쌓여요.
                    </HelpTip>
                  </>
                )}
              </div>
            </div>

            {/* 볼륨 미터 — 아이콘 없이 세로 막대가 커지는 형태. 누르면 이력이 펼쳐진다. */}
            <button
              type="button"
              onClick={() => setActvOpen((v) => !v)}
              aria-expanded={actvOpen}
              className="flex items-center gap-3 rounded-xl border border-border p-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div aria-hidden className="flex h-6 shrink-0 items-end gap-[3px]">
                {Array.from({ length: MOOD_STEPS }, (_, i) => (
                  <span
                    key={i}
                    // 단계가 오를수록 막대가 높아진다 — 볼륨 게이지
                    style={{ height: `${((i + 1) / MOOD_STEPS) * 100}%` }}
                    className={cn(
                      "w-1.5 rounded-sm",
                      i < mood.litSteps ? MOOD_BAR[mood.level] : "bg-border",
                    )}
                  />
                ))}
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex items-baseline gap-1.5">
                  <span
                    className={cn("text-[15px] font-bold", MOOD_COLOR[mood.level])}
                  >
                    {mood.label}
                  </span>
                  <Micro className="shrink-0">· 최근 3달</Micro>
                </div>
                <Micro className="leading-snug">{mood.message}</Micro>
              </div>

              <ChevronDown
                aria-hidden
                className={cn(
                  "size-4 shrink-0 text-muted-foreground transition-transform",
                  actvOpen && "rotate-180",
                )}
              />
            </button>

            {actvOpen && (
              <div className="flex flex-col gap-1.5 rounded-xl border border-border p-3">
                {data.recent_actv.length === 0 ? (
                  <Caption>최근 3달간 활동이 없습니다.</Caption>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {data.recent_actv.map((actv, i) => (
                      <li
                        key={`${actv.kind}-${actv.actv_dt}-${i}`}
                        className="flex items-baseline gap-2"
                      >
                        <Micro
                          className={cn(
                            "shrink-0 rounded px-1 font-medium",
                            actv.kind === "race"
                              ? "bg-info/10 text-info"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          {actv.kind === "race" ? "대회" : "모임"}
                        </Micro>
                        <Caption className="min-w-0 flex-1 truncate text-foreground">
                          {actv.title}
                        </Caption>
                        <Micro className="shrink-0 tabular-nums">
                          {actv.kind === "race"
                            ? actv.rec_time_sec != null
                              ? secondsToTime(actv.rec_time_sec)
                              : dayjs(actv.actv_dt).format("MM.DD")
                            : `${dayjs(actv.actv_dt).format("MM.DD")}${
                                actv.attd_cnt != null ? ` · ${actv.attd_cnt}명` : ""
                              }`}
                        </Micro>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>

          {/* ── ③ 다음 대회 ──────────────────────────────────
              예전엔 개인 최고기록 섹션 안에 얹혀 있었다 — 과거 실적과 미래 예정이 한 라벨
              아래 섞인 셈이라 독립 섹션으로 뺐다. */}
          {(isEdit || (data.upcoming_race && dday && raceHref)) && (
            <section className="flex flex-col gap-2">
              <SectionLabel>
                다음 대회
              </SectionLabel>
              {data.upcoming_race && dday && raceHref ? (
                <Link
                  href={raceHref}
                  className="flex items-center gap-2.5 rounded-xl border border-border px-3 py-2.5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <Caption className="truncate font-medium text-foreground">
                      {data.upcoming_race.comp_nm}
                    </Caption>
                    <Micro className="tabular-nums">
                      {dayjs(data.upcoming_race.stt_dt).format("YY.MM.DD (ddd)")}
                    </Micro>
                  </div>
                  <span className="shrink-0 rounded-md bg-info/10 px-1.5 py-0.5 font-mono text-[11px] font-bold text-info tabular-nums">
                    {dday}
                  </span>
                  <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                </Link>
              ) : (
                // 권유만 하고 링크는 걸지 않는다 — 대회 출전은 신청·정원·일정이 걸린 일이라
                // 프로필에서 바로 밀어 넣을 성격이 아니고, 대회 탭이 이미 하단 바에 상시로 있다.
                <EmptyState
                  variant="card"
                  message="기강 팀원들과 대회에 참석해보세요"
                  className="py-5 text-[13px]"
                />
              )}
            </section>
          )}

          {/* ── ④ 개인 최고기록 ───────────────────────────────
              빈 판 대신 칸을 늘 세운다(FULL/HALF/10K + 있는 종목 + UTMB INDEX):
              채워야 할 칸이 몇 개인지가 눈에 보이고, 기록을 넣은 뒤에도 레이아웃이 안 바뀐다. */}
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <SectionLabel>
                개인 최고기록
              </SectionLabel>
              {edit && (
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                    onClick={edit.onManageRecords}
                  >
                    <History className="size-3.5" />
                    기록 관리
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={edit.onAddRecord}
                  >
                    <Plus className="size-3.5" />
                    기록 추가
                  </Button>
                </div>
              )}
            </div>

            <ul className="flex flex-col gap-1.5">
              {pbRows.map((row) => (
                <li key={row.label} className="flex items-baseline gap-2">
                  <span
                    aria-hidden
                    className={cn(
                      "size-1.5 shrink-0 self-center rounded-full",
                      row.dotCls,
                    )}
                  />
                  <Caption
                    className={cn(
                      "shrink-0 font-mono text-[12.5px] font-semibold tracking-wide",
                      row.value ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {row.label}
                  </Caption>
                  {row.isNew && (
                    <span className="shrink-0 rounded bg-warning/15 px-1 font-mono text-[9px] font-bold tracking-wider text-warning">
                      NEW
                    </span>
                  )}
                  <span
                    aria-hidden
                    className="min-w-2 flex-1 -translate-y-0.5 border-b border-dashed border-border"
                  />
                  {row.value ? (
                    <span className="shrink-0 font-mono text-[15px] font-semibold text-foreground tabular-nums">
                      {row.value}
                    </span>
                  ) : row.isUtmb && edit ? (
                    <button
                      type="button"
                      onClick={edit.onLinkUtmb}
                      className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[11.5px] font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      연동하기
                    </button>
                  ) : (
                    <span className="shrink-0 font-mono text-[15px] font-medium text-muted-foreground/70 tabular-nums">
                      {pbEmptyValue(row)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {/* ── ⑤ 페이스 추이 ────────────────────────────────
              같은 종목 2건 이상일 때만 — 점 하나짜리는 추이가 아니다. 0일 때 보여줄 형태가
              없으므로 빈 상태를 만들지 않고 섹션째 사라진다(칭호와 같은 규칙). */}
          {showPace && (
            <PaceChartDynamic records={toPaceChartRecords(data.race_records)} />
          )}

          {/* ── ⑥ 칭호 ──────────────────────────────────────
              가입하면 뉴비가 자동으로 붙어 0인 경우가 사실상 없다. 대표 칭호 유도는
              위 스크린 존의 `?` 껍데기가 맡으므로 여기엔 연필을 달지 않는다. */}
          {data.titles.length > 0 && (
            <section className="flex flex-col gap-2">
              {/* 우측 "획득 이력"은 **연필이 아니다** — 고치는 자리가 아니라 시간축으로 훑는
                  자리라 위 규칙("하단 칭호 섹션엔 연필을 달지 않는다")과 충돌하지 않는다.
                  이 줄이 도감(등급·카테고리 순)과 이력(시간 역순)의 갈림길이다. */}
              <div className="flex items-center justify-between gap-2">
                <SectionLabel>
                  칭호 ({data.titles.length})
                </SectionLabel>
                {edit && (
                  <button
                    type="button"
                    onClick={edit.onOpenTitleHistory}
                    className="shrink-0 text-[11px] text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    획득 이력
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {visibleTitles.map((title) => (
                  <TitleBadge
                    key={title.ttl_nm}
                    name={title.ttl_nm}
                    effect="none"
                    size="xs"
                    tooltip={{
                      desc: title.ttl_desc,
                      visibility: title.desc_visibility,
                      isHeld: true,
                    }}
                  />
                ))}
                {hiddenCount > 0 && !titlesOpen && (
                  <button
                    type="button"
                    onClick={() => setTitlesOpen(true)}
                    aria-label={`칭호 ${hiddenCount}개 더 보기`}
                    className="inline-flex items-center gap-0.5 rounded-full border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Plus className="size-2.5" />
                    {hiddenCount}
                  </button>
                )}
              </div>
              {titlesOpen && (
                <button
                  type="button"
                  onClick={() => setTitlesOpen(false)}
                  className="w-fit text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
                >
                  접기
                </button>
              )}
            </section>
          )}
        </div>

        {/* 로그인 유도 — 흐린 판 위에 얹는다. 위쪽을 살짝 비워(pt-14) 흐려진 내용이 조금
            비치게 두면 "뭔가 더 있다"가 읽힌다. 판을 꽉 덮으면 그냥 잠긴 상자로 보인다. */}
        {locked && (
          <div className="absolute inset-0 flex flex-col items-center justify-start gap-3 px-6 pt-14 text-center">
            <div className="flex flex-col items-center gap-1.5">
              <Lock className="size-5 text-muted-foreground" />
              <Body className="font-semibold">기강인만 볼 수 있어요</Body>
              <Caption>로그인하면 기록·활동·칭호를 모두 볼 수 있어요.</Caption>
            </div>
            <Button size="sm" onClick={() => goToLogin()}>
              로그인
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
