"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
} from "lucide-react";

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
import { Caption, Micro, SectionLabel } from "@/components/common/typography";

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
}: {
  memId: string;
  data: MemberCardData;
  /** 본인 카드일 때만 전달 — 한마디 옆 연필 버튼이 생긴다 */
  onEditIntro?: () => void;
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
    ? `/?comp=${data.upcoming_race.short_id ?? data.upcoming_race.comp_id}`
    : null;

  // 칭호에서 고른 프레임 이펙트(getFrameCls)는 카드에 적용하지 않는다 — 화려한 테두리가
  // 스크린 존과 싸워서 정보가 안 읽힌다. 이펙트는 칭호 뱃지에만 남긴다.
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border-[1.5px] border-border",
        lit && "board-lit",
      )}
    >
      {/* ── 스크린 존 (항상 야간) ───────────────────────────── */}
      <div className="board-flicker relative bg-board px-5 pb-5 pt-4 text-board-foreground">
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
                <blockquote className="relative text-center text-[15px] font-medium leading-snug text-board-foreground">
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

      {/* ── 정보 존 (앱 테마) ───────────────────────────────── */}
      <div className="flex flex-col gap-5 bg-card p-5">
        {/* 소개 — 온보딩에서 받은 자기소개. 기록이 없는 신규 가입자의 카드를 채운다. */}
        {intro && (
          <section className="flex flex-col gap-2">
            <SectionLabel>소개</SectionLabel>
            {/* 직접 쓴 한마디가 있으면 칩 대신 그 문장을 보여준다 */}
            {intro.purposeTxt ? (
              <p className="text-[13.5px] leading-relaxed text-foreground">
                &ldquo;{intro.purposeTxt}&rdquo;
              </p>
            ) : (
              intro.purposes.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {intro.purposes.map((purpose) => (
                    <span
                      key={purpose}
                      className="rounded-full bg-muted px-2.5 py-1 text-[12px] font-medium text-foreground"
                    >
                      {purpose}
                    </span>
                  ))}
                </div>
              )
            )}
            {intro.rows.length > 0 && (
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
            )}
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
    </div>
  );
}
