"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";

import { dayjs, formatPace, secondsToTime } from "@/lib/dayjs";
import {
  getJoinPurposeLabelsFromCds,
  getRaceDday,
  getRecordLabel,
  getRunningProfileRows,
} from "@/lib/member-card";
import { cn } from "@/lib/utils";

import { Avatar, buildFallbackAvatarUrl } from "@/components/common/avatar";
import { TitleBadge } from "@/components/common/title-badge";
import { PurposeChip } from "@/components/members/profile-chip";
import {
  PersonProfile,
  type PersonProfilePart,
  type PersonProfilePerson,
} from "@/components/story/person-profile";
import { StoryReactionButton } from "@/components/story/story-reaction-button";

import { compEvtTypeKm, compEvtTypeLabel } from "@/lib/comp-evt-type";
import { dedupePledgesByMember } from "@/lib/story-pledge";
import { pickActvLeadIndex, pickRandomPostIndex } from "@/lib/story-post";
import { reactionKey } from "@/lib/story-reaction";
import { getSportEmoji } from "@/lib/sport";

import type { CSSProperties, PointerEvent } from "react";
import type {
  RctnCd,
  StoryEntityType,
  StoryFeed,
  StoryReactionCounts,
} from "@/lib/queries/story-feed";
import type { StoryPost } from "@/lib/queries/story-posts";

/**
 * 목표 한마디 리드 슬롯(§⑤) 잠정 중단 토글.
 *
 * **삭제가 아니라 잠정 중단이다** — 2026-07-28 UI 정리로 화면에서만 내렸다. 되살리려면
 * 이 상수를 true로 되돌리면 된다(슬롯 생성 블록·ORDER 편입이 다시 살아난다).
 *
 * 성능: false일 때 §⑤ 블록 자체가 실행되지 않아 dedupePledgesByMember 계산도 돌지 않는다.
 * 데이터(feed.pledges)는 get_team_story_feed RPC에 CTE로 묶여 어차피 오므로 추가 비용은 없다
 * — 여기선 그걸 슬롯으로 만들지 않을 뿐이다. 하단 PledgeSigns 존도 함께 중단(§story-client).
 */
const SHOW_PLEDGE_LEDE = false;

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
  /**
   * 이 슬롯의 **주인공** — 상단에 26px 헤드라인을 세울지 여기서 선언한다.
   *
   * · `headline` 글이 주인공(대회·새얼굴·활동지수·목표) → 헤드라인을 body 맨 위에
   * · `photo`    사진이 주인공(운동기록) → 헤드라인 없이 사진이 위를 차지한다
   * · `figure`   수치가 주인공(완주기록) → 헤드라인 없이 기록이 가운데 선다
   *
   * 슬롯마다 "헤드라인이 있나 없나"를 렌더에서 `!lede.photo && !lede.profile && …`로
   * 되묻던 걸 대신한다 — 조건이 세 군데 흩어져 슬롯을 하나 더할 때마다 전부 고쳐야 했다.
   */
  hero: "headline" | "photo" | "figure";
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
   */
  profile?: {
    person: PersonProfilePerson;
    parts: PersonProfilePart[];
  } | null;
  /**
   * 새 얼굴 슬롯 전용(§②) — 스케치대로의 전용 레이아웃을 그린다.
   * 왼쪽(아바타 + 이름 + new 배지) ↔ 오른쪽(러닝프로필 칩 세로 스택),
   * 아래에 소개 한마디 → 가입목적 칩 ↔ 환영(응원) 버튼.
   * 신입은 칭호가 없어 칭호 자리에 `new` 배지가 들어간다.
   */
  newbie?: {
    person: Person;
    /**
     * 러닝 프로필 라벨-값 행(평균 페이스·평균 거리·가까운 역) — 오른쪽에 세로로 세운다.
     * 아이콘 칩이 아니라 **항목 이름을 글자로** 쓴다: 처음 보는 사람을 소개하는 칸이라
     * `⏱ 6'00"`만 있으면 그게 평균인지 최고기록인지 알 수 없다(상세 카드와 같은 라벨).
     */
    rows: { label: string; value: string }[];
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
   * 완주기록 슬롯 전용(§③) — **한 사람의 완주 하나**를 크게 세운다.
   *
   * 예정 대회의 명단 형태(`raceRoster`)를 잠깐 같이 썼다가 되돌렸다: 명단은 여러 명을
   * 훑는 옷이라, 한 명을 담으면 한 줄만 찍히고 나머지가 통째로 빈다. 주인공이 다르면
   * (명단 ↔ 한 사람) 레이아웃도 달라야 한다.
   */
  raceRecord?: {
    person: PersonProfilePerson;
    /**
     * 결과표 칸들 — 마라톤 기록증에 실리는 것과 같은 항목(종목·거리·페이스).
     * 완주시간은 footer(대회 대표 숫자 자리)가 맡으므로 여기 넣지 않는다.
     * 거리를 모르는 종목(철인3종·사이클 등)은 거리·페이스 칸이 빠진 채로 온다.
     */
    stats: { label: string; value: string }[];
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
      hero: "headline",
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
      hero: "headline",
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
        rows: getRunningProfileRows(newbieLead.running_profile ?? null),
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
      // **대회명이 헤드라인이다.** 예전엔 hero가 "figure"라 대회명이 footer 11px 회색 줄에
      // 날짜와 함께 묻혀 "무슨 대회를 뛰었는지"가 안 보였다 — 완주 소식에서 가장 먼저
      // 궁금한 건 기록 숫자가 아니라 어느 대회냐다. "다가오는 대회"와 같은 자리에 세워
      // 두 대회 슬롯이 같은 방식으로 읽히게 한다.
      hero: "headline",
      // 응원은 이 완주 기록에 건다(record는 ReactableItem — rctn_cd "fire").
      entity: buildEntity("record", rec.entity_id, rec.rctn_cd, rec.rctn_count),
      people: [],
      moreCount: 0,
      headline: rec.race_nm ?? "",
      // 대회 슬롯("9월 5일, 기강인 3명이 출발선에 선다")과 같은 형태의 리드문.
      //
      // **이름을 넣지 않는다.** 바로 아래 본문이 얼굴·이름을 크게 세우는데 리드문까지
      // 이름을 부르면 한 화면에서 같은 사람을 두 번 소개하게 된다(대회 슬롯도 리드문은
      // "3명"까지만 말하고 이름은 명단에 맡긴다). 여기선 날짜·종목만 맡고 "누가"는
      // 얼굴이 답한다 — 한 줄이 한 가지만 말하게.
      // 리드문은 **고생과 축하를 함께** 싣는다. "7월 1일에 완주했다"는 사실 보고라 축하도
      // 존경도 없었다 — 완주 소식을 크루가 보는 자리이니 지면이 먼저 그 값을 알아줘야 한다.
      // `버텨낸`이 대가를(존경), `값진`이 그 결과의 무게를(축하) 맡는다. 대회 슬롯의
      // "출발선에 선다"가 설렘을 싣는 것과 짝이다.
      //
      // 명사로 닫는다 — 서술체(`…했다`)로 끝내면 사실 보고로 되돌아간다.
      // 거리·종목은 넣지 않는다: 아래 결과표가 이미 말하고, 종목이 곧 거리라 겹친다.
      // 285px에서 1줄에 들어가는 길이로 맞췄다 — 2줄이 되면 슬롯 예산(§높이 주석)을 넘는다.
      standfirst: rec.race_dt
        ? `${dayjs(rec.race_dt).format("M월 D일")}, 끝까지 버텨낸 값진 완주`
        : "끝까지 버텨낸 값진 완주",
      // **완주시간이 D-day의 자리에 온다.** 예정 대회는 "얼마 남았나"(D-39), 완주는
      // "얼마 걸렸나"(3:54:15) — 둘 다 그 대회의 대표 숫자라 같은 칸(footer 왼쪽)에 둔다.
      figure: secondsToTime(rec.rec_time_sec),
      figureLabel: null,
      // 본문은 **한 사람**이다. 예정 대회의 명단 형태를 잠깐 같이 썼다가 되돌렸다 —
      // 명단은 여럿을 훑는 옷이라 한 명만 담으면 한 줄 찍히고 나머지가 통째로 빈다.
      raceRecord: {
        person: {
          mem_id: rec.mem_id,
          mem_nm: rec.mem_nm,
          avatar_url: rec.avatar_url,
          badge_effect: rec.badge_effect,
          frame_cd: rec.frame_cd,
          primary_title: rec.primary_title,
        },
        // 종목 · 페이스. **거리는 넣지 않는다** — 러너에게 "풀코스"는 곧 42.195km라
        // 종목이 이미 말한 걸 한 번 더 쓰는 칸이 된다(`55K`처럼 숫자가 라벨인 종목은
        // 아예 같은 글자다). 페이스만 종목에서 못 읽는 값이라 남긴다.
        //
        // 페이스는 저장값이 아니라 계산이다(종목 코드 → 공식 거리, 총시간 ÷ 거리).
        // 거리를 모르면(철인3종·자유입력 종목) 그 칸 없이 종목만 남는다 —
        // 철인3종은 총시간을 총거리로 나눠도 세 종목이 섞여 의미가 없다.
        stats: (() => {
          const rows = [
            {
              label: "종목",
              value: getRecordLabel({
                sport: rec.sport,
                evt: rec.evt,
                rec_time_sec: rec.rec_time_sec,
                race_nm: rec.race_nm,
                race_dt: rec.race_dt,
              }),
            },
          ];
          const isRun = /run|ultra|trail/i.test(rec.sport ?? "");
          const pace = isRun
            ? formatPace(rec.rec_time_sec, compEvtTypeKm(rec.evt))
            : null;
          if (pace) rows.push({ label: "페이스", value: `${pace}/km` });
          return rows;
        })(),
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
      hero: "headline",
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
          mth_attd_cnt: lead.mth_attd_cnt,
          mth_rec_cnt: lead.mth_rec_cnt,
        },
        // 칭호(이름 옆) → 소개 한마디. 개인 최고기록은 **부품에서 뺐다** — 이 슬롯의 주어는
        // "이번 달 얼마나 활동했나"인데 역대 PB가 오른쪽에서 제일 큰 숫자로 서 있으면
        // 주어가 뒤바뀐다. PB는 footer의 한 줄 사실로 내려보낸다(§footNote).
        // 러닝 프로필도 빼둔다 — 페이스·역은 "누구인지 모르는 새 얼굴"을 소개할 때 쓴다.
        parts: ["title", "intro"],
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
  // SHOW_PLEDGE_LEDE=false면 이 슬롯을 통째로 건너뛴다(잠정 중단 — 파일 상단 상수 주석 참조).
  const pledgePool = SHOW_PLEDGE_LEDE ? dedupePledgesByMember(feed.pledges) : [];
  const pledgeLead = pledgePool[pledgePick % Math.max(pledgePool.length, 1)];
  if (SHOW_PLEDGE_LEDE && pledgeLead) {
    ledes.push({
      key: `pledge-${pledgeLead.pldg_id}`,
      kicker: "여러분께 고합니다",
      hero: "headline",
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
      hero: "photo",
      // 기록 자랑도 응원을 받는다(🔥 대박) — 사진까지 올려 내놓은 기록이라 응원받기 가장
      // 자연스러운 자리인데, 예전엔 이 슬롯만 응원이 없어 3밴드 footer 오른쪽이 비었다.
      // 피드 캐시엔 이 응원 수가 없어(post는 story-posts로 갈려 있다) 하한 0에서 시작하고
      // 최신 집계(reactions.totals/mine)를 buildEntity가 얹는다 — actv 슬롯과 같은 방식.
      entity: buildEntity("post", post.post_id, "fire", 0),
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

  /** 게이지가 멈춰야 하는가 — 손이 닿았거나 · 탭이 숨었거나 */
  const frozen = paused || hidden;

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
        <p className="text-[19px] text-foreground">
          오늘은 전할 소식이 없습니다
        </p>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          모임에 나가거나 기록을 남기면 이 자리에 실립니다.
        </p>
      </div>
    );
  }

  const lede = ledes[active];

  /**
   * 새 얼굴인데 러닝 프로필·소개·가입목적이 **모두** 비었나.
   *
   * 가입 직후라 아무것도 안 채운 사람은 이름과 NEW 배지만 남아 슬롯이 텅 빈다.
   * 그 경우에만 안내 문구로 자리를 채운다(하나라도 있으면 그걸 보여주는 게 낫다).
   */
  const newbieBlank =
    lede.newbie != null &&
    lede.newbie.rows.length === 0 &&
    !lede.newbie.intro &&
    !lede.newbie.purposeTxt &&
    lede.newbie.purposes.length === 0;

  /**
   * footer 왼쪽 — 이 슬롯의 **한 줄 사실** 하나.
   *
   * 슬롯마다 성격이 달라 무엇을 싣는지는 여기서 갈리지만, 자리와 높이는 하나다:
   * **그 대회의 대표 숫자**(예정=D-39 / 완주=3:54:15) · 날짜·종목·거리(운동기록).
   * 활동지수·목표 한마디·새 얼굴은 실을 사실이 없어 비운다(오른쪽 응원만 남는다).
   * 한 줄을 넘기지 않는다 — footer 높이가 흔들리면 body가 따라 흔들린다.
   */
  const footNote = lede.figure ? (
    // 예정 대회의 D-day와 완주 기록의 완주시간이 **같은 칸을 나눠 쓴다** — 둘 다
    // "이 대회의 숫자"라서. 본문 구성(명단 ↔ 한 사람)은 달라도 이 칸은 같은 자리에 남는다.
    // tabular-nums로 자릿수가 흔들리지 않게 한다.
    <span className="font-numeric text-[24px] font-medium leading-none tracking-[0.04em] text-foreground tabular-nums">
      {lede.figure}
    </span>
  ) : lede.photo ? (
    <span className="truncate font-numeric text-[12px] text-muted-foreground tabular-nums">
      {lede.standfirst}
    </span>
  ) : null;
  // 활동지수 슬롯은 footer 왼쪽을 비운다 — PB는 이름·순위와 같은 "이 사람 소개" 덩어리라
  // 떼어 footer에 두면 어디에 딸린 수치인지 흐려진다. 순위 배지 아래에 붙인다(§PersonProfile).
  // 새 얼굴 슬롯은 footer 왼쪽을 비운다 — 가입목적은 폭이 필요해 body로 올렸다(§newbie 렌더).

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
      {/* 슬롯은 **kicker / body / footer 3밴드**로 고정한다.

          예전엔 슬롯마다 자기 레이아웃을 통째로 그리고 응원 버튼도 각자 자리에 박아서
          (새얼굴=가입목적 옆, 완주기록=날짜 옆, 대회=D-day 옆, 활동지수=프로필 안쪽)
          바닥에서 15~71px까지 흩어져 있었다 — 4초마다 넘어가는 지면에서 응원하려면
          손가락을 매번 옮겨야 했다. 밴드를 고정하면 그 자리가 하나로 모인다.

          **높이 264px는 "헤드라인 2줄"을 거의 견디는 값이다.** 지금 데이터는 대부분 1줄이라
          26~56px이 남아 보이지만, 그 여백은 낭비가 아니라 2줄분 예약이다 — 1줄에 맞춰
          깎으면 긴 대회명·긴 멘트가 들어오는 날 그 슬롯만 잘린다.

          바닥을 정하는 건 **새 얼굴 슬롯**이다: 프로필을 다 채운 신입(러닝프로필 3행 +
          소개 한마디 + 가입목적)에 헤드라인이 2줄로 겹치면 3px쯤 모자란다 — 그때만
          가입목적 칩 줄이 눌리고, 다른 슬롯(활동지수 14 · 완주기록 26 · 운동기록 42)은
          남는다. 대회는 명단이 스크롤이라 하한에 안 걸린다. 두 악조건이 동시에 겹치는
          경우가 드물어 268 대신 264를 택했다 — 평소 4px을 돌려받는 쪽.

          ⚠️ **측정은 반드시 375px 뷰포트에서** 한다. 창을 줄이는 방식은 브라우저 최소 폭
          (500px)에 걸려 더 넓은 화면을 재게 되고, 그러면 헤드라인이 1줄로 접혀 "여유가 있다"는
          잘못된 결론이 나온다(실제로 260px까지 내렸다가 되돌렸다). 기기 에뮬레이션을 쓸 것. */}
      <div
        key={lede.key}
        className="lede-in flex h-[264px] flex-col gap-3 overflow-hidden"
      >
        {/* ── 밴드 1 · kicker — 항상 맨 위 ───────────────────────── */}
        <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
          {lede.kicker}
        </span>

        {/* ── 밴드 2 · body — 남는 높이를 전부 흡수한다 ────────────
            헤드라인이 1줄이든 2줄이든 늘고 준 만큼 여기서 소화되므로,
            아래 footer는 움직이지 않는다(예약 높이를 정할 필요가 없는 이유). */}
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          {lede.hero === "headline" && lede.headline && (
            // 크기·자르기는 .lede-headline 한 곳(globals.css)에서 정한다.
            // -mt-1은 26px 글자의 line-box 윗 여백 트림 — kicker와의 간격을 눈에 맞춘다.
            <h2 className="lede-headline -mt-1 text-pretty break-keep text-[26px] font-normal leading-[1.28] text-foreground">
              {lede.headline}
            </h2>
          )}

          {/* 리드문 — **헤드라인과 한 덩어리로 위에 고정한다.**
              슬롯별 몸통 안에서 그리면 아래 `justify-center`에 함께 밀려, 내용이 짧은 슬롯
              (완주기록 97px)은 리드문이 내려앉고 꽉 찬 슬롯(대회 149px)은 위에 붙어
              같은 성격의 한 줄이 슬롯마다 다른 높이에 놓인다. 위 밴드로 올리면 헤드라인
              바로 아래라는 자리가 고정된다.

              `hero === "headline"`으로 거른다 — 운동기록은 `standfirst`에 날짜·거리를 담아
              footer에서 쓰므로(§footNote) 여기서 그리면 같은 값이 두 번 나온다. */}
          {lede.hero === "headline" && lede.standfirst && (
            <p className="break-keep text-[13px] leading-relaxed text-muted-foreground">
              {lede.standfirst}
            </p>
          )}

          {/* 슬롯별 몸통 — 분기는 이 한 곳에만 둔다. 예전엔 "이 줄은 건너뛴다"는
              조건(!lede.photo && !lede.profile && …)이 세 군데에 흩어져 있어
              슬롯을 하나 더할 때마다 전부 고쳐야 했다.

              남는 높이 안에서 **세로 가운데**에 앉힌다. 위로 붙이면 내용이 짧은 슬롯
              (소개 한마디가 없는 새 얼굴 등)에서 헤드라인과 footer 사이가 통째로 비어 보인다. */}
          <div className="flex min-h-0 flex-1 flex-col justify-center gap-3">
          {lede.photo ? (
            /* 운동 기록(§⑥) — 사진이 주인공. 사진(좌) ↔ 한마디(위)·올린 사람(아래).
               사진은 눌러도 반응하지 않는다(프로필은 이름을 눌러 연다).

               **사람은 사진 옆 칸 바닥에 붙인다**(`mt-auto`) — 사진 아래 별도 줄로 빼면
               그 줄 높이(+간격)만큼 슬롯이 통째로 길어지는데, 정작 사진 옆은 한마디가 짧을 때
               비어 있다. 바닥에 붙이면 사진 끝단과 이름 바닥이 한 선에서 맞아 덩어리가 닫히고,
               그만큼 지면을 돌려받는다. 칭호는 뺐다 — 사진·한마디·이름이 이미 서 있는 칸에서
               배지까지 더하면 조연이 넷이 된다(칭호는 프로필 카드에서 볼 수 있다). */
            <div className="flex min-h-0 items-start gap-3">
              <div className="relative h-36 w-36 shrink-0 overflow-hidden rounded-xl bg-muted">
                {/* 사진 → 프사 → DiceBear 폴백. 빈 문자열("")도 내려가게 ??가 아닌 || 사슬 */}
                <Image
                  src={
                    lede.photo.url ||
                    lede.photo.person.avatar_url ||
                    buildFallbackAvatarUrl(lede.photo.person.mem_id)
                  }
                  alt={lede.photo.person.mem_nm}
                  fill
                  sizes="45vw"
                  unoptimized
                  className="object-cover"
                />
              </div>
              {/* **높이를 사진과 같게 못박는다**(h-36). 이 칸이 본문 높이만큼 늘어나면
                  바닥에 붙인 이름이 사진 끝단보다 아래로 내려가 두 줄이 어긋난다.
                  덩어리가 정확히 144px로 닫히면 아래 남는 여백은 본문이 통째로
                  세로 가운데에 앉히므로 위아래가 고르게 나뉜다. */}
              <div className="flex h-36 min-w-0 flex-1 flex-col">
                {/* 한마디 — 사진 옆이라 헤드라인(26px)보다 작게. 사진 높이만큼 줄을 쓴다 */}
                <p className="line-clamp-4 min-w-0 text-pretty break-keep text-[15px] leading-[1.5] text-foreground [overflow-wrap:anywhere]">
                  {lede.headline}
                </p>
                <button
                  type="button"
                  onClick={() =>
                    onSelectMember(
                      lede.photo!.person.mem_id,
                      lede.photo!.person.mem_nm,
                    )
                  }
                  aria-label={`${lede.photo.person.mem_nm} 프로필 보기`}
                  className="mt-auto flex min-w-0 items-center gap-1.5 self-start rounded-full pt-2 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
                >
                  <Avatar
                    src={lede.photo.person.avatar_url}
                    seed={lede.photo.person.mem_id}
                    alt={lede.photo.person.mem_nm}
                    size="xs"
                  />
                  <span className="truncate text-[12px] font-bold text-foreground">
                    {lede.photo.person.mem_nm}
                  </span>
                </button>
              </div>
            </div>
          ) : lede.newbie ? (
            /* 새 얼굴(§②) — 왼쪽 인물(아바타·이름·new) ↔ 오른쪽 러닝프로필 칩, 아래 소개 한마디.
               신입은 칭호가 없어 칭호 자리에 new 배지가 들어간다. 가입목적은 footer로 내렸다. */
            <>
              <div className="flex items-start gap-4">
                <button
                  type="button"
                  onClick={() =>
                    onSelectMember(
                      lede.newbie!.person.mem_id,
                      lede.newbie!.person.mem_nm,
                    )
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
                  <div className="flex min-w-0 flex-col items-center gap-1">
                    <span className="truncate text-[17px] font-bold text-foreground">
                      {lede.newbie.person.mem_nm}
                    </span>
                    <span className="shrink-0 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none tracking-wide text-destructive">
                      new
                    </span>
                  </div>
                </button>

                {/* 러닝 프로필 — 상세 카드와 같은 도트리더 행(라벨 ···· 값).
                    폭이 좁아(≈145px) 점선은 min-w-2까지 줄어들되, 라벨과 값이
                    양끝에 붙어 "무엇이 얼마인지"가 눈으로 이어진다.

                    **한쪽만 비는 경우**(러닝 프로필만 없음)엔 자리를 비우지 않고 그 사실을
                    한 줄로 적는다. 그냥 비우면 오른쪽이 휑해 레이아웃이 깨진 것처럼 보이고,
                    읽는 사람도 "로딩 중인가" 하고 기다리게 된다. 전부 빈 사람은 아래
                    안내문이 따로 받으므로(newbieBlank) 여기선 그리지 않는다. */}
                {lede.newbie.rows.length > 0 ? (
                  <ul className="flex w-[150px] shrink-0 flex-col gap-1">
                    {lede.newbie.rows.map((row) => (
                      <li key={row.label} className="flex items-baseline gap-1.5">
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {row.label}
                        </span>
                        <span
                          aria-hidden
                          className="min-w-2 flex-1 -translate-y-0.5 border-b border-dashed border-border"
                        />
                        <span className="shrink-0 font-numeric text-[11px] text-foreground tabular-nums">
                          {row.value}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  !newbieBlank && (
                    <span className="w-[150px] shrink-0 text-right text-[11px] leading-relaxed text-muted-foreground/70">
                      러닝 프로필은
                      <br />
                      아직 비어 있어요
                    </span>
                  )
                )}
              </div>

              {lede.newbie.intro ? (
                <blockquote className="truncate rounded-r-md border-l-2 border-border bg-muted/50 py-1.5 pl-2.5 pr-2 text-[13.5px] leading-relaxed text-foreground">
                  “{lede.newbie.intro}”
                </blockquote>
              ) : null}

              {/* 가입목적 — footer가 아니라 여기(body 전체 폭)에 둔다.
                  footer는 응원 버튼을 빼면 값이 쓸 폭이 375px 기준 118px뿐이라, 직접 쓴
                  한마디("폼부터 잡아드려요, 편하게 물어보세요" = 189px)가 절반에서 잘리고
                  칩까지 밀려났다. 본문은 285px이라 안 잘린다.
                  라벨을 **윗줄**에 세우고 내용을 아랫줄에 놓아, 칩이든 한마디든 "무엇에 대한
                  답인지"가 먼저 읽히게 한다. 한마디와 칩은 **둘 다** 보여준다 — 실제로 직접
                  쓴 사람은 칩도 함께 고른다(고른 것과 쓴 것은 다른 정보다). */}
              {!newbieBlank && (
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-[11px] font-medium text-muted-foreground">
                    가입목적
                  </span>
                  {lede.newbie.purposeTxt && (
                    <span className="truncate text-[13px] leading-relaxed text-foreground">
                      “{lede.newbie.purposeTxt}”
                    </span>
                  )}
                  {lede.newbie.purposes.length > 0 && (
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      {lede.newbie.purposes.map((label) => (
                        <PurposeChip key={label} label={label} />
                      ))}
                    </div>
                  )}
                  {/* 가입목적만 없는 경우 — 라벨은 세워두고 값 자리에 그 사실을 적는다.
                      블록을 통째로 지우면 소개 한마디와 footer 사이가 벌어져 슬롯이
                      균형을 잃는다. */}
                  {!lede.newbie.purposeTxt &&
                    lede.newbie.purposes.length === 0 && (
                      <span className="text-[13px] leading-relaxed text-muted-foreground/70">
                        아직 적지 않았어요
                      </span>
                    )}
                </div>
              )}

              {!lede.newbie.intro &&
                newbieBlank && (
                  // 가입 직후라 아무것도 안 채운 사람 — 이름과 NEW만 남아 슬롯이 텅 빈다.
                  // **단정하지 않는다**: 프로필이 비었다는 건 "러닝 경험이 적다"의 증거가 아니다
                  // (빠른 러너가 폼만 안 채웠을 수도 있다). 그래서 "일지도 몰라요"로 여지를 두고,
                  // 크루가 할 일(먼저 인사)로 문장을 닫는다 — 빈 칸을 설명이 아니라 초대로 쓴다.
                  <p className="break-keep text-[13px] leading-relaxed text-muted-foreground">
                    러닝 프로필이 비어 있어요. 이제 막 달리기를 시작한
                    새내기일지도 몰라요 — 만나면 먼저 인사 건네주세요.
                  </p>
                )}
            </>
          ) : lede.profile ? (
            /* 활동지수(§④)·목표 한마디(§⑤) — 프로필 부품 조합.
               응원 버튼은 여기서 그리지 않는다(footer가 맡는다). */
            /* PB 블록은 걷어냈다 — 이 슬롯의 주어는 이번 달 활동(오른쪽 27px 수치)이고,
               그 아래 자리는 소개 한마디가 이미 쓰고 있다. 역대 PB까지 얹으면 "이번 달"
               이야기에 "역대" 이야기가 끼어들어 한 칸이 두 시간대를 말하게 된다. */
            <PersonProfile
              person={lede.profile.person}
              parts={lede.profile.parts}
              onSelect={onSelectMember}
            />
          ) : lede.raceRecord ? (
            /* 완주기록(§③) — **한 사람이 주인공.** 리드문 아래에 그 사람을 크게 세운다.
               얼굴을 키운 건 장식이 아니다: 이 슬롯이 전하는 건 기록 숫자가 아니라
               "우리 크루의 이 사람이 완주했다"는 소식이고, 숫자(완주시간)는 footer
               왼쪽에서 D-day와 같은 자리를 지킨다. 종목은 이름 아래 한 줄로 받는다. */
            <>
              {/* 리드문은 위 밴드가 그린다(§body) — 여기서 또 그리면 두 번 나온다 */}

              {/* 인물 ↔ 결과표를 **한 줄로** 마주 세운다.
                  결과표를 인물 아래 별도 단으로 두면 그 단 높이(+간격 20px)만큼 슬롯이
                  길어지는데, 정작 얼굴 오른쪽은 늘 비어 있었다. 옆으로 옮기면 빈 폭을 쓰고
                  세로를 60px 가까이 돌려받는다 — 다른 슬롯의 "인물 ↔ 수치"(활동지수의
                  참석·기록)와도 같은 배치가 된다. */}
              <div className="flex min-w-0 items-center gap-4">
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
                  {/* 아바타 lg(56) + 이름 17px + 칭호 xs — **PersonProfile(활동지수 슬롯)과
                      같은 치수**다. 같은 "사람 소개" 덩어리인데 슬롯마다 크기가 다르면
                      스와이프할 때 인물이 커졌다 작아졌다 한다. 크기를 맞추려면 한쪽을
                      골라야 해서, 공유 컴포넌트(PersonProfile) 쪽 값을 정본으로 삼았다. */}
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

                {/* 결과표 — 라벨 왼쪽, 값 오른쪽으로 세로 두 줄. 옆단이라 폭이 좁아
                    라벨을 값 위에 얹으면 칸이 두 배로 넓어진다(그러면 이름이 밀린다). */}
                <dl className="flex shrink-0 flex-col gap-1.5">
                  {lede.raceRecord.stats.map((s) => (
                    <div key={s.label} className="flex items-baseline gap-2">
                      <dt className="w-8 shrink-0 text-[11px] text-muted-foreground">
                        {s.label}
                      </dt>
                      <dd className="font-numeric text-[16px] font-medium text-foreground tabular-nums">
                        {s.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </>
          ) : lede.raceRoster ? (
            /* 대회(§①) — 참가자를 종목별로 묶어 나열. 명단이 길면 이 영역만 스크롤한다
               (헤드라인이 2줄로 늘면 그만큼 여기서 줄어든다 — 잘리지 않는다).
               D-day는 footer로 내렸다. */
            <div className="flex min-h-0 flex-1 flex-col gap-1.5">
              {/* 리드문은 위 밴드가 그린다(§body) — 여기서 또 그리면 두 번 나온다 */}
              {lede.raceRoster.length > 0 && (
                <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto pt-0.5 [scrollbar-width:thin]">
                  {lede.raceRoster.map((g) => (
                    <div key={g.evt} className="flex items-start gap-2.5 py-1">
                      {/* 스크린 존이 아니라 board-amber는 못 쓴다(DESIGN 규칙) —
                          primary로 종목을 도드라지게, 이름은 foreground로 둔다.
                          프사가 붙어 행이 높아졌으므로 라벨을 살짝 내려 첫 줄에 맞춘다. */}
                      <span className="mt-1 min-w-[42px] shrink-0 font-numeric text-[12px] font-bold text-primary tabular-nums">
                        {g.evt}
                      </span>
                      {/* 이름만 나열하면 누가 나가는지 훑어지지 않는다 — 얼굴이 붙어야
                          "아는 사람이 있네"가 한눈에 잡힌다. 넘치면 줄바꿈하고, 그래도
                          넘치면 이 영역만 세로로 스크롤된다(슬롯 높이는 그대로). */}
                      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        {g.people.map((p) => (
                          <button
                            key={p.mem_id}
                            type="button"
                            onClick={() => onSelectMember(p.mem_id, p.mem_nm)}
                            aria-label={`${p.mem_nm} 프로필 보기`}
                            className="flex shrink-0 items-center gap-1 rounded-full transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
                          >
                            <Avatar
                              src={p.avatar_url}
                              seed={p.mem_id}
                              alt={p.mem_nm}
                              size="xs"
                            />
                            <span className="text-[13px] leading-none text-foreground">
                              {p.mem_nm}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            lede.standfirst && (
              <p className="break-keep text-[13px] leading-relaxed text-muted-foreground">
                {lede.standfirst}
              </p>
            )
          )}
          </div>
        </div>

        {/* ── 밴드 3 · footer — 바닥 고정 ─────────────────────────
            왼쪽은 이 슬롯의 **한 줄 사실**(D-day·완주시간·날짜·거리·가입목적),
            오른쪽은 **응원**. 슬롯이 바뀌어도 응원 버튼은 같은 자리에 남는다.
            운동기록 슬롯만 entity가 없어 오른쪽이 빈다 — 응원을 붙일지는 별도 결정. */}
        <div className="flex shrink-0 items-center justify-between gap-3">
          <div className="min-w-0 flex-1">{footNote}</div>
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
                      "lede-progress",
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

    </section>
  );
}
