"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";

import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Lock,
  Pencil,
  Plus,
} from "lucide-react";

import { goToLogin } from "@/lib/auth/go-to-login";
import { dayjs, secondsToTime } from "@/lib/dayjs";
import {
  getActivityMood,
  getDaysSinceJoin,
  getMemberIntro,
  getRaceDday,
  getRecordLabel,
  getSportDotCls,
  isNewRecord,
  MOOD_STEPS,
} from "@/lib/member-card";
import { cn } from "@/lib/utils";

import { Avatar } from "@/components/common/avatar";
import { TitleBadge } from "@/components/common/title-badge";
import { Body, Caption, Micro, SectionLabel } from "@/components/common/typography";
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

/**
 * 상세 프로필 카드 — 야간 스타디움 선수 소개판.
 *
 * 상단 스크린 존은 라이트/다크 무관하게 항상 어둡다(`--board`). glow 기반 프레임·칭호 이펙트가
 * 흰 배경에서 죽는 문제를 이 존이 해결한다 — 컬렉션 보상이 두 테마 모두에서 발광하는 무대.
 */
export function MemberCardDetail({
  memId,
  data,
  onEditIntro,
  locked = false,
}: {
  memId: string;
  data: MemberCardData;
  /** 본인 카드일 때만 전달 — 한마디 옆 연필 버튼이 생긴다 */
  onEditIntro?: () => void;
  /**
   * 비로그인인가 — true면 아래 정보 존(가입목적·러닝프로필·기록·활동·칭호)을 흐리게 덮고
   * 로그인 안내를 얹는다. 스크린 존(얼굴·이름·칭호)은 그대로 보인다.
   *
   * **가리되 없애지는 않는다**: 빈 카드를 보여주면 "이 사람은 실적이 없구나"로 읽히지만,
   * 흐린 판 아래 뭔가 있는 게 비치면 "로그인하면 볼 수 있는 것"으로 읽힌다.
   */
  locked?: boolean;
}) {
  const [lit, setLit] = useState(false);
  const [titlesOpen, setTitlesOpen] = useState(false);
  const [actvOpen, setActvOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setLit(true), IGNITE_LIT_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const daysSinceJoin = getDaysSinceJoin(data.join_dt);
  const mood = getActivityMood(data.stats.recent_actv_cnt, data.last_actv_dt);
  const intro = getMemberIntro(data.running_profile);
  const dday = data.upcoming_race ? getRaceDday(data.upcoming_race.stt_dt) : null;

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
        // 이 wrapper가 스크롤 컨테이너다 — 스크린 존을 sticky로 붙이려면 sticky 조상 중
        // overflow가 걸린 스크롤러가 바로 여기여야 한다(중간에 overflow:hidden이 끼면 sticky가 깨진다).
        // **min-h-0 flex-1**: 다이얼로그(max-h-88dvh flex flex-col)의 flex 높이를 받아 콘텐츠가
        // 넘칠 때 shrink → overflow-y-auto가 스크롤을 건다. `max-h-full`(=max-height:100%)은
        // 부모가 확정 height를 가져야 계산되는데 flex item엔 없어 무력화됐다(스크롤 안 걸린 원인).
        "min-h-0 flex-1 overflow-y-auto rounded-2xl border-[1.5px] border-border",
        lit && "board-lit",
      )}
    >
      {/* ── 스크린 존 (항상 야간) ─────────────────────────────
          스크롤 컨테이너(다이얼로그) 위쪽에 고정한다 — 이름·얼굴·칭호는 카드의 정체성이라
          아래 정보를 훑는 동안에도 계속 보여야 한다. z-10으로 스크롤되는 정보 존 위에 얹힌다. */}
      <div className="board-flicker sticky top-0 z-10 bg-board px-5 pb-5 pt-4 text-board-foreground">
        <div
          aria-hidden
          className="board-cone pointer-events-none absolute inset-0"
        />

        {data.back_no != null && (
          <span className="absolute left-5 top-4 font-mono text-[11px] font-bold tracking-[0.1em] text-board-amber tabular-nums">
            NO.{data.back_no}
          </span>
        )}

        <div className="relative flex flex-col items-center gap-1.5">
          <Avatar
            src={data.avatar_url}
            seed={memId}
            alt={data.mem_nm}
            size="2xl"
            className="ring-2 ring-board-foreground/15"
          />

          {/* 이름 + 대표 칭호 — 칭호를 이름 오른쪽에 나란히 둔다 */}
          <div className="board-rise board-rise-1 flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
            <span className="text-xl font-bold tracking-tight text-board-foreground">
              {data.mem_nm}
            </span>
            {data.primary_title && (
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
            )}
          </div>

          {/* 한마디 — 인용구. 본인이면 연필로 바로 수정 */}
          {(data.intro_txt || onEditIntro) && (
            <div className="board-rise board-rise-2 mt-0.5 flex items-start justify-center gap-1.5 px-2">
              {data.intro_txt ? (
                <blockquote className="relative text-center text-[15px] leading-snug text-board-foreground">
                  <span aria-hidden className="text-board-amber/70">
                    &ldquo;
                  </span>
                  {data.intro_txt}
                  <span aria-hidden className="text-board-amber/70">
                    &rdquo;
                  </span>
                </blockquote>
              ) : (
                <span className="text-[13px] text-board-muted">
                  한마디를 남겨보세요
                </span>
              )}
              {onEditIntro && (
                <button
                  type="button"
                  onClick={onEditIntro}
                  aria-label="한마디 수정"
                  className="mt-0.5 shrink-0 rounded p-1 text-board-muted transition-colors hover:text-board-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-board-amber"
                >
                  <Pencil className="size-3" />
                </button>
              )}
            </div>
          )}

          {/* 합류일만 — 러닝 프로필은 아래 "소개" 섹션으로 뺐다.
              스크린 존은 "누구인가"를 보여주는 자리라 스펙을 나열하면 소개가 아니라 스펙표가 된다. */}
          {data.join_dt && (
            <Micro className="board-rise board-rise-3 mt-0.5 text-board-muted tabular-nums">
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
            "flex flex-col gap-5 bg-card p-5",
            // `select-none`까지 걸어 흐린 글자를 드래그로 긁어가지 못하게 한다.
            // 진짜 차단은 아니지만(클라이언트 가림막이다), 실수로 읽히는 건 막는다.
            locked && "pointer-events-none select-none blur-[5px]",
          )}
          // 흐려진 내용은 스크린리더에도 읽히면 안 된다 — 눈으로 못 보는 걸 소리로는
          // 다 들려주면 가린 의미가 없다.
          aria-hidden={locked || undefined}
          inert={locked || undefined}
        >
        {/* 가입 목적 — 왜 기강에 들어왔는지. 스크린 존의 "한마디"(자유 인용구)와 성격이
            다르므로 별도 섹션·별도 라벨로 확실히 구분한다. 직접 쓴 한마디가 있으면 그 문장을,
            없으면 목적 칩을 보여준다. 칩은 짧은 라벨(`코칭`)이라 뜻이 안 읽히므로 탭하면
            칭호처럼 문장형(`자세·훈련 코칭을 받고 싶어요`) 툴팁이 뜬다. */}
        {intro && (intro.purposeTxt || intro.purposes.length > 0) && (
          <section className="flex flex-col gap-2">
            <SectionLabel>가입 목적</SectionLabel>
            {intro.purposeTxt ? (
              <p className="text-[13.5px] leading-relaxed text-foreground">
                &ldquo;{intro.purposeTxt}&rdquo;
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {intro.purposes.map((purpose) => (
                  <PurposeTooltipChip
                    key={purpose.short}
                    short={purpose.short}
                    full={purpose.full}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {/* 러닝 프로필 — 평균 페이스·거리·가까운 역. 온보딩에서 받은 러닝 스펙이다. */}
        {intro && intro.rows.length > 0 && (
          <section className="flex flex-col gap-2">
            <SectionLabel>러닝 프로필</SectionLabel>
            <ul className="flex flex-col gap-1.5">
              {intro.rows.map((row) => (
                <li key={row.label} className="flex items-baseline gap-2">
                  <Caption className="shrink-0">{row.label}</Caption>
                  <span
                    aria-hidden
                    className="min-w-2 flex-1 -translate-y-0.5 border-b border-dashed border-border"
                  />
                  <Caption className="shrink-0 font-medium text-foreground tabular-nums">
                    {row.value}
                  </Caption>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="flex flex-col gap-2">
          <SectionLabel>개인 최고기록</SectionLabel>
          {data.best_records.length === 0 && data.utmb_index == null ? (
            <Caption>아직 등록된 기록이 없습니다.</Caption>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {data.best_records.map((rec) => (
                <li
                  key={`${rec.sport}-${rec.evt}`}
                  className="flex items-baseline gap-2"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "size-1.5 shrink-0 self-center rounded-full",
                      getSportDotCls(rec.sport),
                    )}
                  />
                  <Caption className="shrink-0 font-medium text-foreground">
                    {getRecordLabel(rec)}
                  </Caption>
                  {isNewRecord(rec.race_dt) && (
                    <span className="shrink-0 rounded bg-warning/15 px-1 font-mono text-[9px] font-bold tracking-wider text-warning">
                      NEW
                    </span>
                  )}
                  <span
                    aria-hidden
                    className="min-w-2 flex-1 -translate-y-0.5 border-b border-dashed border-border"
                  />
                  <span className="shrink-0 font-mono text-[15px] font-semibold text-foreground tabular-nums">
                    {secondsToTime(rec.rec_time_sec)}
                  </span>
                </li>
              ))}
              {data.utmb_index != null && (
                <li className="flex items-baseline gap-2">
                  <span
                    aria-hidden
                    className={cn(
                      "size-1.5 shrink-0 self-center rounded-full",
                      getSportDotCls("trail_run"),
                    )}
                  />
                  <Caption className="shrink-0 font-medium text-foreground">
                    UTMB 인덱스
                  </Caption>
                  <span
                    aria-hidden
                    className="min-w-2 flex-1 -translate-y-0.5 border-b border-dashed border-border"
                  />
                  <span className="shrink-0 font-mono text-[15px] font-semibold text-foreground tabular-nums">
                    {data.utmb_index}
                  </span>
                </li>
              )}
            </ul>
          )}

          {/* 다음 출전 대회 — 탭하면 대회 상세로. "다음 대회" 라벨과 날짜를 함께 명시한다 */}
          {data.upcoming_race && dday && raceHref && (
            <Link
              href={raceHref}
              className="mt-1 flex items-center gap-2.5 rounded-xl border border-border px-3 py-2.5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <Micro className="font-semibold tracking-wide">다음 대회</Micro>
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
          )}
        </section>

        <section className="flex flex-col gap-2">
          {/* 누적 참석·출전은 별도 카드 두 장이던 걸 헤더 우측으로 올렸다 — 자리를 안 쓰면서
              "최근활동"과 누적 수치가 한눈에 대비된다. */}
          <div className="flex items-baseline justify-between gap-2">
            <SectionLabel>최근활동</SectionLabel>
            <div className="flex shrink-0 items-baseline gap-2.5">
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

        {data.titles.length > 0 && (
          <section className="flex flex-col gap-2">
            <SectionLabel>칭호 ({data.titles.length})</SectionLabel>
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
              <Caption>
                로그인하면 기록·활동·칭호를 모두 볼 수 있어요.
              </Caption>
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
