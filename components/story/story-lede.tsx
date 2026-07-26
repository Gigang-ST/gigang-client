"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";

import { dayjs, secondsToTime } from "@/lib/dayjs";
import {
  getJoinPurposeLabelsFromCds,
  getRaceDday,
  getRecordLabel,
  getRunningProfileChips,
} from "@/lib/member-card";
import { cn } from "@/lib/utils";

import { Avatar, buildFallbackAvatarUrl } from "@/components/common/avatar";
import { TitleBadge } from "@/components/common/title-badge";
import { ProfileChip, PurposeChip } from "@/components/members/profile-chip";
import {
  PersonProfile,
  type PersonProfilePart,
  type PersonProfilePerson,
} from "@/components/story/person-profile";
import { StoryReactionButton } from "@/components/story/story-reaction-button";

import { compEvtTypeLabel } from "@/lib/comp-evt-type";
import { dedupePledgesByMember } from "@/lib/story-pledge";
import { pickActvLeadIndex, pickRandomPostIndex } from "@/lib/story-post";
import { reactionKey } from "@/lib/story-reaction";
import { isDevModeEnabled } from "@/lib/dev-mode";
import { getSportEmoji } from "@/lib/sport";

import type { CSSProperties, PointerEvent } from "react";
import type { RunningProfileChip } from "@/lib/member-card";
import type {
  RctnCd,
  StoryEntityType,
  StoryFeed,
  StoryReactionCounts,
} from "@/lib/queries/story-feed";
import type { StoryPost } from "@/lib/queries/story-posts";

/** 자동 전환 간격 — 한 장씩, 끝에 닿으면 처음으로 되돌아온다 */
const ROTATE_MS = 4000;
/**
 * 손이 닿고서 다음 장까지 걸리는 총 시간 — 읽는 중에 바뀌는 게 가장 거슬리므로 여유를 준다.
 *
 * 이 8초는 **정지 + 게이지 한 바퀴**를 합친 값이다: 4초를 완전히 멈춰 세운 뒤
 * 게이지가 0에서 다시 차오르기 시작해 4초 뒤 다 차면 넘어간다. 8초를 통째로 멈춰 두고
 * 그다음에 4초를 채우면 12초가 걸리고, 사용자는 다 멈춘 막대를 8초나 들여다보게 된다.
 */
const PAUSE_MS = 8000;
/** 완전 정지 구간 — 이 시간이 지나면 게이지가 처음부터 다시 돈다(위 주석의 앞 4초) */
const FREEZE_MS = PAUSE_MS - ROTATE_MS;
/** 새 얼굴 슬롯이 다루는 기간 */
const WINDOW_DAYS = 30;

/**
 * 활동지수 슬롯(§④) 헤드라인 멘트 — `{name}`이 대표 이름으로 치환된다.
 * 한 바퀴마다 대표(actvPick)와 함께 굴러 매번 다른 문구가 걸린다(같은 pick으로 묶어 자연스럽게).
 * "요즘 제일 뜨거운" 결을 살린 캐주얼 톤. 활동량 수치는 말하지 않는다(히든 운영).
 */
const ACTV_HEADLINES = [
  "{name}, 요즘 제일 뜨겁다",
  "{name}, 지칠 줄을 모른다",
  "{name}, 이번 달 기강의 기준",
  "{name}, 오늘도 달리고 있다",
  "{name}, 두 발이 쉬질 않는다",
  "이번 달, {name}의 심장은 쉬지 않았다",
  "{name}, 심장에 모터라도 달았나",
  "이번 달 가장 뜨거운 심장, {name}",
  "쉬는 법을 잊은 사람, {name}",
  "{name}, 이번 달 기강을 혼자 다 잡았다",
  "아무도 못 말린다, 이번 달 {name}",
  "{name}, 이번 달 러닝화 밑창 갈아치울 기세",
  "이번 달 기강의 심박수는 {name} 담당",
  "{name}, 이번 달 기강의 페이스메이커",
];

type Person = { mem_id: string; mem_nm: string; avatar_url: string | null };

type Lede = {
  key: string;
  /** 기사 분류 — 신문의 어깨제목 */
  kicker: string;
  entity: {
    // 활동지수 슬롯 응원까지 담으므로 좁은 유니온 대신 StoryEntityType("actv" 포함)을 쓴다.
    type: StoryEntityType;
    id: string;
    rctnCd: RctnCd;
    count: number;
    /** 내가 이 항목에 누른 누적 횟수 — 점등·상한 판정용 */
    myCount: number;
  } | null;
  /**
   * 운동 기록 칸 전용 — 사진 URL(있으면 헤드라인 대신 사진을 크게 싣는다).
   * `null`이면 사진 없는 자랑이라 프사로 폴백한다(격자 존과 같은 규칙).
   * `title`은 올린 사람의 대표 호칭(있으면 이름 옆 배지) — 없으면 배지 생략.
   */
  photo?: {
    url: string | null;
    person: Person;
    title: { ttl_nm: string; badge_effect: string } | null;
  } | null;
  /** 좌측 메인 — 대회처럼 주인공이 여럿이면 겹쳐 쌓는다 */
  people: Person[];
  /** 겹친 아바타에 다 못 담은 인원 수 — "외 N명"으로 표시(대회 출전자 등) */
  moreCount: number;
  /** 명조 헤드라인 — 기사 제목 */
  headline: string;
  /** 헤드라인 아래 리드문 한 줄 */
  standfirst: string;
  /** 우측 수치 (기록·D-day·횟수) */
  figure: string | null;
  figureLabel: string | null;
  /**
   * 활동지수 슬롯 전용 — 프로필 부품 조합(§④). 있으면 kicker 아래를 이 사람 프로필로 그린다.
   * `parts` 순서대로 조각을 쌓는다(칭호·소개·개인최고기록·러닝프로필 중 골라).
   * `rank`는 이번 달 활동지수 순위 — 프로필 안에 배지로 얹어 "왜 이 사람이 떴는지"를 말한다.
   */
  profile?: {
    person: PersonProfilePerson;
    parts: PersonProfilePart[];
    /** 활동지수 슬롯만 순위 배지를 얹는다 — 새 얼굴 슬롯은 순위가 없다(undefined) */
    rank?: number;
  } | null;
  /**
   * 새 얼굴 슬롯 전용(§②) — 스케치대로의 전용 레이아웃을 그린다.
   * 왼쪽(아바타 + 이름 + new 배지) ↔ 오른쪽(러닝프로필 칩 세로 스택),
   * 아래에 소개 한마디 → 가입목적 칩 ↔ 환영(응원) 버튼.
   * 신입은 칭호가 없어 칭호 자리에 `new` 배지가 들어간다.
   */
  newbie?: {
    person: Person;
    /** 페이스·거리·역 칩 — 오른쪽에 세로로 세운다 */
    chips: RunningProfileChip[];
    /** 소개 한마디(intro_txt) — 없으면 생략 */
    intro: string | null;
    /** 직접 쓴 가입목적 한마디 — 있으면 인용으로. 칩(purposes)과 독립(둘 다 보여줄 수 있다) */
    purposeTxt: string | null;
    /** 가입목적 짧은 라벨 칩 — 고른 코드에서 뽑는다. purposeTxt와 독립 */
    purposes: string[];
  } | null;
  /**
   * 대회 슬롯 전용(§①) — 참가자를 종목별로 묶어 나열한다(B안). 있으면 아바타 겹침 줄 대신
   * 이 나열을 그리고, 하단에 D-day(`figure`) + 응원(`entity`)을 둔다.
   */
  raceRoster?: {
    /** 종목 라벨(풀코스·하프·37K 등) → 그 종목 참가자들 */
    evt: string;
    people: Person[];
  }[] | null;
  /**
   * 대회 완주기록 슬롯 전용(§③) — 최근 30일 완주 1건을 활동지수 방식으로 세운다.
   * 왼쪽(프사+이름+칭호) ↔ 오른쪽(종목·완주시간), 아래 작게 날짜·대회명 + 응원(`entity`).
   */
  raceRecord?: {
    person: PersonProfilePerson;
    /** 종목 라벨(풀코스·하프·10K 등) */
    evtLabel: string;
    /** 완주시간 h:mm:ss */
    time: string;
    /** 날짜 · 대회명 (작은 글씨, 줄바꿈) */
    meta: string;
  } | null;
};

/** 오늘 기준 N일 이내인가 (KST) */
function withinDays(dateStr: string | null, days: number): boolean {
  if (!dateStr) return false;
  const diff = dayjs().startOf("day").diff(dayjs(dateStr).startOf("day"), "day");
  return diff >= 0 && diff <= days;
}

/**
 * 배열을 n칸 회전시킨다 — 원소를 지우지 않고 시작점만 옮긴다.
 *
 * 매번 새로 셔플하지 않는 이유: 셔플이면 같은 사람이 연속으로 뽑히거나 누군가는 몇 바퀴를
 * 돌아도 안 나올 수 있다. 회전은 한 바퀴에 모두가 정확히 한 번씩 대표가 되는 걸 보장한다
 * — "몰려 올라온 날 안 보이는 사람이 생기지 않게"라는 게 애초의 목적이므로.
 */
function rotate<T>(arr: T[], n: number): T[] {
  if (arr.length === 0) return arr;
  const at = ((n % arr.length) + arr.length) % arr.length;
  return [...arr.slice(at), ...arr.slice(0, at)];
}

/**
 * 피드 → 리드 기사 목록.
 *
 * **한 종류당 한 칸이다.** 신규 멤버가 넷이라고 네 칸을 쓰면 스와이프가 명단 낭독이 된다.
 * 대신 한 명(한 건)을 대표로 크게 싣고, 대표는 한 바퀴마다 회전(rotate)해 돌아가며 바뀐다 —
 * 지면에서 빠지는 사람이 없게(우측 레일 대신 시간으로 모두에게 자리를 준다).
 *
 * 스와이프 순서는 `ORDER`가 정한다: 운동기록 → 활동지수 → 새 얼굴 → 목표 한마디 → 대회 → 완주기록.
 *
 * **랜덤 슬롯은 초기값을 서버가 뽑아 넘긴다**(첫 화면부터 랜덤·하이드레이션 안전). 이후
 * 굴리는 건 자동전환/수동 한 바퀴 완주 때만 — 한 사이클 내내는 고정이라 뒤로 스와이프해도
 * 방금 본 슬롯이 안 바뀐다. "다가오는 대회"만 고정(가장 임박한 1건).
 */
function buildLedes(
  feed: StoryFeed,
  reactions: StoryReactionCounts,
  /** 기록 자랑 — 리드 기록자랑 칸(§⑥)에 랜덤 1건 */
  posts: StoryPost[],
  /** 새 얼굴 대표 회전량 — 최근 30일 새 얼굴 중 대표를 굴린다(§②) */
  newbiePick: number,
  /** 각오 칸에 실을 인덱스(§⑤) */
  pledgePick: number,
  /** 기록 칸의 회전량(§③) */
  recordPick: number,
  /** 활동지수 대표 인덱스 — 상위 3명 중 하나(§④) */
  actvPick: number,
  /** 기록자랑 칸에 실을 인덱스(§⑥) */
  postPick: number,
): Lede[] {
  const ledes: Lede[] = [];

  /**
   * 리액션 항목 하나의 카운트를 최신 집계로 보정한다.
   *
   * 피드 캐시(rctn_count)는 최대 5분 지연이라 남이 누른 것도, 내가 방금 누른 것도 늦게 잡힌다.
   * 그래서 총합(count)은 캐시 대신 최신 집계(reactions.totals)를, 내 몫(myCount)은 reactions.mine을
   * 쓴다 — 모두의 응원이 실시간에 가깝게 쌓여 보이고, 새로고침해도 내 몫이 유지된다.
   * 집계에 아직 안 잡힌 극히 짧은 순간을 위해 캐시값을 하한으로 둔다.
   */
  const buildEntity = (
    type: StoryEntityType,
    id: string,
    rctnCd: RctnCd,
    cachedCount: number,
  ): Lede["entity"] => {
    const key = reactionKey(type, id);
    const total = reactions.totals[key] ?? 0;
    return {
      type,
      id,
      rctnCd,
      count: Math.max(cachedCount, total),
      myCount: reactions.mine[key] ?? 0,
    };
  };

  // ① 다가오는 대회 — 가장 임박한 1건만. 참가자를 **종목별로 묶어 나열**한다(B안).
  //    runners는 RPC가 참가자(participant)만 종목·이름 순으로 정렬해 주므로, 여기선 같은 종목이
  //    이어지는 구간을 묶기만 하면 된다(정렬 재계산 불필요). 종목 라벨은 compEvtTypeLabel로
  //    (FULL→풀코스 등 표준코드만 한글, 37K/50K는 그대로, 빈 값은 "종목 미정").
  //    카운트(standfirst)도 참가자 수(runners.length)로 맞춘다 — reg_cnt는 응원·봉사까지 포함해
  //    나열 인원과 어긋난다.
  const race = feed.races.find((r) => getRaceDday(r.stt_dt));
  if (race) {
    const roster: { evt: string; people: Person[] }[] = [];
    for (const r of race.runners) {
      const label = compEvtTypeLabel(r.evt) ?? "종목 미정";
      const last = roster[roster.length - 1];
      const person: Person = {
        mem_id: r.mem_id,
        mem_nm: r.mem_nm,
        avatar_url: r.avatar_url,
      };
      if (last && last.evt === label) last.people.push(person);
      else roster.push({ evt: label, people: [person] });
    }
    const runnerCnt = race.runners.length;
    ledes.push({
      key: `race-${race.entity_id}`,
      kicker: "다가오는 대회",
      entity: buildEntity("race", race.entity_id, race.rctn_cd, race.rctn_count),
      people: [],
      moreCount: 0,
      headline: race.comp_nm,
      standfirst: `${dayjs(race.stt_dt).format("M월 D일")}, 기강인 ${runnerCnt}명이 출발선에 선다`,
      figure: getRaceDday(race.stt_dt),
      figureLabel: null,
      raceRoster: roster,
    });
  }

  // ② 새 얼굴 — 최근 30일. 대표를 한 바퀴마다 굴린다(rotate라 한 바퀴에 모두 정확히 한 번씩
  //    대표가 된다 — 기록 칸과 같은 방식). 최근 1명 고정이 아니라, 최근 30일 새 얼굴 중에서
  //    돌아가며 한 명씩 대표로 크게 세운다.
  const newbiesAll = feed.newbies.filter((n) => withinDays(n.event_at, WINDOW_DAYS));
  const newbies = rotate(newbiesAll, newbiePick);
  const [newbieLead] = newbies;
  if (newbieLead) {
    ledes.push({
      key: `newbie-${newbieLead.entity_id}`,
      kicker: "함께 달려요",
      entity: buildEntity(
        "newbie",
        newbieLead.entity_id,
        newbieLead.rctn_cd,
        newbieLead.rctn_count,
      ),
      // 사람·수치·레일은 아래 newbie 전용 렌더가 통째로 그린다.
      people: [],
      moreCount: 0,
      headline: `${newbieLead.mem_nm}, 기강에 합류하다`,
      standfirst: "",
      figure: null,
      figureLabel: null,
      // 새 얼굴은 "누구인지 모르는 사람"을 소개하는 자리 — 러닝 프로필(페이스·거리·역)을
      // 오른쪽에 세우고, 소개 한마디·가입목적으로 어떤 사람인지 채운다. 신입은 칭호가 없어
      // 이름 옆 칭호 자리에 new 배지가 대신 들어간다(전용 렌더가 그린다).
      newbie: {
        person: {
          mem_id: newbieLead.mem_id,
          mem_nm: newbieLead.mem_nm,
          avatar_url: newbieLead.avatar_url,
        },
        chips: getRunningProfileChips(newbieLead.running_profile ?? null),
        intro: newbieLead.intro_txt?.trim() || null,
        // 한마디와 칩은 독립적으로 뽑는다 — 둘 다 있으면 둘 다 보여준다(렌더가 조합).
        purposeTxt: newbieLead.running_profile?.join_purp_txt?.trim() || null,
        purposes: getJoinPurposeLabelsFromCds(
          newbieLead.running_profile?.join_purp_cds,
        ),
      },
    });
  }

  // ③ 대회 완주기록 — 최근 30일 완주 중 **한 건**을 활동지수 슬롯과 같은 방식으로 세운다.
  //    (30일 필터·최신순은 RPC recent_recs가 이미 건다.) 왼쪽 프사·이름·칭호 ↔ 오른쪽 종목·완주시간,
  //    아래 작게 날짜·대회명 + 응원(🔥 대박). 응원 대상은 이 완주 기록 1건(entity_type "record")이다
  //    — "이 완주를 축하". 대표는 한 바퀴마다 회전(recordPick)해 몰린 대회에서도 돌아가며 올라온다.
  //    30일 안에 완주가 없으면 이 슬롯 자체를 넣지 않는다(빈 칸을 만들지 않는다).
  if (feed.records.length > 0) {
    const rec = rotate(feed.records, recordPick)[0];
    ledes.push({
      key: `record-${rec.entity_id}`,
      // "기록" 명사는 다른 슬롯의 서술체 kicker 사이에서 튄다 — 대회 완주의 순간을 서술체로.
      kicker: "결승선을 넘다",
      // 응원은 이 완주 기록에 건다(record는 ReactableItem — rctn_cd "fire").
      entity: buildEntity("record", rec.entity_id, rec.rctn_cd, rec.rctn_count),
      people: [],
      moreCount: 0,
      headline: "",
      standfirst: "",
      figure: null,
      figureLabel: null,
      raceRecord: {
        person: {
          mem_id: rec.mem_id,
          mem_nm: rec.mem_nm,
          avatar_url: rec.avatar_url,
          badge_effect: rec.badge_effect,
          frame_cd: rec.frame_cd,
          primary_title: rec.primary_title,
        },
        evtLabel: getRecordLabel({
          sport: rec.sport,
          evt: rec.evt,
          rec_time_sec: rec.rec_time_sec,
          race_nm: rec.race_nm,
          race_dt: rec.race_dt,
        }),
        time: secondsToTime(rec.rec_time_sec),
        meta: [
          rec.race_dt ? dayjs(rec.race_dt).format("M월 D일") : null,
          rec.race_nm,
        ]
          .filter(Boolean)
          .join(" · "),
      },
    });
  }

  // ④ 이번 달 활동지수 — 이번 달 활동량 상위 3명 중 하나를 대표로 세운다(랜덤 pick, 한
  //    바퀴마다 갱신). 1등만 세우면 재미가 없어 1·2·3등을 돌아가며 크게 싣는다. 표본이 얇으면
  //    (2명→후보 0~1, 1명→0) 있는 만큼만 pick 범위다.
  //    **순위는 노출하되 점수(actv_score)는 노출하지 않는다** — 순위로 "왜 이 사람이 떴는지"를
  //    말하되(kicker "이번 달 활동지수 N위"), 프로필은 부품 조합(칭호·소개·개인 최고기록)으로 그린다.
  const actvRank = feed.actv_rank; // rank 오름차순으로 이미 정렬돼 온다
  if (actvRank.length > 0) {
    const cap = Math.min(3, actvRank.length); // 대표 후보는 상위 3명(있는 만큼)
    const leadIdx = ((actvPick % cap) + cap) % cap; // 서버가 넉넉히 뽑아도 여기서 clamp
    const lead = actvRank[leadIdx];
    ledes.push({
      key: `actv-${lead.mem_id}`,
      kicker: "이번 달 기강 잡는",
      // 응원 대상은 이 대표 멤버 — entity_type "actv" + mem_id로 무한 응원(🔥 대박)을 받는다.
      // 피드 캐시엔 이 응원 수가 없어(actv는 원천 테이블이 아니다) 하한 0에서 시작하고,
      // 최신 집계(reactions.totals/mine)를 buildEntity가 얹는다.
      entity: buildEntity("actv", lead.mem_id, "fire", 0),
      // 사람·수치·레일은 쓰지 않는다 — 아래 profile 렌더가 프로필 부품으로 통째로 그린다.
      people: [],
      moreCount: 0,
      // 명조 헤드라인 — 여러 멘트 중 하나(대표와 같은 actvPick으로 골라 한 바퀴마다 함께 굴린다).
      headline: ACTV_HEADLINES[actvPick % ACTV_HEADLINES.length].replace(
        "{name}",
        lead.mem_nm,
      ),
      standfirst: "",
      figure: null,
      figureLabel: null,
      profile: {
        person: {
          mem_id: lead.mem_id,
          mem_nm: lead.mem_nm,
          avatar_url: lead.avatar_url,
          badge_effect: lead.badge_effect,
          frame_cd: lead.frame_cd,
          intro_txt: lead.intro_txt,
          primary_title: lead.primary_title,
          running_profile: lead.running_profile,
          best_records: lead.best_records,
          mth_attd_cnt: lead.mth_attd_cnt,
          mth_rec_cnt: lead.mth_rec_cnt,
        },
        // 칭호(이름 옆) → 소개 한마디(왼쪽) → 개인 최고기록(오른쪽). 러닝 프로필은 빼둔다
        // — 페이스·역 칩은 "누구인지 모르는 새 얼굴"을 소개할 때 필요한 거라 신입 슬롯에 맡긴다.
        // 여기선 이미 실적(최고기록)으로 사람이 서므로 칩을 더하면 시선만 흩어진다.
        parts: ["title", "intro", "bestRecord"],
        rank: lead.rank,
      },
    });
  }

  // ⑤ 목표 한마디 — 존재하는 목표 중 **하나만** 싣는다. 활동지수 슬롯과 같은 방식으로
  //    (명조 헤드라인=목표 문장 + 프로필 부품[칭호·소개] + 응원) 그린다. 응원 대상은 목표
  //    팻말이 아니라 **그 목표를 쓴 사람**이다 — entity_type "actv" + mem_id로 무한 응원(🔥 대박).
  //    피드 캐시엔 이 응원 수가 없어(0에서 시작) 최신 집계(reactions.totals/mine)를 buildEntity가 얹는다.
  //    최고기록·러닝프로필은 이 슬롯에서 안 쓴다(칭호·소개만) — 목표 문장과 경쟁해 시선이 흩어진다.
  //    어느 목표를 고를지는 호출자가 정한다(`pledgePick`) — 여기서 Math.random()을 쓰면
  //    서버와 클라이언트가 다른 목표를 골라 하이드레이션이 깨진다.
  const pledgePool = dedupePledgesByMember(feed.pledges);
  const pledgeLead = pledgePool[pledgePick % Math.max(pledgePool.length, 1)];
  if (pledgeLead) {
    ledes.push({
      key: `pledge-${pledgeLead.pldg_id}`,
      kicker: "여러분께 고합니다",
      entity: buildEntity("actv", pledgeLead.mem_id, "fire", 0),
      // 사람·수치·레일은 쓰지 않는다 — 아래 profile 렌더가 프로필 부품으로 통째로 그린다.
      people: [],
      moreCount: 0,
      // 헤드라인이 곧 목표 문장(따옴표로 인용). standfirst는 profile 분기에서 안 쓰인다.
      headline: `“${pledgeLead.pldg_txt}”`,
      standfirst: "",
      figure: null,
      figureLabel: null,
      profile: {
        person: {
          mem_id: pledgeLead.mem_id,
          mem_nm: pledgeLead.mem_nm,
          avatar_url: pledgeLead.avatar_url,
          badge_effect: pledgeLead.badge_effect,
          frame_cd: pledgeLead.frame_cd,
          intro_txt: pledgeLead.intro_txt,
          primary_title: pledgeLead.primary_title,
        },
        // 칭호(이름 옆) → 소개 한마디(왼쪽). 러닝 프로필·최고기록은 뺀다 — 목표 문장이 이미
        // 헤드라인으로 서 있어, 부품을 더하면 시선만 흩어진다.
        parts: ["title", "intro"],
      },
    });
  }

  // ⑥ 운동 기록 — 레코드보드에 올라온 자랑 중 **랜덤 1건**. 하단 격자존은 그대로 두고,
  //    리드에선 사진 한 장을 크게 + 한마디 + 수치(종목·거리·날짜) + 올린 사람으로 세운다.
  //    주인공은 "그 사람이 한 운동"이라 러닝 프로필(페이스·역 등 간단 프로필)은 넣지 않는다 —
  //    사진·한마디·수치와 경쟁해 시선이 흩어진다. 사람은 아바타+이름으로만 조연으로 둔다.
  //    (사진 없으면 프사로 폴백 — 격자와 같은 규칙). postPick은 호출자가 굴린다(서버·클라 일치).
  if (posts.length > 0) {
    const post = posts[postPick % posts.length];
    const person: Person = {
      mem_id: post.mem_id,
      mem_nm: post.mem_nm,
      avatar_url: post.avatar_url,
    };
    // 날짜 · [종목 이모지] 거리 — 사진 옆 수치 줄. 이름은 여기 넣지 않는다(사람 줄이 맡는다).
    // 종목은 글자 대신 이모지(🏃 🚴 …)로 — 프로젝트(마일리지런) 한마디와 같은 표기다.
    // 이모지는 거리 앞에 붙여 "🏃 10.5km"로 묶는다(가운뎃점 사이에 홀로 두면 어색하다).
    const emoji = getSportEmoji(post.sprt_enm);
    const km =
      post.dst_km != null && !Number.isNaN(post.dst_km)
        ? `${Number(post.dst_km.toFixed(2))}km`
        : null;
    const sportDist = [emoji, km].filter(Boolean).join(" ") || null;
    const meta = [
      post.act_dt ? dayjs(post.act_dt).format("M월 D일") : null,
      sportDist,
    ]
      .filter(Boolean)
      .join(" · ");
    ledes.push({
      key: `post-${post.post_id}`,
      // "운동 기록"은 딱딱해 친목 러닝크루 톤에 안 맞는다 — "오늘, 기강은"으로 서술체.
      // 오늘 기강 회원이 이렇게 달렸다는 이야기가 사진·한마디로 이어지는 결.
      kicker: "오늘, 기강은",
      entity: null,
      // 사람은 렌더의 사진 옆 아바타+이름 줄이 맡는다(people 줄은 안 쓴다 — 사진 슬롯 전용 렌더).
      people: [],
      moreCount: 0,
      // 헤드라인은 한마디(따옴표). 한마디가 비면 이름으로 대체한다.
      headline: post.cmnt_txt ? `“${post.cmnt_txt}”` : `${post.mem_nm}의 기록`,
      standfirst: meta,
      figure: null,
      figureLabel: null,
      photo: {
        url: post.photo_url,
        person,
        title: post.primary_title
          ? {
              ttl_nm: post.primary_title.ttl_nm,
              badge_effect: post.badge_effect ?? "none",
            }
          : null,
      },
    });
  }

  // 스와이프 순서 — 지면 위계를 여기서 한 곳에 고정한다. 위 push 순서(존별 생성 편의)와
  // 분리해 두면, 순서를 바꿀 때 블록을 옮기지 않고 이 표만 고치면 된다. 목록에 없는 존이
  // 생기면(접두어 매칭 실패) 맨 뒤로 보낸다(ORDER에 없으면 큰 값).
  const ORDER = ["post", "actv", "newbie", "pledge", "race", "record"];
  const rank = (key: string) => {
    const i = ORDER.findIndex((p) => key.startsWith(`${p}-`));
    return i === -1 ? ORDER.length : i;
  };
  ledes.sort((a, b) => rank(a.key) - rank(b.key));

  return ledes;
}

/**
 * 1면 리드 기사 — 한 번에 한 건, 3초마다 다음 기사로 넘어가고 마지막 다음은 처음이다.
 *
 * 스크롤 컨테이너 대신 인덱스 상태로 한 장만 그린다. 스와이프 한 번에 정확히 한 칸씩
 * 움직여야 해서(관성 스크롤은 여러 칸을 건너뛴다) 포인터 제스처를 직접 읽는다.
 *
 * 사용자가 직접 넘기면 10초 멈춘다 — 읽는 중에 바뀌는 게 가장 거슬리므로. 다만 영영
 * 멈추면 한 번 만진 뒤로는 전광판이 죽은 화면이 되므로, 반응이 없으면 자동 전환을 되살린다.
 */
export function StoryLede({
  feed,
  reactions,
  posts,
  initialNewbiePick,
  initialPledgePick,
  initialRecordPick,
  initialActvPick,
  initialPostPick,
  onSelectMember,
}: {
  feed: StoryFeed;
  /** 응원 집계 (모두의 총합 + 내 몫) — 응원 버튼 카운트 보정용 */
  reactions: StoryReactionCounts;
  /** 기록 자랑 — 기록자랑 칸에 랜덤 1건 */
  posts: StoryPost[];
  /** 리드 각 랜덤 슬롯의 진입 인덱스 — 서버가 매 요청 뽑아 넘긴다(§story/page.tsx).
   *  첫 화면부터 랜덤이고 하이드레이션이 안전하다(렌더 중 Math.random 금지). */
  initialNewbiePick: number;
  initialPledgePick: number;
  initialRecordPick: number;
  initialActvPick: number;
  initialPostPick: number;
  onSelectMember: (memId: string, name: string) => void;
}) {
  // 모든 랜덤 슬롯의 pick — 서버가 뽑은 초기값에서 출발한다(첫 화면부터 랜덤·하이드레이션
  // 안전). 렌더 중 Math.random()을 부르면 서버·클라가 다른 걸 골라 하이드레이션이 깨진다.
  // 굴리는 건 자동전환/수동이 **한 바퀴를 완주하는 순간**에만(아래 타이머·go). 한 사이클
  // 내내는 고정이라 뒤로 스와이프해도 방금 본 슬롯이 안 바뀐다.
  const [newbiePick, setNewbiePick] = useState(initialNewbiePick);
  const [pledgePick, setPledgePick] = useState(initialPledgePick);
  const [recordPick, setRecordPick] = useState(initialRecordPick);
  const [actvPick, setActvPick] = useState(initialActvPick);
  const [postPick, setPostPick] = useState(initialPostPick);
  const ledes = buildLedes(
    feed,
    reactions,
    posts,
    newbiePick,
    pledgePick,
    recordPick,
    actvPick,
    postPick,
  );
  const total = ledes.length;

  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  /**
   * 자동 전환 끄기 — **테스트용 임시 토글**이다(운영에 남길 UI 아님).
   *
   * `paused`(손이 닿아 8초 쉬는 중)와 분리해 둔다: 껐는데 8초 뒤 되살아나면 끈 게 아니고,
   * 켤 때 남아있던 일시정지를 물려받으면 켜자마자 안 도는 것처럼 보인다.
   */
  const [autoOff, setAutoOff] = useState(false);
  /** 게이지를 처음부터 다시 굴리기 위한 세대 번호 — 같은 장에 머물러 재개할 때 필요 */
  const [runId, setRunId] = useState(0);
  /** 탭이 숨어 있나 — 초기값은 false로 둔다(서버 렌더와 첫 클라 렌더가 같아야 한다) */
  const [hidden, setHidden] = useState(false);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const resumeTimerRef = useRef<number | null>(null);

  /**
   * 한 바퀴 완주 시 모든 랜덤 슬롯을 한꺼번에 다시 뽑는다.
   *
   * 매 전환마다 굴리면 뒤로 스와이프했을 때 방금 본 슬롯이 이미 바뀌어 있다 — 그래서 한
   * 사이클(마지막 장 → 처음) 단위로만 굴린다. 회전 계열(새얼굴·기록·각오)은 인덱스를 계속
   * 키워도 buildLedes가 pool 길이로 나눠 쓰므로 안전하고, 운동기록·활동지수는 pool 크기에
   * 맞춰 새로 뽑는다. effect 밖(콜백)에서만 부른다 — 렌더 순수성 유지.
   */
  const rerollAllPicks = useCallback(() => {
    setNewbiePick((n) => n + 1 + Math.floor(Math.random() * 3));
    setPledgePick((n) => n + 1 + Math.floor(Math.random() * 3));
    // 기록도 단건 회전이라 새얼굴·목표처럼 한 바퀴마다 1~3칸 밀어 다음 대표가 바뀌게 한다.
    setRecordPick((n) => n + 1 + Math.floor(Math.random() * 3));
    setActvPick(() => pickActvLeadIndex(feed.actv_rank.length));
    setPostPick(() => pickRandomPostIndex(posts.length));
  }, [feed.actv_rank.length, posts.length]);

  /**
   * 손이 닿았다 — 4초 완전히 멈췄다가 게이지를 처음부터 다시 굴린다(총 8초 뒤 다음 장).
   *
   * 멈춘 자리에서 이어서 채우면 남은 시간이 손댄 순간에 따라 제각각이라(다 찬 직후면
   * 거의 0) 8초를 기다린 보람 없이 바로 넘어간다. 0에서 다시 시작해야 "멈췄다가 새로
   * 센다"가 눈에 보인다.
   */
  const pauseThenResume = useCallback(() => {
    setPaused(true);
    if (resumeTimerRef.current !== null)
      window.clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = window.setTimeout(() => {
      setPaused(false);
      // 같은 장에 머문 채 재개하는 경우 active가 그대로라 key가 안 변한다 —
      // 이 카운터를 키에 섞어야 게이지가 0부터 다시 찬다.
      setRunId((n) => n + 1);
    }, FREEZE_MS);
  }, []);

  /** 테스트 토글 — 켤 때는 남은 일시정지를 걷어내고 즉시 돌게 한다 */
  const toggleAuto = useCallback(() => {
    // 부수효과는 업데이터 밖에서 — 업데이터 콜백은 순수해야 하고 React가 두 번 부를 수
    // 있다(StrictMode). `autoOff`가 이미 스코프에 있어 현재 값으로 분기하면 된다.
    if (autoOff) {
      if (resumeTimerRef.current !== null)
        window.clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
      setPaused(false);
      // 켜는 순간 게이지도 0에서 새로 센다 — 껐을 때 멈춰 있던 지점에서 이어 채우면
      // 켜자마자 넘어가 버린다.
      setRunId((n) => n + 1);
    }
    setAutoOff((off) => !off);
  }, [autoOff]);

  /** 게이지가 멈춰야 하는가 — 손이 닿았거나 · 테스트로 껐거나 · 탭이 숨었거나 */
  const frozen = paused || autoOff || hidden;

  useEffect(() => {
    return () => {
      if (resumeTimerRef.current !== null)
        window.clearTimeout(resumeTimerRef.current);
    };
  }, []);

  const go = useCallback(
    (dir: 1 | -1) => {
      if (total === 0) return;
      // 수동으로도 한 바퀴를 앞으로 완주하면(마지막 → 처음) 재추첨한다 — 자동전환과 같은 규칙.
      // 다만 **뒤로**(처음 → 마지막) 감길 땐 굴리지 않는다: 그건 방금 지나친 걸 다시 보려는
      // 동작이라, 여기서 바꾸면 "이전 걸 보려다 새 걸 보게 되는" 원래 짜증이 그대로 재발한다.
      let wrapped = false;
      setActive((i) => {
        wrapped = dir === 1 && i === total - 1;
        return (i + dir + total) % total;
      });
      if (wrapped) rerollAllPicks();
    },
    [total, rerollAllPicks],
  );

  /**
   * 탭이 숨으면 세지 않는다 — 안 보는 동안 소식이 다 지나가 버리면 돌아왔을 때
   * 볼 게 없다. 돌아오면 그때부터 게이지·타이머가 함께 0에서 다시 돈다(runId).
   */
  useEffect(() => {
    const onVisible = () => {
      setHidden(document.hidden);
      if (!document.hidden) setRunId((n) => n + 1);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => {
    if (frozen || total <= 1) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    // interval이 아니라 **장마다 새로 거는 timeout**이다. 게이지(CSS 애니메이션)는
    // active·runId가 바뀔 때마다 0에서 다시 도는데, 넘기는 쪽만 고정 주기 interval이면
    // 둘의 위상이 어긋난다 — 특히 탭이 백그라운드였다 돌아오면 게이지는 가득 찬 채로
    // 멈춰 있고 전환은 엉뚱한 시점에 온다. 같은 트리거(active·runId)로 다시 걸어야
    // "다 차는 순간 넘어간다"가 항상 맞는다.
    const timer = window.setTimeout(() => {
      // 마지막 장(total-1)에서 다음이 0으로 감기는 순간이 "한 바퀴 완주"다. 그때만 모든
      // 랜덤 슬롯을 재추첨한다 — 한 사이클 내내는 고정이라 뒤로 스와이프해도 안 바뀐다.
      // 판정만 업데이터에서 하고(순수 유지), 실제 재추첨은 업데이터 밖에서 부른다.
      // setTimeout 콜백은 StrictMode에서 이중 실행되지 않아 wrapped 클로저가 안전하다.
      let wrapped = false;
      setActive((i) => {
        wrapped = i === total - 1;
        return (i + 1) % total;
      });
      if (wrapped) rerollAllPicks();
    }, ROTATE_MS);

    return () => window.clearTimeout(timer);
  }, [frozen, total, active, runId, rerollAllPicks]);

  if (total === 0) {
    return (
      <div className="px-6 py-10 text-center">
        <p className="font-serif text-[19px] text-foreground">
          오늘은 전할 소식이 없습니다
        </p>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          모임에 나가거나 기록을 남기면 이 자리에 실립니다.
        </p>
      </div>
    );
  }

  const lede = ledes[active];

  /** 스와이프 — 가로 이동이 세로보다 크고 40px 넘으면 한 칸 */
  function handlePointerUp(e: PointerEvent) {
    const start = dragStart.current;
    dragStart.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) < 40 || Math.abs(dx) <= Math.abs(dy)) return;
    pauseThenResume();
    go(dx < 0 ? 1 : -1);
  }

  return (
    <section
      aria-label="오늘의 기강"
      onPointerDown={(e) => {
        dragStart.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        dragStart.current = null;
      }}
      // 사각형 테두리 — /dev/story-styles의 러닝 브랜드(G안) 상단 프레임 톤(얇은 border).
      // 페이지 px-6은 바깥에 두고 프레임은 그 안쪽에 그린다(테두리가 화면 가장자리에
      // 붙지 않게). 안쪽 패딩은 p-5로 콘텐츠와 선 사이를 띄운다.
      className="touch-pan-y select-none px-6"
    >
    {/* pt-4 — 프레임 테두리와 슬롯(kicker) 사이 위 여백을 좌우·아래(p-5, 20px)보다 조금
        줄인다. 위가 떠 보인다는 피드백 반영. 모든 슬롯 공통. */}
    <div className="rounded-2xl border border-border p-5 pt-2">
      {/* 슬롯마다 내용 높이가 달라 자동 전환·스와이프 때 지면이 출렁인다 — 가장 큰 슬롯에
          맞춰 **고정**한다(min-h가 아니라 h). min-h면 내용이 많은 슬롯(활동지수 2단·긴 목표)이
          이 값을 넘겨 다시 지면이 출렁인다. 값은 가장 큰 슬롯(대회: 헤드라인 2줄+아바타 lg+응원 /
          운동 기록: 사진 144 + 메타 줄)이 잘리지 않는 224px — 이보다 낮추면 운동 기록 슬롯의
          맨 아래 프로필 아바타가 overflow-hidden에 잘린다.
          items-stretch로 article이 이 높이를 꽉 채워, 짧은 슬롯(완주기록 등)은 자기 내용을
          justify-center로 세로 가운데에 앉힌다(예전 items-start에선 아래만 휑했다). */}
      <div
        key={lede.key}
        className="lede-in flex h-[224px] items-stretch gap-3 overflow-hidden"
      >
        <article className="flex h-full min-w-0 flex-1 flex-col gap-3">
          <span className="font-numeric text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {lede.kicker}
          </span>

          {/* 새 얼굴 슬롯(§②) — 명조 헤드라인 + 전용 프로필 레이아웃.
              위: 왼쪽(아바타 + 이름 + new 배지) ↔ 오른쪽(러닝프로필 칩 세로 스택).
              아래: 소개 한마디 → 가입목적 칩 ↔ 환영(응원) 버튼.
              신입은 칭호가 없어 칭호 자리에 new 배지가 들어간다. */}
          {lede.newbie ? (
            <div className="flex flex-1 flex-col justify-center gap-3">
              {lede.headline && (
                <h2 className="-mt-1 line-clamp-2 text-pretty break-keep font-serif text-[22px] font-normal leading-[1.3] text-foreground [overflow-wrap:anywhere]">
                  {lede.headline}
                </h2>
              )}
              {/* 위 2단 — 왼쪽 인물(아바타·이름·new) ↔ 오른쪽 러닝프로필 칩 세로 스택.
                  칩이 없어도(러닝 프로필 미입력) 왼쪽이 폭을 다 쓰게 오른쪽은 조건부. */}
              <div className="flex items-start gap-4">
                <button
                  type="button"
                  onClick={() =>
                    onSelectMember(lede.newbie!.person.mem_id, lede.newbie!.person.mem_nm)
                  }
                  aria-label={`${lede.newbie.person.mem_nm} 프로필 보기`}
                  className="flex min-w-0 flex-1 items-center gap-2.5 rounded-2xl text-left transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99]"
                >
                  <Avatar
                    src={lede.newbie.person.avatar_url}
                    seed={lede.newbie.person.mem_id}
                    alt={lede.newbie.person.mem_nm}
                    size="lg"
                  />
                  {/* 이름 위, NEW 아래로 세로로 쌓고 가운데 정렬 — NEW는 칭호 자리(이름 아래)를 대신한다. */}
                  <div className="flex min-w-0 flex-col items-center gap-1">
                    <span className="truncate text-[17px] font-bold text-foreground">
                      {lede.newbie.person.mem_nm}
                    </span>
                    {/* 신입 표식 — 칭호 자리를 대신한다. board-amber가 아닌 전용 강조(빨강). */}
                    <span className="shrink-0 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none tracking-wide text-destructive">
                      new
                    </span>
                  </div>
                </button>

                {lede.newbie.chips.length > 0 && (
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    {lede.newbie.chips.map((chip) => (
                      <ProfileChip key={chip.kind} chip={chip} />
                    ))}
                  </div>
                )}
              </div>

              {/* 소개 한마디 — 본인의 말이라 인용구로(§④ intro와 같은 스타일). 한 줄 말줄임. */}
              {lede.newbie.intro && (
                <blockquote className="truncate rounded-r-md border-l-2 border-border bg-muted/50 py-1.5 pl-2.5 pr-2 font-serif text-[13.5px] leading-relaxed text-foreground">
                  “{lede.newbie.intro}”
                </blockquote>
              )}

              {/* 아래 블록 — "가입목적" 라벨(위) + 그 내용(왼쪽) ↔ 환영 응원 버튼(오른쪽, 세로 중앙).
                  직접 쓴 한마디(purposeTxt)와 고른 칩(purposes)은 독립적으로 그린다 —
                  한마디만/칩만/둘 다 각 경우를 있는 그대로 보여준다(둘 다면 한마디 위·칩 아래).
                  가입목적이 통째로 없어도 응원 버튼은 남아야 하므로 왼쪽 내용만 조건부. */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  {(lede.newbie.purposeTxt || lede.newbie.purposes.length > 0) && (
                    <>
                      <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                        가입목적
                      </span>
                      {lede.newbie.purposeTxt && (
                        <span className="min-w-0 truncate text-[13px] leading-relaxed text-foreground">
                          “{lede.newbie.purposeTxt}”
                        </span>
                      )}
                      {lede.newbie.purposes.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {lede.newbie.purposes.map((label) => (
                            <PurposeChip key={label} label={label} />
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
                {lede.entity && (
                  <div className="shrink-0">
                    <StoryReactionButton
                      entityType={lede.entity.type}
                      entityId={lede.entity.id}
                      rctnCd={lede.entity.rctnCd}
                      initialCount={lede.entity.count}
                      initialMyCount={lede.entity.myCount}
                      onInteract={pauseThenResume}
                    />
                  </div>
                )}
              </div>
            </div>
          ) : /* 활동지수 슬롯(§④) — 명조 헤드라인 + 프로필 부품 조합. 다른 슬롯처럼 신문 헤드라인을
              얹고 그 아래 프로필(아바타+이름 위에 parts 순서대로 조각)을 쌓는다.
              나머지 분기(사진·기록·헤드라인)보다 앞서 걸러 people/figure 공통 줄을 건너뛴다. */
          lede.profile ? (
            <div className="flex flex-1 flex-col justify-center gap-3">
              {lede.headline && (
                // 명조 헤드라인은 line-box 상단 여백이 있어 kicker와의 간격이 사진 슬롯보다
                // 커 보인다 — 첫 슬롯(운동기록) 기준에 맞추려고 상단 여백을 살짝 트림(-mt-1).
                <h2 className="-mt-1 line-clamp-2 text-pretty break-keep font-serif text-[22px] font-normal leading-[1.3] text-foreground [overflow-wrap:anywhere]">
                  {lede.headline}
                </h2>
              )}
              <PersonProfile
                person={lede.profile.person}
                parts={lede.profile.parts}
                rank={lede.profile.rank}
                onSelect={onSelectMember}
                // 인용구(한마디) 줄 우측에 응원 버튼 — 이 대표 멤버를 무한 응원(🔥 대박).
                reactionSlot={
                  lede.entity && (
                    <StoryReactionButton
                      entityType={lede.entity.type}
                      entityId={lede.entity.id}
                      rctnCd={lede.entity.rctnCd}
                      initialCount={lede.entity.count}
                      initialMyCount={lede.entity.myCount}
                      onInteract={pauseThenResume}
                    />
                  )
                }
              />
            </div>
          ) : /* 운동 기록 칸 — 위(사진 | 한마디) + 아래 메타 한 줄(사람 ↔ 수치).
              · 위: 좌측 사진(크게, 정사각) / 우측 한마디
              · 아래: 전체 폭 한 줄 — 왼쪽 프사·이름·칭호, 오른쪽 날짜·종목·거리
              메타를 2단 밖 한 줄로 빼야 손그림처럼 사람과 수치가 같은 바닥선에서 마주본다.
              사진은 컨테이너 좌패딩(p-5)을 음수 마진으로 조금 당겨 왼쪽 여백을 줄인다. */
          lede.photo ? (
            <div className="flex flex-1 flex-col gap-3">
              {/* 위 — 사진(좌) + 한마디(우). */}
              <div className="flex min-h-0 flex-1 items-start gap-3">
                {/* 사진은 클릭 대상이 아니다 — 프로필 카드는 아래 프사·이름을 눌러야 열린다.
                    사진은 그 운동의 장면일 뿐이라 눌러도 반응하지 않는 게 자연스럽다.
                    크기는 **픽셀 고정 정사각**(h-36 w-36 = 144px)이다 — h-full은 부모 높이가
                    확정돼야 먹는데, 슬롯→article→photo 래퍼로 내려오는 높이 전파가
                    items-start(위 정렬)에서 끊겨 0이 된다(사진이 안 보였던 원인). 슬롯 높이가
                    고정이라 사진을 픽셀로 못박는다.
                    음수 마진(-ml)은 두지 않는다 — 슬롯 컨테이너의 overflow-hidden(세로 잘림
                    방지용)이 왼쪽으로 삐져나온 부분까지 잘라 사진 왼쪽이 잘렸다. */}
                <div className="relative h-36 w-36 shrink-0 overflow-hidden rounded-xl bg-muted">
                  {/* 사진 → 프사 → DiceBear 폴백. 셋 다 없어 src=""가 되면 Image가 터지므로
                      마지막 폴백까지 항상 값이 있게 한다(격자 존과 같은 폴백 사슬). */}
                  <Image
                    src={
                      // 빈 문자열("")도 폴백으로 내려가게 || 사슬 — photo_url·avatar_url이 text
                      // nullable이라 ""가 들어올 수 있고, ??는 그걸 못 걸러 빈 src가 Image에 간다.
                      lede.photo.url ||
                      lede.photo.person.avatar_url ||
                      buildFallbackAvatarUrl(lede.photo.person.mem_id)
                    }
                    alt={lede.photo.person.mem_nm}
                    fill
                    sizes="45vw"
                    // 격자 존·아바타와 동일하게 최적화를 끈다 — 이 프로젝트는 remotePatterns를
                    // 설정하지 않고 외부 URL(Storage·DiceBear)을 unoptimized로 그린다.
                    unoptimized
                    className="object-cover"
                  />
                </div>
                {/* 한마디 — 사진 옆이라 대회 헤드라인(26px)보다 작게(15px). */}
                <h2 className="line-clamp-6 min-w-0 flex-1 text-pretty break-keep pt-0.5 font-serif text-[15px] font-normal leading-[1.5] text-foreground [overflow-wrap:anywhere]">
                  {lede.headline}
                </h2>
              </div>

              {/* 아래 메타 한 줄 — 왼쪽 사람(프사·이름·칭호), 오른쪽 수치(날짜·종목·거리) */}
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() =>
                    onSelectMember(lede.photo!.person.mem_id, lede.photo!.person.mem_nm)
                  }
                  aria-label={`${lede.photo.person.mem_nm} 프로필 보기`}
                  className="flex min-w-0 items-center gap-1.5 rounded-full transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
                >
                  <Avatar
                    src={lede.photo.person.avatar_url}
                    seed={lede.photo.person.mem_id}
                    alt={lede.photo.person.mem_nm}
                    size="sm"
                  />
                  <span className="truncate text-[13px] font-bold text-foreground">
                    {lede.photo.person.mem_nm}
                  </span>
                  {lede.photo.title && (
                    <TitleBadge
                      name={lede.photo.title.ttl_nm}
                      effect={lede.photo.title.badge_effect}
                      size="xs"
                    />
                  )}
                </button>
                {lede.standfirst && (
                  <span className="shrink-0 font-numeric text-[12px] text-muted-foreground tabular-nums">
                    {lede.standfirst}
                  </span>
                )}
              </div>
            </div>
          ) : lede.raceRecord ? (
            /* 대회 완주기록 슬롯(§③) — 활동지수와 같은 결. 왼쪽 프사+이름+칭호 ↔ 오른쪽 종목·완주시간,
               아래 작게 날짜·대회명 + 응원(🔥). 프로필 부품(PersonProfile) 대신 전용 레이아웃을 쓴다
               — 오른쪽에 "이 완주의 종목·시간"을 세워야 하는데 그건 부품에 없는 형태라서.
               내용이 짧아 슬롯(224px 고정)을 절반만 채운다 — 위로 붙이면 아래가 통째로 휑해서,
               세로 가운데(justify-center)로 위아래 여백을 나눠 짧은 내용을 슬롯 중앙에 앉힌다. */
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-3">
              <div className="flex min-w-0 items-center gap-4">
                {/* 왼쪽 — 프사 + 이름 + 칭호 */}
                <button
                  type="button"
                  onClick={() =>
                    onSelectMember(
                      lede.raceRecord!.person.mem_id,
                      lede.raceRecord!.person.mem_nm,
                    )
                  }
                  aria-label={`${lede.raceRecord.person.mem_nm} 프로필 보기`}
                  className="flex min-w-0 flex-1 items-center gap-2.5 rounded-2xl text-left transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99]"
                >
                  <Avatar
                    src={lede.raceRecord.person.avatar_url}
                    seed={lede.raceRecord.person.mem_id}
                    alt={lede.raceRecord.person.mem_nm}
                    size="lg"
                  />
                  <div className="flex min-w-0 flex-col items-start gap-1">
                    <span className="truncate text-[17px] font-bold text-foreground">
                      {lede.raceRecord.person.mem_nm}
                    </span>
                    {lede.raceRecord.person.primary_title && (
                      <TitleBadge
                        name={lede.raceRecord.person.primary_title.ttl_nm}
                        effect={lede.raceRecord.person.badge_effect ?? "none"}
                        size="xs"
                      />
                    )}
                  </div>
                </button>
                {/* 오른쪽 — 종목(작게) + 완주시간(크게) */}
                <div className="flex shrink-0 flex-col items-end">
                  <span className="text-[11px] text-muted-foreground">
                    {lede.raceRecord.evtLabel}
                  </span>
                  <span className="font-numeric text-[27px] font-medium leading-none text-foreground tabular-nums">
                    {lede.raceRecord.time}
                  </span>
                </div>
              </div>
              {/* 아래 — 날짜·대회명(작게, 줄바꿈) ↔ 응원 */}
              <div className="flex items-center justify-between gap-3">
                {lede.raceRecord.meta && (
                  <span className="min-w-0 flex-1 break-keep text-[11px] leading-relaxed text-muted-foreground">
                    {lede.raceRecord.meta}
                  </span>
                )}
                {lede.entity && (
                  <StoryReactionButton
                    entityType={lede.entity.type}
                    entityId={lede.entity.id}
                    rctnCd={lede.entity.rctnCd}
                    initialCount={lede.entity.count}
                    initialMyCount={lede.entity.myCount}
                    onInteract={pauseThenResume}
                  />
                )}
              </div>
            </div>
          ) : (
            /* 각오처럼 띄어쓰기 없는 긴 문자열도 넘치지 않게 — break-keep(어절 유지)만으론
               연속 문자를 못 끊으니 overflow-wrap:anywhere를 더하고, 최대 3줄로 말줄임한다.
               -mt-1은 명조 상단 여백 트림 — kicker와의 간격을 첫 슬롯(운동기록) 기준에 맞춘다. */
            <h2 className="-mt-1 line-clamp-3 text-pretty break-keep font-serif text-[26px] font-normal leading-[1.28] text-foreground [overflow-wrap:anywhere]">
              {lede.headline}
            </h2>
          )}

          {/* 리드문 — 기록 자랑(photo)·활동지수(profile)·새 얼굴(newbie)·대회(raceRoster) 슬롯은 위/아래
              자체 렌더에서 사람·수치를 그리므로 이 공통 줄들(standfirst·아바타 줄)을 건너뛴다(중복·헛간격 방지). */}
          {!lede.photo && !lede.profile && !lede.newbie && !lede.raceRoster && !lede.raceRecord && (
            <p className="break-keep text-[13px] leading-relaxed text-muted-foreground">
              {lede.standfirst}
            </p>
          )}

          {/* 대회 슬롯(§①) — 참가자를 종목별로 묶어 나열(B안). standfirst → 나열(남는 공간 스크롤)
              → 하단 D-day + 응원. 여백은 조정안 B(촘촘) — kicker/헤드라인 공통 gap-3 위에서
              나열 영역만 flex-1로 늘리고 줄 간격을 좁게 준다. */}
          {lede.raceRoster && (
            <div className="flex min-h-0 flex-1 flex-col gap-1.5">
              <p className="break-keep text-[13px] leading-relaxed text-muted-foreground">
                {lede.standfirst}
              </p>
              {lede.raceRoster.length > 0 && (
                <div className="min-h-0 flex-1 overflow-y-auto pt-0.5 [scrollbar-width:thin]">
                  {lede.raceRoster.map((g) => (
                    <div
                      key={g.evt}
                      className="flex items-baseline gap-2.5 py-0.5"
                    >
                      {/* 종목 라벨 — 스크린 존이 아니라 board-amber는 못 쓴다(DESIGN 규칙).
                          primary로 종목을 도드라지게, 이름은 foreground로 둔다. */}
                      <span className="min-w-[42px] shrink-0 font-numeric text-[12px] font-bold text-primary tabular-nums">
                        {g.evt}
                      </span>
                      <span className="text-[14px] leading-relaxed text-foreground">
                        {g.people.map((p, i) => (
                          <span key={p.mem_id}>
                            {i > 0 && (
                              <span className="text-muted-foreground">, </span>
                            )}
                            <button
                              type="button"
                              onClick={() => onSelectMember(p.mem_id, p.mem_nm)}
                              className="rounded transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              {p.mem_nm}
                            </button>
                          </span>
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {/* 하단 — D-day(왼쪽) + 응원(오른쪽). 다른 슬롯처럼 응원 버튼이 맨 아래에 온다. */}
              <div className="mt-auto flex items-center justify-between gap-3 pt-1">
                {lede.figure && (
                  <span className="font-serif text-[24px] font-medium leading-none tracking-[0.04em] text-foreground">
                    {lede.figure}
                  </span>
                )}
                {lede.entity && (
                  <StoryReactionButton
                    entityType={lede.entity.type}
                    entityId={lede.entity.id}
                    rctnCd={lede.entity.rctnCd}
                    initialCount={lede.entity.count}
                    initialMyCount={lede.entity.myCount}
                    onInteract={pauseThenResume}
                  />
                )}
              </div>
            </div>
          )}

          {/* 아바타·수치 줄 — 기록·프로필·새 얼굴·대회 칸은 사람과 기록을 이미 목록/프로필 안에 품고 있어
              이 줄이 통째로 비고, 빈 flex가 gap만 남겨 리드문 아래에 헛간격이 생긴다. */}
          {!lede.photo && !lede.profile && !lede.newbie && !lede.raceRoster && !lede.raceRecord && (lede.people.length > 0 || lede.figure) && (
          <div className="flex items-center gap-3 pt-0.5">
            <div className="flex shrink-0">
              {lede.people.map((p, i) => (
                <button
                  key={p.mem_id}
                  type="button"
                  onClick={() => onSelectMember(p.mem_id, p.mem_nm)}
                  aria-label={`${p.mem_nm} 프로필 보기`}
                  className={cn(
                    "rounded-full transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95",
                    i > 0 && "-ml-2.5",
                    lede.people.length > 1 && "ring-2 ring-background",
                  )}
                >
                  <Avatar
                    src={p.avatar_url}
                    seed={p.mem_id}
                    alt={p.mem_nm}
                    size={lede.people.length > 1 ? "sm" : "lg"}
                  />
                </button>
              ))}
              {lede.people.length > 1 && lede.moreCount > 0 && (
                <span className="ml-1.5 self-center font-numeric text-[11px] text-muted-foreground tabular-nums">
                  외 {lede.moreCount}
                </span>
              )}
            </div>

            {lede.figure && (
              <div className="ml-auto flex shrink-0 flex-col items-end">
                <span className="font-numeric text-[27px] font-medium leading-none text-foreground tabular-nums">
                  {lede.figure}
                </span>
                {lede.figureLabel && (
                  <span className="mt-1 text-[11px] text-muted-foreground">
                    {lede.figureLabel}
                  </span>
                )}
              </div>
            )}
          </div>
          )}

          {/* 공통 응원 버튼 — 활동지수(profile)·새 얼굴(newbie)·대회(raceRoster)·완주기록(raceRecord)
              슬롯은 자체 렌더에서 이미 응원 버튼을 그렸으므로 여기선 건너뛴다(중복 방지). */}
          {lede.entity && !lede.profile && !lede.newbie && !lede.raceRoster && !lede.raceRecord && (
            <div className="pt-1">
              <StoryReactionButton
                entityType={lede.entity.type}
                entityId={lede.entity.id}
                rctnCd={lede.entity.rctnCd}
                initialCount={lede.entity.count}
                initialMyCount={lede.entity.myCount}
                onInteract={pauseThenResume}
              />
            </div>
          )}
        </article>
      </div>

      {total > 1 && (
        <div className="flex items-center gap-2 pt-5">
          {/* 진행 표시 — 회색 홈 위로 검정이 차오른다. 다 차는 순간 다음 기사로 넘어가므로
              막대가 곧 "언제 넘어가는지"를 미리 알려주는 시계다(점만 찍으면 위치만 알고
              남은 시간은 모른다). 지나간 칸은 가득 채워 어디까지 봤는지 남긴다. */}
          {ledes.map((l, i) => (
            <button
              key={l.key}
              type="button"
              onClick={() => {
                pauseThenResume();
                setActive(i);
              }}
              aria-label={`${i + 1}번째 기사 보기`}
              aria-current={i === active}
              className="group flex-1 py-2 focus-visible:outline-none"
            >
              {/* 상태는 딱 둘 — 현재 칸(검정) / 나머지(연한 회색).
                  "이미 본 칸"을 중간 회색으로 따로 두면, 사람이 뒤로 스와이프한 순간
                  진하기 순서가 뒤엉켜 어디가 현재인지 되레 흐려진다.

                  현재 칸의 검정은 절반에서 시작해 4초에 걸쳐 가득 찬다. 절반이 "지금 여기",
                  자라는 나머지가 "언제 넘어가나"다 — 막대 하나가 둘을 겸한다. */}
              <span className="relative block h-1 w-full overflow-hidden rounded-full bg-border transition-colors group-hover:bg-muted-foreground/40">
                {i === active && (
                  /* key에 active·runId를 함께 묶어야 (장이 바뀔 때 / 멈췄다 재개할 때)
                     요소가 새로 생겨 애니메이션이 절반부터 다시 돈다 — 안 그러면 게이지가
                     다 찬 채로 멈춰 있다.
                     자동전환을 끈 동안에는 시간이 흐르지 않으므로 채우지 않고 절반에
                     세워 둔다 — 현재 칸 표시는 유지하되 "곧 넘어간다"는 거짓 신호를 뺀다. */
                  <span
                    key={`${active}-${runId}`}
                    data-paused={frozen}
                    style={{ "--lede-dur": `${ROTATE_MS}ms` } as CSSProperties}
                    className={cn(
                      "absolute inset-0 origin-left rounded-full bg-foreground",
                      autoOff ? "scale-x-50" : "lede-progress",
                    )}
                  />
                )}
              </span>
            </button>
          ))}
        </div>
      )}

      <span className="sr-only" role="status">
        {total}건 중 {active + 1}번째 기사
      </span>
    </div>

    {/* 테스트용 임시 토글 — 자동 전환을 껐다 켠다. **개발 모드에서만** 뜬다
        (`NEXT_PUBLIC_ENABLE_DEV_MODE`) — 운영 지면엔 노출하지 않는다. 검수 끝나면 이 블록만 지운다.
        프레임(전광판) **밖**에 둔다 — 어차피 지울 임시 UI라 프레임 안 높이 계산에 끼면 안 된다. */}
    {isDevModeEnabled() && (
      <div className="flex justify-end pt-1">
        <button
          type="button"
          onClick={toggleAuto}
          aria-pressed={autoOff}
          className="rounded-full border border-border px-2.5 py-1 font-numeric text-[10px] tracking-wide text-muted-foreground transition-colors active:scale-95 hover:bg-muted"
        >
          자동전환 {autoOff ? "OFF" : "ON"} (테스트)
        </button>
      </div>
    )}
    </section>
  );
}
