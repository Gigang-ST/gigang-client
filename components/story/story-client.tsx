"use client";

import { useState } from "react";
import Link from "next/link";

import {
  ACTV_HELP_TEXT,
  getActvMonthLabel,
} from "@/lib/activity-index";
import { dayjs, secondsToTime } from "@/lib/dayjs";
import { getRaceDday, getRecordLabel, getSportDotCls } from "@/lib/member-card";
import { cn } from "@/lib/utils";

import { Avatar } from "@/components/common/avatar";
import { HelpTip } from "@/components/common/help-tip";
import { MemberCardCompact } from "@/components/members/member-card";
import { MemberCardDialog } from "@/components/members/member-card-dialog";
import { ActvHistorySheet } from "@/components/story/actv-history-sheet";
import { StoryLede } from "@/components/story/story-lede";
import { StoryMasthead } from "@/components/story/story-masthead";
import { StorySection } from "@/components/story/story-section";
import { StoryWeather } from "@/components/story/story-weather";

import type { StoryFeed } from "@/lib/queries/story-feed";
import type { TeamOverview } from "@/lib/queries/team-overview";

/**
 * 기강이야기 — 크루 소식 지면.
 *
 * 위계는 신문을 따른다: 제호 → 1면 리드 기사(크게, 자동 전환) → 면별 단신(괘선 구분).
 * 색이 아니라 서체 대비(명조 헤드라인 vs 산세리프 본문)와 괘선 굵기로 위계를 만든다.
 * 사람을 탭하면 어디서든 프로필 카드가 열린다(랭킹·모임과 동일한 진입 경험).
 */
export function StoryClient({
  feed,
  overview,
  teamId,
  myMemId,
}: {
  feed: StoryFeed;
  /** 크루 총량 — 기상대 상자에 쓴다 */
  overview: TeamOverview;
  teamId: string;
  /** 로그인 사용자 — 본인 카드면 한마디를 바로 수정할 수 있다 */
  myMemId: string | null;
}) {
  const [selected, setSelected] = useState<{ memId: string; name: string } | null>(
    null,
  );
  const [history, setHistory] = useState<{ memId: string; name: string } | null>(
    null,
  );

  const selectMember = (memId: string, name: string) =>
    setSelected({ memId, name });

  const hasAnything =
    feed.newbies.length > 0 ||
    feed.records.length > 0 ||
    feed.races.length > 0 ||
    feed.month_rank.length > 0 ||
    feed.actv_rank.length > 0;

  return (
    <div className="flex flex-col">
      <StoryMasthead week={feed.week_stat} />

      <div className="pb-2 pt-4">
        <StoryLede feed={feed} onSelectMember={selectMember} />
      </div>

      <div className="flex flex-col gap-8 pb-8 pt-6">
        {/* 기강 기상대 — 개별 소식(리드) 다음에 크루 전체 분위기 */}
        <StoryWeather overview={overview} />

        {/* 새 얼굴 — 최근 3명 + 더보기 */}
        <StorySection
          label="New Members"
          lead={
            feed.newbies.length > 0
              ? `최근 30일, ${feed.newbies.length}명이 기강에 합류`
              : undefined
          }
          items={feed.newbies}
          initial={3}
          max={6}
          unit="명"
        >
          {(newbies) => (
            // 새 얼굴은 실적이 없어 한 줄 목록으로는 이름밖에 남지 않는다.
            // 간단 프로필 카드로 러닝 프로필까지 보여주고, 탭하면 상세로 이어진다.
            <ul className="flex flex-col gap-2 pt-2">
              {newbies.map((nb) => (
                <li key={nb.entity_id}>
                  <MemberCardCompact
                    memId={nb.mem_id}
                    data={nb}
                    onSelect={() => selectMember(nb.mem_id, nb.mem_nm)}
                    meta={
                      <span className="font-numeric text-[11px] text-muted-foreground tabular-nums">
                        {dayjs(nb.event_at).format("M.DD")}
                      </span>
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </StorySection>

        {/* 다가오는 대회 */}
        {feed.races.length > 0 && (
          <section className="flex flex-col px-6">
            <div className="rule-section pb-2">
              <h2 className="font-numeric text-[11px] font-medium uppercase tracking-[0.2em] text-foreground">
                Upcoming Races
              </h2>
            </div>
            <ul className="flex flex-col pt-1">
              {feed.races.map((race) => {
                const dday = getRaceDday(race.stt_dt);
                return (
                  <li key={race.entity_id} className="rule-row">
                    <Link
                      href={`/?comp=${race.short_id ?? race.comp_id}`}
                      className="flex items-center gap-3 py-3 transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="truncate font-serif text-[16px] text-foreground">
                          {race.comp_nm}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {dayjs(race.stt_dt).format("M월 D일")} · {race.reg_cnt}명
                          출전
                        </span>
                      </div>
                      <div className="flex shrink-0">
                        {race.runners.slice(0, 3).map((r, i) => (
                          <span
                            key={r.mem_id}
                            className={cn(
                              "rounded-full ring-2 ring-background",
                              i > 0 && "-ml-2",
                            )}
                          >
                            <Avatar
                              src={r.avatar_url}
                              seed={r.mem_id}
                              alt={r.mem_nm}
                              size="sm"
                            />
                          </span>
                        ))}
                      </div>
                      {dday && (
                        <span className="w-12 shrink-0 text-right font-numeric text-[15px] font-medium text-foreground tabular-nums">
                          {dday}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* 최근 기록 — 기간 제한 없이 최신순 3건 + 더보기 최대 10건 */}
        <StorySection
          label="Results"
          lead="가장 최근에 올라온 기록부터"
          items={feed.records}
          initial={3}
          max={10}
          unit="건"
        >
          {(records) => (
            <ul className="flex flex-col">
              {records.map((rec) => (
                <li key={rec.entity_id} className="rule-row">
                  <button
                    type="button"
                    onClick={() => selectMember(rec.mem_id, rec.mem_nm)}
                    aria-label={`${rec.mem_nm} 프로필 보기`}
                    className="flex w-full items-center gap-2.5 py-2.5 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        getSportDotCls(rec.sport),
                      )}
                    />
                    <span className="shrink-0 text-[14px] font-semibold text-foreground">
                      {rec.mem_nm}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">
                      {getRecordLabel({
                        sport: rec.sport,
                        evt: rec.evt,
                        rec_time_sec: rec.rec_time_sec,
                        race_nm: rec.race_nm,
                        race_dt: rec.race_dt,
                      })}
                    </span>
                    {/* 언제 뛴 기록인지 — 기간 제한이 없어지면서 필수 정보가 됐다 */}
                    {rec.race_dt && (
                      <span className="shrink-0 font-numeric text-[11px] text-muted-foreground tabular-nums">
                        {dayjs(rec.race_dt).format("YY.M.DD")}
                      </span>
                    )}
                    <span className="shrink-0 font-numeric text-[15px] font-medium text-foreground tabular-nums">
                      {secondsToTime(rec.rec_time_sec)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </StorySection>

        {/* 이달의 참가왕은 스포트라이트 슬롯에만 둔다 — 활동량도 이번 달 지표가 되면서
            월 랭킹 두 개가 지면에 연달아 서면 같은 걸 두 번 본 것처럼 읽힌다. */}

        {/* 기강 활동량 — 5명 + 더보기 최대 10명. 이번 달 집계 */}
        <StorySection
          label="Activity Index"
          lead={`${getActvMonthLabel()} 활동량 · 매달 1일 초기화`}
          items={feed.actv_rank}
          initial={5}
          max={10}
          unit="명"
          headerAction={
            <HelpTip title="기강 활동량">{ACTV_HELP_TEXT}</HelpTip>
          }
        >
          {(entries) => (
            <ul className="flex flex-col">
              {entries.map((entry) => (
                <li
                  key={entry.mem_id}
                  className="rule-row flex items-center gap-3"
                >
                  <button
                    type="button"
                    onClick={() => selectMember(entry.mem_id, entry.mem_nm)}
                    aria-label={`${entry.mem_nm} 프로필 보기`}
                    className="flex min-w-0 flex-1 items-center gap-3 py-2.5 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="w-4 shrink-0 font-numeric text-[13px] text-muted-foreground tabular-nums">
                      {entry.rank}
                    </span>
                    <Avatar
                      src={entry.avatar_url}
                      seed={entry.mem_id}
                      alt={entry.mem_nm}
                      size="sm"
                    />
                    <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-foreground">
                      {entry.mem_nm}
                    </span>
                    <span className="shrink-0 font-numeric text-[15px] font-medium text-foreground tabular-nums">
                      {entry.actv_score.toLocaleString()}
                    </span>
                  </button>

                  {/* 원장 조회는 로그인 멤버만 — 비로그인에게는 버튼 자체를 보이지 않는다 */}
                  {myMemId && (
                    <button
                      type="button"
                      onClick={() => setHistory({ memId: entry.mem_id, name: entry.mem_nm })}
                      aria-label={`${entry.mem_nm} 활동 내역 보기`}
                      className="shrink-0 py-2.5 font-numeric text-[11px] uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      내역
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </StorySection>

        {!hasAnything && (
          <div className="px-6 text-center">
            <p className="font-serif text-[17px] text-foreground">
              아직 전할 소식이 없습니다
            </p>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              모임에 참석하거나 기록을 남기면 이 지면에 실립니다.
            </p>
          </div>
        )}
      </div>

      <MemberCardDialog
        memId={selected?.memId ?? null}
        memNm={selected?.name}
        teamId={teamId}
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        isOwner={selected?.memId != null && selected.memId === myMemId}
      />

      <ActvHistorySheet
        memId={history?.memId ?? null}
        memNm={history?.name ?? ""}
        open={history !== null}
        onOpenChange={(open) => {
          if (!open) setHistory(null);
        }}
      />
    </div>
  );
}
