"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";

import { Zap } from "lucide-react";

import {
  dayjs,
  formatPace,
  parseEventTime,
  secondsToTime,
  todayStartKST,
} from "@/lib/dayjs";
import {
  getJoinPurposeLabelsFromCds,
  getRaceDday,
  getRecordLabel,
  getRunningProfileRows,
} from "@/lib/member-card";
import { cn } from "@/lib/utils";

import { Avatar } from "@/components/common/avatar";
import { TitleBadge, resolveDescVisible } from "@/components/common/title-badge";
import { PurposeChip } from "@/components/members/profile-chip";
import {
  PersonIntro,
  PersonProfile,
  type PersonProfilePart,
  type PersonProfilePerson,
} from "@/components/story/person-profile";
import { RecordReelViewer } from "@/components/story/record-reel-viewer";
import { StoryReactionButton } from "@/components/story/story-reaction-button";

import { goToLogin } from "@/lib/auth/go-to-login";
import { compEvtTypeKm, compEvtTypeLabel } from "@/lib/comp-evt-type";
import { dedupePledgesByMember } from "@/lib/story-pledge";
import { pickActvLeadIndex, pickRandomPostIndex } from "@/lib/story-post";
import { reactionKey } from "@/lib/story-reaction";
import {
  TITLE_OTHERS_MAX,
  buildTitleLeadPool,
  countTitleMoreMembers,
  pickTitleLead,
} from "@/lib/story-title";
import { getSportEmoji } from "@/lib/sport";

import type { CSSProperties, PointerEvent } from "react";
import type {
  RctnCd,
  StoryEntityType,
  StoryFeed,
  StoryReactionCounts,
} from "@/lib/queries/story-feed";
import type { StoryPost } from "@/lib/queries/story-posts";
import type { RecentTitleRow } from "@/lib/story-title";
import type { TitleDescVisibility } from "@/components/common/title-badge";

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
 * 이 화면에서 누른 응원 몫을 담아 두는 sessionStorage 키.
 *
 * 응원 총합은 30초 캐시라 누른 직후 새로고침하면 서버가 옛 값을 준다. 그 사이에도 내가
 * 누른 건 보여야 하므로 여기 담아 두고 서버값 위에 얹는다. 서버가 따라잡으면 버튼이
 * 알아서 걷어낸다(`bumped` prop — 이중 계산 방지). 탭을 닫으면 사라진다.
 */
const BUMP_STORE_KEY = "gigang:story:my-bumps";

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
   * · `headline` 글이 주인공(대회·완주기록·새얼굴·활동지수·목표) → 헤드라인을 body 맨 위에
   * · `photo`    사진이 주인공(운동기록) → 헤드라인 없이 사진이 위를 차지한다
   *
   * 슬롯마다 "헤드라인이 있나 없나"를 렌더에서 `!lede.photo && !lede.profile && …`로
   * 되묻던 걸 대신한다 — 조건이 세 군데 흩어져 슬롯을 하나 더할 때마다 전부 고쳐야 했다.
   */
  hero: "headline" | "photo";
  /**
   * 헤드라인이 가리키는 곳 — 있으면 헤드라인이 링크가 된다(대회 슬롯 2종의 대회명).
   *
   * 딥링크는 `/schedule?comp=<short_id ?? comp_id>` 형태다. `/races`엔 상세 페이지가 없고
   * 일정 페이지의 미니캘린더가 이 쿼리를 읽어 상세 다이얼로그를 여는 게 이 앱의 정본
   * 패턴이라(`member-card-detail`의 다가오는 대회도 같은 링크를 쓴다) 그대로 따른다.
   * 홈(`/`)이 아니라 `/schedule`인 이유는 lib/notifications/deep-link.ts 참조.
   */
  headlineHref?: string | null;
  entity: {
    // 활동지수 슬롯 응원까지 담으므로 좁은 유니온 대신 StoryEntityType("actv" 포함)을 쓴다.
    type: StoryEntityType;
    id: string;
    /** `entity_type:entity_id` — 내가 누른 몫(`myBumps`)을 슬롯 밖에 쌓을 때 쓰는 키 */
    key: string;
    rctnCd: RctnCd;
    count: number;
    /** 내가 이 항목에 누른 누적 횟수 — 점등·상한 판정용 */
    myCount: number;
  } | null;
  /**
   * 운동 기록 칸 전용 — 사진 URL(헤드라인 대신 사진을 크게 싣는다).
   * 이 슬롯에 오르는 기록은 사진이 있는 것뿐이라(`get_team_posts`가 걸러 준다) 폴백이 없다.
   * `title`은 올린 사람의 대표 호칭(있으면 이름 옆 배지) — 없으면 배지 생략.
   * `mileage`는 마일리지런에서 자동 유입된 기록 — 사진 위 ⚡ 배지로 출처를 알린다.
   */
  photo?: {
    url: string | null;
    person: Person;
    mileage?: boolean;
    title: { ttl_nm: string; badge_effect: string } | null;
    /** 이 사진의 기록 id — 사진을 누르면 릴스 뷰어를 이 장부터 연다 */
    postId: string;
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
    /** 한마디를 안 쓴 사람의 빈 자리에 대신 세울 기록 한 줄 */
    introFallback?: string | null;
    /**
     * 결과표 칸들 — 마라톤 기록증에 실리는 것과 같은 항목(종목·거리·페이스).
     * 완주시간은 footer(대회 대표 숫자 자리)가 맡으므로 여기 넣지 않는다.
     * 거리를 모르는 종목(철인3종·사이클 등)은 거리·페이스 칸이 빠진 채로 온다.
     */
    stats: { label: string; value: string }[];
  } | null;
  /**
   * 칭호획득 슬롯 전용(§⑦ v2) — 최근 30일 획득자 중 **사람 대표 1명**(한 바퀴마다 +1 회전)
   * + 나머지 획득자 얼굴+이름 칩 명단. v1(칭호별 묶음 나열)은 실데이터에서 칭호당 1~2명이
   * 대부분이라 줄 오른쪽이 텅 비고, 아바타뿐이라 익명이었다
   * (docs/superpowers/specs/2026-08-12-칭호획득-슬롯-사람대표-design.md).
   */
  titleLead?: {
    lead: {
      person: Person;
      /** 대표가 새로 딴 칭호 — 배지는 effect null(이펙트는 사람 소유, v1 결정 유지) */
      ttl_nm: string;
      /**
       * 대표 오른쪽 글상자에 세울 칭호 설명 — `desc_visibility` 게이트를 통과했을 때만
       * 채워 온다(아니면 null → 상자째 생략). 배지 툴팁과 **같은 판정**을 쓴다.
       */
      desc: string | null;
      /** 배지 탭 툴팁 — 원본 그대로 넘긴다(게이트 판정은 TitleBadge 안에서 한 번 더) */
      tooltip: {
        desc: string | null;
        visibility: TitleDescVisibility;
        isHeld: boolean;
      };
    };
    /** 대표를 뺀 나머지 획득자 — 최신순 고정(사람 dedupe 후), `TITLE_OTHERS_MAX`까지 */
    others: Person[];
    /** 명단에 못 실은 획득자 수 — `외 N명`. 0이면 안 그린다 */
    moreCount: number;
    /** 30일 내 총 수여 건수 — footer 왼쪽 사실 한 줄 */
    totalGrantCnt: number;
  } | null;
};


/** 오늘 기준 N일 이내인가 (KST) — 양쪽 다 KST로 맞춘다(§lib/dayjs nowKST) */
function withinDays(dateStr: string | null, days: number): boolean {
  if (!dateStr) return false;
  const diff = todayStartKST().diff(parseEventTime(dateStr).startOf("day"), "day");
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
  /** 칭호획득 — 최근 30일 수여를 칭호별 묶음으로(§⑦) */
  grants: RecentTitleRow[],
  /** 칭호획득 대표 회전 오프셋(§⑦) — 한 바퀴마다 +1 전진(lib/story-title.ts의 pickTitleLead) */
  titlePick: number,
  /** 로그인 멤버 id — 칭호획득 슬롯의 isHeld 근사 판정에 쓴다(§⑦). 비로그인이면 null */
  myMemId: string | null,
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
      // 이 화면에서 누른 몫을 슬롯 밖에 쌓아 둘 때 쓰는 키(`myBumps`) — 여기서 한 번만
      // 만들어 넘긴다. 렌더 쪽에서 다시 조립하면 규칙이 두 곳으로 갈린다.
      key,
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
      // 대회명을 누르면 상세로 — short_id가 있으면 그걸 쓴다(공유 링크와 같은 형태).
      headlineHref: `/schedule?comp=${race.short_id ?? race.comp_id}`,
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
    // 공유 링크와 같은 형태로 short_id 우선. 둘 다 없으면(구버전 RPC) 링크를 걸지 않는다.
    const recCompRef = rec.short_id ?? rec.comp_id ?? null;
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
      // 대회명 → 상세. 구버전 RPC(배포 스큐)면 comp_id가 없어 링크 없이 이름만 나온다.
      headlineHref: recCompRef ? `/schedule?comp=${recCompRef}` : null,
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
          intro_txt: rec.intro_txt,
          primary_title: rec.primary_title,
        },
        // 한마디를 안 쓴 사람의 빈 자리 문구. 기본값("고수는 말이 필요 없는 법")과 같은 결의
        // 농담이되 **이 슬롯에 맞춘 말**이다 — 완주 기록을 보는 자리라, 말수가 적은 게 아니라
        // 기록으로 말하는 사람이라는 쪽이 그 자리에 어울린다.
        introFallback: "말보단 기록으로 보여주는 편",
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
      // 부품은 **상위 3명에게만** RPC가 실어 준다(§story-feed.ts StoryActvRankEntry).
      // 위 `leadIdx`가 상위 3명 안에서만 고르므로 여기 값들은 항상 채워져 있다 —
      // 추첨 범위를 넓히려면 RPC의 `rn <= 3`도 함께 넓혀야 한다.
      profile: {
        person: {
          mem_id: lead.mem_id,
          mem_nm: lead.mem_nm,
          avatar_url: lead.avatar_url,
          badge_effect: lead.badge_effect,
          intro_txt: lead.intro_txt,
          primary_title: lead.primary_title,
          mth_attd_cnt: lead.mth_attd_cnt,
          mth_rec_cnt: lead.mth_rec_cnt,
        },
        // 칭호(이름 옆) → 소개 한마디. **개인 최고기록(PB)은 아예 뺐다** — 이 슬롯의 주어는
        // "이번 달 얼마나 활동했나"(오른쪽 참석·기록 27px)인데, 역대 PB를 어디에 두든
        // 그 옆에서 다른 시간대를 말해 주어가 흐려진다. PB는 프로필 카드에서 본다.
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
  //    사진은 항상 있다 — 사진 없는 기록은 `get_team_posts`가 안 내려준다(프사 폴백 없앰).
  //    postPick은 호출자가 굴린다(서버·클라 일치).
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
      //
      // **응원 대상은 글이 아니라 그 기록을 올린 사람이다** — 활동지수·목표 한마디 슬롯과
      // 같은 멤버 기준 카운터(`actv` + mem_id)를 쓴다. 예전엔 `post` + post_id(글 단위)였는데,
      // 이 슬롯은 매 진입마다 16건 중 랜덤 1건을 세우므로 방금 응원한 글이 다음 진입엔 거의
      // 안 돌아온다 — 카운터는 DB에 정상 누적되는데도 "눌러도 반영이 안 된다"로 보였다.
      // 사람 기준이면 어느 기록이 떠도 그 사람 응원이 이어서 쌓인다(같은 사람이 활동지수
      // 슬롯에도 대표로 뜨면 🔥가 합산되는 것도 의도 — "그 사람을 응원").
      //
      // 피드 캐시엔 이 응원 수가 없어(actv는 원천 테이블이 아니다) 하한 0에서 시작하고,
      // 최신 집계(reactions.totals/mine)를 buildEntity가 얹는다.
      entity: buildEntity("actv", post.mem_id, "fire", 0),
      // 사람은 렌더의 사진 옆 아바타+이름 줄이 맡는다(people 줄은 안 쓴다 — 사진 슬롯 전용 렌더).
      people: [],
      moreCount: 0,
      // 헤드라인은 한마디(따옴표). **한마디가 없으면 비운다** — 예전엔 "OOO의 기록"으로
      // 채웠는데, 그건 사람이 쓴 말이 아니라 시스템이 지어낸 문장이라 읽는 사람에게 주는
      // 정보가 없다(이름은 바로 아래 줄에 이미 있다). 빈 줄로 두면 렌더가 그 자리를
      // 사진에 넘겨 사진이 커진다 — 한마디가 없는 기록은 사진이 곧 전부이므로.
      headline: post.cmnt_txt ? `“${post.cmnt_txt}”` : "",
      standfirst: meta,
      figure: null,
      figureLabel: null,
      photo: {
        url: post.photo_url,
        person,
        postId: post.post_id,
        // 마일리지런에서 올라온 기록이면 사진 위에 ⚡ 배지를 얹는다(격자·릴스와 같은 표시)
        mileage: post.src_enm === "mlg_auto",
        title: post.primary_title
          ? {
              ttl_nm: post.primary_title.ttl_nm,
              badge_effect: post.badge_effect ?? "none",
            }
          : null,
      },
    });
  }

  // ⑦ 칭호획득(v2) — 최근 30일 획득자 중 **사람 대표 1명** + 나머지 얼굴+이름 명단.
  //    v1(칭호별 묶음 나열)은 실데이터에서 칭호당 1~2명이 대부분이라 지면이 휑하고
  //    익명이었다(스펙 v2 §배경). 대표는 한 바퀴마다 +1 회전(rotate 원칙 — 전원이
  //    돌아가며 대표가 된다), 명단은 최신순 고정. 30일 창·뉴비 제외는 RPC가 걸고,
  //    사람 dedupe(사람별 최신 수여 1건)는 buildTitleLeadPool이 한다.
  const titlePicked = pickTitleLead(buildTitleLeadPool(grants), titlePick);
  if (titlePicked) {
    const { lead, others } = titlePicked;
    // 내가 이 칭호를 보유했는가 — RPC가 실어주는 최신 10명(title.grants) 기준 근사(v1 동일).
    const heldByMe =
      myMemId != null && lead.title.grants.some((p) => p.mem_id === myMemId);
    ledes.push({
      // 대표가 바뀌면 key도 바뀌어 슬롯 진입 모션이 다시 돈다(다른 슬롯과 같은 동작).
      key: `title-${lead.person.mem_id}`,
      kicker: "기강에 새 역사를 쓰다",
      hero: "headline",
      // 응원 대상은 대표 멤버 — 활동지수·목표 슬롯과 같은 멤버 기준 카운터(actv).
      // 피드 캐시엔 이 응원 수가 없어 하한 0에서 시작한다(활동지수 슬롯과 동일).
      // 검증 관문은 bump-reaction isOnBoard의 actv 네 번째 출처(story-titles 캐시).
      entity: buildEntity("actv", lead.person.mem_id, "fire", 0),
      people: [],
      moreCount: 0,
      // 칭호명을 헤드라인에 넣지 않는다 — 을/를 조사가 칭호마다 갈리고(山神을/HALF를),
      // 칭호명은 아래 배지가 실물로 말한다. 문구는 화면 보고 다듬기(스펙 결정 표).
      headline: `${lead.person.mem_nm}, 새 칭호를 획득하다`,
      standfirst: "",
      figure: null,
      figureLabel: null,
      titleLead: {
        lead: {
          person: {
            mem_id: lead.person.mem_id,
            mem_nm: lead.person.mem_nm,
            avatar_url: lead.person.avatar_url,
          },
          ttl_nm: lead.title.ttl_nm,
          // 지면 글상자용 — 툴팁과 같은 게이트를 통과한 것만(§resolveDescVisible).
          desc: resolveDescVisible(lead.title.desc_visibility, heldByMe)
            ? lead.title.ttl_desc?.trim() || null
            : null,
          tooltip: {
            desc: lead.title.ttl_desc,
            visibility: lead.title.desc_visibility,
            isHeld: heldByMe,
          },
        },
        others: others.slice(0, TITLE_OTHERS_MAX).map((e) => ({
          mem_id: e.person.mem_id,
          mem_nm: e.person.mem_nm,
          avatar_url: e.person.avatar_url,
        })),
        // `외 N명` — 대표 1명 + 명단에 선 인원을 뺀 나머지(§countTitleMoreMembers).
        // pool 길이로 세면 안 된다는 규칙이 그 헬퍼 안에 있다.
        moreCount: countTitleMoreMembers(
          grants,
          1 + Math.min(others.length, TITLE_OTHERS_MAX),
        ),
        // grant_cnt 합산 — grants.length 합은 칭호당 10건 상한에 묶여 실제 총
        // 수여 건수보다 적게 나온다(v1과 같은 이유).
        totalGrantCnt: grants.reduce((n, g) => n + g.grant_cnt, 0),
      },
    });
  }

  // 스와이프 순서 — 지면 위계를 여기서 한 곳에 고정한다. 위 push 순서(존별 생성 편의)와
  // 분리해 두면, 순서를 바꿀 때 블록을 옮기지 않고 이 표만 고치면 된다. 목록에 없는 존이
  // 생기면(접두어 매칭 실패) 맨 뒤로 보낸다(ORDER에 없으면 큰 값).
  const ORDER = ["post", "actv", "newbie", "pledge", "race", "record", "title"];
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
  grants,
  initialTitlePick,
  initialNewbiePick,
  initialPledgePick,
  initialRecordPick,
  initialActvPick,
  initialPostPick,
  onSelectMember,
  teamId,
  myMemId,
  me,
}: {
  feed: StoryFeed;
  /** 응원 집계 (모두의 총합 + 내 몫) — 응원 버튼 카운트 보정용 */
  reactions: StoryReactionCounts;
  /** 기록 자랑 — 기록자랑 칸에 랜덤 1건 */
  posts: StoryPost[];
  /** 칭호획득 — 칭호별 묶음(§⑦). 피드와 캐시 태그가 갈려 있어 별도 prop이다 */
  grants: RecentTitleRow[];
  initialTitlePick: number;
  /** 리드 각 랜덤 슬롯의 진입 인덱스 — 서버가 매 요청 뽑아 넘긴다(§story/page.tsx).
   *  첫 화면부터 랜덤이고 하이드레이션이 안전하다(렌더 중 Math.random 금지). */
  initialNewbiePick: number;
  initialPledgePick: number;
  initialRecordPick: number;
  initialActvPick: number;
  initialPostPick: number;
  onSelectMember: (memId: string, name: string) => void;
  /** 아래 릴스 뷰어(운동기록 슬롯의 사진 탭)의 댓글에 넘긴다 */
  teamId: string;
  myMemId: string | null;
  me: { id: string; name: string; avatarUrl: string | null } | null;
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
  const [titlePick, setTitlePick] = useState(initialTitlePick);
  const ledes = buildLedes(
    feed,
    reactions,
    posts,
    newbiePick,
    pledgePick,
    recordPick,
    actvPick,
    postPick,
    grants,
    titlePick,
    myMemId,
  );
  const total = ledes.length;

  /**
   * 내가 이 화면에서 누른 응원 — `entity_type:entity_id` → 누른 횟수.
   *
   * **응원 버튼은 슬롯이 바뀔 때마다 언마운트된다**(슬롯 컨테이너가 `key={lede.key}`라
   * 통째로 갈린다). 카운트를 버튼 안 useState로만 들고 있으면 넘겼다 돌아온 순간 props의
   * 서버값으로 초기화돼 방금 누른 게 사라진다 — 서버엔 이미 저장돼 있는데도.
   * 총합 캐시(30초)가 아직 안 돌았으면 그 사이 내내 되돌아간 값이 보인다.
   *
   * 그래서 누른 몫은 **버튼 바깥(여기)** 에 쌓는다. 지면이 살아 있는 동안 유지되므로
   * 슬롯을 몇 번 오가도 내가 누른 건 그대로 남는다.
   *
   * **새로고침도 견딘다**(sessionStorage). 총합 캐시가 30초라, 누르고 바로 새로고침하면
   * 서버는 아직 옛 총합을 준다 — 저장은 됐는데 화면만 되돌아가면 "안 눌렸나" 싶다.
   * 30초 만에 새로고침해 확인하는 사람은 드물지만, 누른 직후 확인하는 사람은 흔하다.
   * 탭을 닫으면 사라지는 sessionStorage라 오래 남아 서버값과 어긋날 일도 없다.
   */
  // 빈 맵으로 시작해 마운트 뒤 한 번 복원한다 — 초기 state에서 sessionStorage를 읽으면
  // 서버 렌더(저장소가 없다)와 결과가 달라 하이드레이션이 깨진다.
  /** 사진을 눌러 연 릴스 뷰어의 시작 장 — null이면 닫힘(격자존과 같은 방식) */
  const [reelId, setReelId] = useState<string | null>(null);

  const [myBumps, setMyBumps] = useState<Record<string, number>>({});

  /**
   * 복원은 **effect에서** 한다(렌더 중이 아니라).
   *
   * 예전엔 렌더 본문에서 sessionStorage를 읽었는데, 이 컴포넌트는 서버에서도 렌더된다 —
   * 서버엔 `window`가 없어 catch로 삼켜져 빈 맵으로 마크업이 만들어지고, 클라이언트 첫
   * 렌더는 복원값을 들고 시작한다. 그러면 응원 카운트 텍스트가 서버 출력과 달라
   * 하이드레이션 불일치가 난다(React 경고 + 값이 한 번 튄다).
   *
   * effect로 옮기면 첫 페인트에 내 몫이 잠깐 빠져 보이지만, 이건 **누른 직후 새로고침한
   * 사람만** 겪는 한 프레임이고, 하이드레이션이 깨지면 그 아래 트리 전체가 다시 그려진다.
   * 깜빡임보다 정합이 먼저다.
   */
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(BUMP_STORE_KEY);
      // sessionStorage는 React 밖의 외부 저장소라, 마운트 뒤 한 번 읽어 state에 옮기는 건
      // 이 규칙이 말하는 "외부 시스템에서 값을 가져오는" 정당한 용례다. 마운트 1회뿐이라
      // 캐스케이드도 없다(deps=[]).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setMyBumps(JSON.parse(raw) as Record<string, number>);
    } catch {
      // 사파리 프라이빗 모드 등 — 저장이 막혀도 응원 자체는 동작해야 한다.
    }
  }, []);

  /**
   * 누른 몫을 sessionStorage에 반영한다 — **updater가 아니라 여기서.**
   *
   * 예전엔 `setMyBumps` 업데이터 안에서 바로 `setItem`을 불렀는데, React는 업데이터를 순수
   * 함수로 보고 개발 모드(StrictMode)·동시성 렌더링에서 **한 번 이상 호출할 수 있다**.
   * 저장 자체는 멱등이라 지금까지 티가 안 났을 뿐, 규칙 위반이고 정적분석에도 걸린다.
   * 상태가 정해진 뒤 effect에서 한 번 쓰면 업데이터는 순수해지고 저장은 그대로 남는다.
   *
   * 마운트 직후 복원값을 그대로 되쓰는 셈이지만(같은 값) 무해하다.
   */
  useEffect(() => {
    try {
      window.sessionStorage.setItem(BUMP_STORE_KEY, JSON.stringify(myBumps));
    } catch {
      // 사파리 프라이빗 모드 등 — 저장이 막혀도 이번 세션 화면에는 이미 반영돼 있다.
    }
  }, [myBumps]);

  const addBump = useCallback((key: string) => {
    setMyBumps((prev) => ({ ...prev, [key]: (prev[key] ?? 0) + 1 }));
  }, []);

  /**
   * 서버 저장이 실패한 만큼 되돌린다 — `addBump`의 짝.
   *
   * 버튼은 자기 카운트를 스스로 되돌리지만, **여기 쌓인 몫은 버튼 바깥에 살아남는다**.
   * 그래서 이 정리가 없으면 슬롯이 한 바퀴 돌아 버튼이 재마운트될 때 실패분이 `initialCount`로
   * 되살아나, 실제로는 저장되지도 않은 응원이 세션 내내 숫자에 남는다.
   */
  const removeBumps = useCallback((key: string, delta: number) => {
    setMyBumps((prev) => {
      const left = (prev[key] ?? 0) - delta;
      const next = { ...prev };
      // 0이면 키를 지운다 — 남겨두면 저장소가 쓰지도 않는 키로 계속 불어난다.
      if (left > 0) next[key] = left;
      else delete next[key];
      return next;
    });
  }, []);

  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  /** 게이지를 처음부터 다시 굴리기 위한 세대 번호 — 같은 장에 머물러 재개할 때 필요 */
  const [runId, setRunId] = useState(0);
  /** 탭이 숨어 있나 — 초기값은 false로 둔다(서버 렌더와 첫 클라 렌더가 같아야 한다) */
  const [hidden, setHidden] = useState(false);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const resumeTimerRef = useRef<number | null>(null);
  /** 지면 전체 — 화면 안/밖 판정(IntersectionObserver)의 대상 */
  const sectionRef = useRef<HTMLElement>(null);

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
    // 칭호는 랜덤 재추첨이 아니라 **대표 전진**이다 — +1로 획득자 전원이 돌아가며
    // 대표가 된다(§lib/story-title.ts pickTitleLead).
    setTitlePick((n) => n + 1);
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

  /** 지면이 화면 안에 있나 — 스크롤로 벗어나면 굴릴 이유가 없다(초기값 true: 첫 화면엔 보인다) */
  const [onScreen, setOnScreen] = useState(true);
  /** 릴스 뷰어가 열려 있나 — 같은 문서 안 다이얼로그라 `document.hidden`으로는 안 잡힌다 */
  const reelOpen = reelId !== null;

  /**
   * 게이지가 멈춰야 하는가 — 손이 닿았거나 · 탭이 숨었거나 · **화면 밖이거나** · 릴스가 덮었거나.
   *
   * 화면 밖·릴스 중에는 **되감지 않고 그냥 선다**: 안 보는 동안 소식이 흘러가 버리면 돌아왔을 때
   * 볼 게 없고, 릴스를 보다 닫았는데 뒤에서 슬롯이 바뀌어 있으면 맥락이 끊긴다.
   */
  const frozen = paused || hidden || !onScreen || reelOpen;

  useEffect(() => {
    return () => {
      if (resumeTimerRef.current !== null)
        window.clearTimeout(resumeTimerRef.current);
    };
  }, []);

  /**
   * 지면이 화면 밖으로 나가면 자동 전환을 멈춘다.
   *
   * 스크롤로 아래 존들을 보는 동안에도 4초마다 슬롯이 넘어가고 있었다 — 아무도 안 보는
   * 화면을 굴리느라 타이머·CSS 애니메이션만 돌고, 다시 올라오면 소식이 몇 장 지나가 있다.
   * `threshold: 0.3` — 절반 넘게 가려지면 "안 보는 것"으로 친다(살짝 걸친 상태에서 껐다 켰다
   * 하지 않게 여유를 둔다).
   */
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => setOnScreen(entry.isIntersecting),
      { threshold: 0.3 },
    );
    obs.observe(el);
    return () => obs.disconnect();
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
  ) : lede.titleLead ? (
    // 칭호획득 — 총 수여 건수. **"최근"을 붙인다**: 맨숫자만 있으면 크루가 여태 딴
    // 칭호를 다 합친 값으로 읽히는데, 실제로는 30일 창의 집계다. 일수까지 적지는 않는다
    // (창 길이는 RPC 기본값이고, 헤드라인·명단이 이미 "요즘 소식"으로 읽힌다).
    <span className="truncate text-[12px] text-muted-foreground">
      최근 획득 {lede.titleLead.totalGrantCnt}건
    </span>
  ) : null;
  // 활동지수 슬롯은 footer 왼쪽이 빈다 — 실을 한 줄 사실이 없다(PB는 슬롯에서 뺐다).
  // 새 얼굴 슬롯도 비운다 — 가입목적은 폭이 필요해 body로 올렸다(§newbie 렌더).

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
      ref={sectionRef}
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
              {/* 대회 슬롯 2종은 헤드라인이 대회명이라 상세로 들어갈 수 있다. 링크는 글자
                  자리를 그대로 쓰고(inline) 밑줄만 은은히 깔아, 헤드라인 크기·줄바꿈
                  (.lede-headline의 2줄 자르기)에 영향을 주지 않는다.
                  자동 전환 중에 눌리는 자리라 onClick으로 스와이프를 멈춘다 — 손이 닿았는데
                  지면이 넘어가면 엉뚱한 대회로 들어간다. */}
              {lede.headlineHref ? (
                <Link
                  href={lede.headlineHref}
                  onClick={pauseThenResume}
                  className="underline decoration-border decoration-1 underline-offset-4 transition-colors hover:decoration-foreground"
                >
                  {lede.headline}
                </Link>
              ) : (
                lede.headline
              )}
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
            <div className="flex min-h-0 flex-col gap-2">
              {/* **사진 크기는 슬롯이 남긴 높이가 정한다(158px).**
                  예전 144px은 위아래로 7px씩 여백을 남기고 끝났다 — body 밴드가
                  `justify-center`라 남는 높이가 사진 위아래로 갈렸기 때문이다. 그 여백을
                  사진이 먹게 해 지면을 더 쓴다.

                  158px이 나온 계산(슬롯 264px 기준):
                    264 − kicker 16 − gap 12 − footer 34 − gap 12 = 190 (본문 영역)
                    190 − 이름줄 24 − gap 8 = 158 (사진이 쓸 수 있는 최대)
                  **상한에 딱 붙인 값이라 여유가 0이다.** 폰트 렌더링·칭호 배지 높이가
                  기기마다 1~2px 흔들리면 footer가 밀릴 수 있다 — 실기기에서 응원 버튼 줄이
                  잘리거나 내려앉으면 152px로 내린다(그 값은 6px 여유를 둔 것이었다).

                  **정사각은 반드시 유지한다**: `w-full`로 늘리면 가로로 긴 띠가 되어
                  정사각인 격자·릴스와 결이 어긋난다(실제로 그렇게 만들었다가 되돌렸다).
                  ⚠️ 더 키우려면 슬롯 높이(h-[264px])부터 375px에서 다시 재야 한다. */}
              <div
                className={
                  lede.headline
                    ? "flex min-h-0 items-start gap-3"
                    : "flex min-h-0 flex-col"
                }
              >
              {/* 사진을 누르면 그 기록의 릴스 뷰어가 이 장부터 열린다(격자 칸과 같은 동작).
                  예전엔 "사진은 눌러도 반응하지 않는다"였는데, 리드에서 사진만 보고 한마디
                  전문·거리·날짜를 보려면 아래 격자까지 내려가 같은 장을 다시 찾아야 했다. */}
              <button
                type="button"
                // 비로그인은 릴스 대신 로그인으로 — 격자존(§openReel)과 같은 문턱이다.
                // 여기만 열어 두면 리드를 통해 안쪽 지면이 그대로 새어 나간다.
                onClick={() => {
                  if (myMemId == null) {
                    goToLogin("/story");
                    return;
                  }
                  setReelId(lede.photo!.postId);
                }}
                aria-label={
                  myMemId == null
                    ? "로그인하고 기록 보기"
                    : `${lede.photo.person.mem_nm}의 기록 자세히 보기`
                }
                className={`relative size-[158px] shrink-0 overflow-hidden rounded-xl bg-muted transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]`}
              >
                {/* 사진은 항상 있다 — 프사 폴백은 걷어냈다(조회에서 사진 없는 기록을 거른다).
                    그래도 **`?? ""`로 때우지 않는다**: 빈 src는 브라우저가 현재 페이지 URL을
                    이미지로 다시 요청하게 만들어(문서를 이미지로 받으려다 실패) 깨진 아이콘이
                    뜨고 요청 하나가 샌다. 격자·릴스가 이미 같은 이유로 값이 없으면 안 그린다 —
                    여기만 빠져 있었다. 평소엔 RPC 필터가 가려 주지만, `unstable_cache`에 남은
                    옛 payload가 내려오면 드러난다(실제로 서버 재시작 첫 렌더에서 경고를 봤다).
                    없으면 그냥 빈 판(bg-muted)으로 둔다. */}
                {lede.photo.url && (
                  <Image
                    src={lede.photo.url}
                    alt={lede.photo.person.mem_nm}
                    fill
                    sizes="50vw"
                    unoptimized
                    className="object-cover"
                  />
                )}
                {/* 마일리지런에서 온 기록 — 격자·릴스와 같은 ⚡ 표시. 이 칸은 158px로 작아
                    글자 없이 아이콘만 얹는다(라벨까지 넣으면 사진을 가린다). */}
                {lede.photo.mileage && (
                  <span
                    aria-label="마일리지런 기록"
                    className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm"
                  >
                    <Zap className="size-3 fill-current" />
                  </span>
                )}
              </button>
              {/* 한마디 — 사진 옆이라 헤드라인(26px)보다 작게. **높이를 사진과 같게 못박는다
                  (158px)** — 한마디가 짧아도 이 칸이 사진보다 일찍 끝나 덩어리 우측이
                  들쭉날쭉해지지 않게. 한마디가 없으면 칸 자체를 그리지 않는다(사진만 선다).

                  **줄 수는 사진 높이에 맞춘 7줄이다.** 예전 `line-clamp-4`는 4줄 = 90px
                  (15px × leading-1.5 × 4)이라 사진 옆에 54px을 남기고 끝났다 — 글이
                  더 있는데도 사진 바닥에 한참 못 미쳐 잘렸다. 7줄이면 157.5px로 158px 사진과
                  거의 정확히 맞는다.
                  ⚠️ 사진 높이를 바꾸면 이 줄 수도 함께 고쳐야 한다 — 높이 ÷ 22.5px.
                  `overflow-hidden`으로 흘려보내면 이 숫자가 필요 없지만, 그러면 잘릴 때
                  말줄임(…)이 사라져 "글이 더 있다"는 신호가 없어진다. */}
              {lede.headline && (
                <div className="flex h-[158px] min-w-0 flex-1 flex-col">
                  <p className="line-clamp-7 min-w-0 text-pretty break-keep text-[15px] leading-[1.5] text-foreground [overflow-wrap:anywhere]">
                    {lede.headline}
                  </p>
                </div>
              )}
              </div>

              {/* 올린 사람 — **사진 아래 제 줄로 내렸다.** 예전엔 사진 옆 칸 바닥에
                  붙였는데(mt-auto), 한마디가 짧으면 사진 옆이 텅 비고 그만큼 이름이
                  덩어리 안에 갇혀 사진 아래 여백만 남았다. 밖으로 내리면 그 여백을
                  이름이 쓰고, 사진 왼쪽 끝에 맞춰 서서 "이 사진을 올린 사람"으로 읽힌다.
                  self-start라 이름 길이만큼만 눌린다(줄 전체가 버튼이 되지 않게). */}
              <button
                type="button"
                onClick={() =>
                  onSelectMember(
                    lede.photo!.person.mem_id,
                    lede.photo!.person.mem_nm,
                  )
                }
                aria-label={`${lede.photo.person.mem_nm} 프로필 보기`}
                className="flex min-w-0 items-center gap-1.5 self-start rounded-full transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
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
                {/* 칭호 — 이름과 같은 급으로 옆에 세운다(sm=11px, 이름 12px). 예전엔
                    "조연이 넷이 된다"고 뺐지만, 이름이 사진 아래 제 줄을 갖게 되면서
                    그 줄에 여유가 생겼다. shrink-0으로 이름이 길어도 배지가 안 눌린다. */}
                {lede.photo.title && (
                  <TitleBadge
                    name={lede.photo.title.ttl_nm}
                    effect={lede.photo.title.badge_effect}
                    size="sm"
                    className="shrink-0"
                  />
                )}
              </button>
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

              {/* `newbieBlank`가 이미 소개 한마디 없음을 포함한다 — 앞에 `!intro`를 또 걸면
                  항상 참인 조건이 하나 더 붙을 뿐이다. */}
              {newbieBlank && (
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

              {/* 한마디 — 얼굴 바로 아래. 활동지수·목표 슬롯과 **같은 칸**(PersonIntro)을 쓴다.
                  사람을 세우는 리드 넷 중 여기만 빠져 있었고, 인물 한 줄 + 결과표라 아래가 비어 있었다.
                  안 쓴 사람도 자리는 남는다 — 스와이프마다 아래 내용이 위아래로 뛰지 않게. */}
              <PersonIntro
                text={lede.raceRecord.person.intro_txt}
                fallback={lede.raceRecord.introFallback}
              />
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
          ) : lede.titleLead ? (
            /* 칭호획득(§⑦ v2) — 대표 1명(아바타·이름·새 칭호 배지) + 괘선 아래 나머지
               획득자 명단. 배지 탭 → 칭호 설명 툴팁, 얼굴·이름 탭 → 프로필 카드.

               **설명 줄은 두지 않는다** — 배지를 누르면 어차피 뜨는 말이라 지면에 또 적으면
               같은 말이 두 번이고, 그 줄이 빠져야 명단이 헤드라인 바로 아래로 올라온다. */
            <div className="flex min-h-0 flex-col gap-3">
              {/* 대표 헤더 — PersonProfile(활동지수 슬롯)의 아바타+이름 결을 따르되 부품을
                  그대로 못 쓴다: PersonProfile 배지엔 tooltip prop이 없고, intro 자리는
                  "사람의 말" 그릇(인용구+폴백 문구)이라 칭호 설명을 넣으면 본인 발언처럼
                  읽힌다. 배지는 버튼 밖 형제다 — 안에 넣으면 배지 탭(툴팁)이 프로필
                  카드까지 연다(프로필탭 카메라 배지를 형제로 두는 것과 같은 이유). */}
              <div className="flex min-w-0 items-center gap-2.5">
                {/* 얼굴과 이름이 **버튼 둘로 갈린다.** 칭호가 이름 밑으로 내려오면서
                    이름·배지가 한 세로 단이 됐는데, 배지는 여전히 버튼 밖에 있어야
                    하기 때문이다(배지 탭은 설명 툴팁, 얼굴·이름 탭은 프로필 카드 —
                    한 버튼에 넣으면 툴팁을 열려다 카드까지 열린다).

                    아바타가 lg(56)가 아니라 md(40)인 건 이름(17) + 간격(4) + 배지(19)
                    세로 단이 정확히 40px이기 때문이다 — 옆에 세우는 두 덩어리의 높이가
                    맞고, lg일 때보다 16px을 슬롯에 돌려준다(§264px 예산). */}
                <button
                  type="button"
                  onClick={() =>
                    onSelectMember(
                      lede.titleLead!.lead.person.mem_id,
                      lede.titleLead!.lead.person.mem_nm,
                    )
                  }
                  aria-label={`${lede.titleLead.lead.person.mem_nm} 프로필 보기`}
                  className="shrink-0 rounded-full transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
                >
                  <Avatar
                    src={lede.titleLead.lead.person.avatar_url}
                    seed={lede.titleLead.lead.person.mem_id}
                    alt={lede.titleLead.lead.person.mem_nm}
                    size="md"
                  />
                </button>
                <div className="flex min-w-0 max-w-[45%] shrink-0 flex-col items-start gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      onSelectMember(
                        lede.titleLead!.lead.person.mem_id,
                        lede.titleLead!.lead.person.mem_nm,
                      )
                    }
                    aria-label={`${lede.titleLead.lead.person.mem_nm} 프로필 보기`}
                    className="min-w-0 max-w-full rounded-md text-left transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
                  >
                    <span className="block truncate text-[17px] font-bold leading-tight text-foreground">
                      {lede.titleLead.lead.person.mem_nm}
                    </span>
                  </button>
                  <TitleBadge
                    name={lede.titleLead.lead.ttl_nm}
                    effect={null}
                    size="sm"
                    className="min-w-0 max-w-full overflow-hidden"
                    tooltip={lede.titleLead.lead.tooltip}
                  />
                </div>
                {/* 칭호 설명 — 이름·배지 오른쪽 빈 자리를 글상자로 채운다. 이 칭호가
                    무엇인지가 "그래서 뭘 해냈나"를 대신 말해 주는데, 배지를 눌러야만
                    보이면 지나치는 사람이 대부분이다(툴팁은 그대로 남는다 — 여기서
                    …로 잘린 뒷말을 거기서 읽는다).

                    **인용부호를 쓰지 않고 상자로 두른다**: 여기 있는 건 사람의 말이
                    아니라 칭호에 붙은 설명이라, 소개 한마디(IntroQuote)의 어법을 빌리면
                    본인이 한 말처럼 읽힌다.

                    **높이를 h-12로 못박는다**(2줄분 36px + 안쪽 여백 12px): 설명 길이가
                    칭호마다 제각각이라 열어 두면 대표 블록이 한 줄짜리·두 줄짜리 사이를
                    오가고, 4초마다 넘어가는 지면에서 그 아래 명단이 위아래로 뛴다. */}
                {lede.titleLead.lead.desc && (
                  <p className="flex h-12 min-w-0 flex-1 items-center rounded-lg bg-muted/40 px-2.5 text-[11px] leading-relaxed text-muted-foreground">
                    <span className="line-clamp-2 break-keep">
                      {lede.titleLead.lead.desc}
                    </span>
                  </p>
                )}
              </div>
              {/* 나머지 획득자 — **스크롤도 줄바꿈도 없다.** 4초마다 넘어가는 지면에서
                  스크롤은 손이 닿기 전에 사라지는 조작이고, 두 줄은 264px 예산에서
                  헤드라인이 2줄이 되는 순간 바닥이 잘린다(실제로 잘린 걸 화면에서 봤다).
                  그래서 `TITLE_OTHERS_MAX`(6)에서 자르고 나머지는 `외 N명`으로 말한다.

                  칩은 **얼굴 위·이름 아래** 세로 스택이다 — 이름을 옆에 두면 칩 폭이
                  아바타+이름이라 한 줄에 서넛뿐인데, 아래로 내리면 폭을 이름만 정해
                  같은 한 줄에 여섯이 선다.

                  `flex-nowrap` + 칩마다 `min-w-0 flex-1`인 이유: 이름 길이는 사람마다
                  다른데 고정 폭이면 긴 이름이 들어온 날만 줄이 넘어간다. 남는 폭을
                  나눠 갖게 하면 이름이 …로 줄지언정 **한 줄은 무조건 지켜진다.** */}
              {lede.titleLead.others.length > 0 && (
                <div className="flex min-w-0 flex-col gap-1.5 border-t border-border pt-2.5">
                  <div className="flex min-w-0 flex-nowrap items-start gap-x-2">
                    {lede.titleLead.others.map((p) => (
                      <button
                        key={p.mem_id}
                        type="button"
                        onClick={() => onSelectMember(p.mem_id, p.mem_nm)}
                        aria-label={`${p.mem_nm} 프로필 보기`}
                        className="flex min-w-0 max-w-[72px] flex-1 flex-col items-center gap-1 rounded-lg transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
                      >
                        <Avatar
                          src={p.avatar_url}
                          seed={p.mem_id}
                          alt={p.mem_nm}
                          size="xs"
                        />
                        {/* 이름은 **자르지 않는다.** 칸이 좁으면 옆 이름과 겹치게 두는
                            쪽이 낫다 — 여기서 알아야 할 건 "누가 받았나"인데 `…`로
                            잘리면 그걸 못 읽는다(가려서 얻는 게 없다).
                            `whitespace-nowrap`은 남긴다: 두 줄로 접히면 칩 높이가
                            달라져 한 줄 배치가 무너진다. 넘친 글자는 폭을 늘리지 않고
                            (부모가 min-w-0) 시각적으로만 이웃 위로 흐른다. */}
                        <span className="whitespace-nowrap text-[12px] leading-none text-foreground">
                          {p.mem_nm}
                        </span>
                      </button>
                    ))}
                  </div>
                  {/* `외 N명`은 얼굴 줄 **아래 제 줄**에 둔다. 칩 옆에 끼우면 그 자리
                      하나가 얼굴 몫에서 빠지는데, 이 줄은 여섯 명이 꽉 차는 한 줄이라
                      한 자리가 아깝다. 왼쪽 끝에 맞춰 명단에 딸린 꼬리로 읽히게 한다. */}
                  {lede.titleLead.moreCount > 0 && (
                    <span className="text-[12px] text-muted-foreground">
                      외 {lede.titleLead.moreCount}명
                    </span>
                  )}
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
            모든 슬롯이 응원을 받는다(운동기록은 글이 아니라 **올린 사람** 기준 —
            `entity_type = "actv"` + mem_id로 활동지수·목표 슬롯과 카운터를 공유한다.
            칭호획득도 같다 — 대상은 칭호가 아니라 그 칭호를 새로 단 대표 멤버). */}
        <div className="flex shrink-0 items-center justify-between gap-3">
          <div className="min-w-0 flex-1">{footNote}</div>
          {lede.entity && (
            <StoryReactionButton
              entityType={lede.entity.type}
              entityId={lede.entity.id}
              rctnCd={lede.entity.rctnCd}
              // 이 화면에서 누른 몫을 서버값 위에 얹는다 — 슬롯을 넘겼다 돌아와도(버튼 언마운트)
              // 방금 누른 게 그대로 남는다. 서버 총합이 갱신되면(30초) 그쪽에 이미 포함돼
              // 들어오므로, 그때는 `bumped`를 빼서 이중 계산을 막는다(아래 참조).
              initialCount={lede.entity.count + (myBumps[lede.entity.key] ?? 0)}
              initialMyCount={
                lede.entity.myCount + (myBumps[lede.entity.key] ?? 0)
              }
              bumped={myBumps[lede.entity.key] ?? 0}
              onBump={() => addBump(lede.entity!.key)}
              // 저장이 실패하면 여기 쌓아 둔 몫도 되돌린다 — 안 그러면 슬롯을 넘겼다 돌아올 때
              // 저장되지도 않은 응원이 숫자에 되살아난다(§removeBumps).
              onBumpFailed={(delta) => removeBumps(lede.entity!.key, delta)}
              // 비로그인은 서버가 거부하므로 누르면 낙관 반영 대신 로그인으로 보낸다.
              // 버튼 자체는 숨기지 않는다 — 슬롯 바닥의 응원 자리는 전 슬롯이 공유한다.
              canReact={myMemId != null}
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

      {/* 사진을 눌러 여는 릴스 뷰어 — 격자존과 같은 부품·같은 목록(posts)을 쓴다.
          누른 장부터 열리고, 위아래로 밀어 다른 기록으로 넘어갈 수 있다. */}
      <RecordReelViewer
        posts={posts}
        startId={reelId}
        open={reelId !== null}
        onOpenChange={(o) => {
          if (!o) setReelId(null);
        }}
        onSelectMember={onSelectMember}
        teamId={teamId}
        myMemId={myMemId}
        myName={me?.name}
        myAvatarUrl={me?.avatarUrl}
      />
    </section>
  );
}
