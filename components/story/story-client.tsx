"use client";

import { useState } from "react";

import type { ReactNode } from "react";

import {
  ACTV_HELP_TEXT,
  getActvMonthLabel,
} from "@/lib/activity-index";
import { dayjs } from "@/lib/dayjs";

import { HelpTip } from "@/components/common/help-tip";
import { MemberCardCompact } from "@/components/members/member-card";
import { MemberCardDialog } from "@/components/members/member-card-dialog";
import { ActvHistorySheet } from "@/components/story/actv-history-sheet";
import { ActvPile } from "@/components/story/actv-pile";
import { FloatingAvatars } from "@/components/story/floating-avatars";
import { SocialLinksGrid } from "@/components/social-links";
import { GhostWanted } from "@/components/story/ghost-wanted";
import { MessagePlanes } from "@/components/story/message-planes";
import { PledgeSigns } from "@/components/story/pledge-signs";
import { RecordFlexFeed } from "@/components/story/record-flex-feed";
import { StoryLede } from "@/components/story/story-lede";
import { StoryMasthead } from "@/components/story/story-masthead";
import { StoryPulse } from "@/components/story/story-pulse";
import { StorySection } from "@/components/story/story-section";

import type { GhostMember } from "@/lib/queries/ghost-members";
import type { StoryFeed, StoryReactionCounts } from "@/lib/queries/story-feed";
import type { StoryMessage } from "@/lib/queries/story-messages";
import type { StoryPost } from "@/lib/queries/story-posts";
import type { TeamOverview } from "@/lib/queries/team-overview";

/**
 * /story 존 잠정 중단 토글 — **삭제가 아니라 잠정 중단이다**(2026-07-28 UI 정리).
 *
 * 되살리려면 해당 상수를 true로 되돌린다. 그러면 존 렌더가 다시 살아난다.
 * 성능: false일 땐 존 컴포넌트가 렌더 트리에서 통째로 빠진다(자식의 이펙트·구독·상태도 안 돈다).
 * - 종이비행기는 서버 쿼리(getStoryMessages)까지 함께 끊어야 진짜로 비용이 0이 된다 →
 *   그 조치는 app/(main)/story/page.tsx에서. messages prop은 이제 항상 [] 로 온다.
 * - 목표 한마디는 리드 슬롯도 함께 중단(components/story/story-lede.tsx의 SHOW_PLEDGE_LEDE).
 */
const SHOW_MESSAGE_PLANES = false;
const SHOW_PLEDGE_SIGNS = false;

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
  ghosts,
  posts,
  initialPostPick,
  initialNewbiePick,
  initialPledgePick,
  initialRecordPick,
  initialActvPick,
  messages,
  teamId,
  myMemId,
  me,
  reactions,
  mastheadActions,
}: {
  feed: StoryFeed;
  /** 크루 총량 — 기상대 상자에 쓴다 */
  overview: TeamOverview;
  /** 오래 안 나온 멤버 — 현상수배존에 쓴다 */
  ghosts: GhostMember[];
  /** 기록 자랑 — 팻말존에 쓴다. 피드와 캐시 태그가 갈려 있어 별도 prop이다 */
  posts: StoryPost[];
  /** 리드 각 랜덤 슬롯의 진입 인덱스 — 서버가 매 요청 뽑아 넘긴다(깜빡임·하이드레이션 안전).
   *  새 얼굴·각오·기록·활동지수·운동기록이 첫 화면부터 랜덤이고, 한 바퀴마다 클라가 재추첨한다. */
  initialPostPick: number;
  initialNewbiePick: number;
  initialPledgePick: number;
  initialRecordPick: number;
  initialActvPick: number;
  /** 종이비행기 한마디 — 24시간 만료. 각오와 별개 데이터(msg_mst), 별도 캐시·별도 RPC */
  messages: StoryMessage[];
  teamId: string;
  /** 로그인 사용자 — 본인 카드면 한마디를 바로 수정할 수 있다 */
  myMemId: string | null;
  /** 로그인 사용자 표시정보 — 떠다니는 아바타 프레즌스에 내 얼굴을 등록하는 데 쓴다(비로그인이면 null) */
  me: { id: string; name: string; avatarUrl: string | null } | null;
  /** 응원 집계 (모두의 총합 + 내 몫) — 캐시 없이 최신값. 리드 응원 버튼 보정용 */
  reactions: StoryReactionCounts;
  /** 제호 우상단 액션([알림][햄버거]) — 서버에서 그려 넘긴 노드(§story/page.tsx) */
  mastheadActions?: ReactNode;
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
    // select-none — 이 지면은 스와이프·던지기 제스처가 많은데, 그때 손가락을 끌면 글자가
    // 선택되며 OS 하이라이트(기기에 따라 초록/파랑 띠)가 칠해진다. 읽고 제스처하는 곳이지
    // 텍스트를 복사하는 곳이 아니라, 전체에 걸어 그 하이라이트를 없앤다.
    <div className="flex flex-col select-none break-keep">
      <StoryMasthead actions={mastheadActions} />

      {/* 리드 위 투명 레이어에 크루 아바타가 유영한다 — 탭하면 통통 튄다(놀이 요소).
          레이어는 포인터를 통과시키고(리드 스와이프 유지) 아바타만 클릭을 받는다.

          하단 패딩은 여백이 아니라 **아바타가 걸어다닐 바닥**이다. 이게 얕으면 아바타가
          리드의 진행 표시(현재 칸 막대) 높이에서 굴러 그걸 가린다 — 아바타 바닥선이
          막대보다 아래로 내려가도록 띠를 확보한다. 40px(pb-10)에 아바타 아래 **이름표(13px)**
          몫만 더한다(FloatingAvatars의 LABEL_H와 짝 — 한쪽만 바꾸면 다시 겹친다).
          "지금 보는 중" 라벨은 바닥선 위에 겹쳐 뜨므로 여기서 자리를 주지 않는다 — 라벨까지
          더하면 리드 아래 여백만 커진다. */}
      {/* `z-0`은 장식이 아니라 **스태킹 컨텍스트 격리**다. 아바타는 매 프레임 transform을
          찍는데, transform이 걸린 요소는 스스로 스태킹 컨텍스트를 만들어 z-index 없는
          형제들 위로 뜬다. 부모가 컨텍스트를 열어두지 않으면 그 아바타가 페이지 최상위에서
          `z-50` 다이얼로그와 직접 경쟁해 프로필 카드 위로 삐져나온다(overflow-hidden은
          자기 영역만 자를 뿐 위아래 순서와는 무관하다). 여기서 z-0으로 가둬 둔다. */}
      <div className="relative z-0 pb-[24px] pt-4">
        <StoryLede
          feed={feed}
          reactions={reactions}
          posts={posts}
          initialNewbiePick={initialNewbiePick}
          initialPledgePick={initialPledgePick}
          initialRecordPick={initialRecordPick}
          initialActvPick={initialActvPick}
          initialPostPick={initialPostPick}
          onSelectMember={selectMember}
        />
        <FloatingAvatars teamId={teamId} me={me} />
      </div>

      <div className="flex flex-col gap-8 pb-8 pt-6">
        {/* 기강 오버뷰 — 개별 소식(리드) 다음에 크루 전체 활동 지수(심박수) */}
        <StoryPulse overview={overview} />

        {/* 기록 자랑 — 인스타형 격자. 한 칸을 누르면 릴스 뷰어가 이 장부터 풀스크린으로 열리고,
            위아래로 밀어 다음 발자국을 본다. 뷰어 안 이름·프사를 누르면 프로필 카드가 그 위에
            겹쳐 뜬다(뷰어가 자체 관리 — story-client 공유 카드와 z-index가 안 부딪히게). */}
        <RecordFlexFeed posts={posts} myMemId={myMemId} teamId={teamId} />

        {/* 종이비행기 한마디 — 24시간 뒤 사라지는 한 줄(msg_mst).
            각오와 **별개 데이터**다: 저긴 팻말·1인 1개·만료 없음, 여긴 비행기·1인 N개·하루살이.
            잠정 중단(SHOW_MESSAGE_PLANES) — 되살리려면 상수를 true로(파일 상단 주석 참조). */}
        {SHOW_MESSAGE_PLANES && (
          <MessagePlanes
            messages={messages}
            teamId={teamId}
            myMemId={myMemId}
            me={me}
          />
        )}

        {/* 각오 팻말 — 코스변 손팻말. 만료 없이 쌓인다(1인 1개, 새로 쓰면 이전 것이 내려간다).
            잠정 중단(SHOW_PLEDGE_SIGNS) — 리드 슬롯(SHOW_PLEDGE_LEDE)과 함께 되살린다. */}
        {SHOW_PLEDGE_SIGNS && (
          <PledgeSigns
            pledges={feed.pledges}
            myMemId={myMemId}
            onSelectMember={selectMember}
          />
        )}

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
          headerAction={
            <HelpTip title="새 얼굴">
              최근 30일 안에 기강에 새로 가입한 크루원입니다. 카드를 누르면 러닝 프로필과
              소개 한마디를 볼 수 있어요.
            </HelpTip>
          }
        >
          {(newbies) => (
            // 새 얼굴은 실적이 없어 한 줄 목록으로는 이름밖에 남지 않는다.
            // 간단 프로필 카드로 러닝 프로필까지 보여주고, 탭하면 상세로 이어진다.
            <ul className="flex flex-col gap-2">
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

        {/* 다가오는 대회·최근 기록은 하단 목록을 두지 않는다 — 리드 스와이프의
            대회 칸·기록 칸이 같은 데이터를 이미 싣고 있어서, 아래에 목록을 또 세우면
            지면을 내리다 방금 읽은 걸 한 번 더 읽게 된다. 대회는 /races, 기록은
            프로필 카드(RECORDS)가 각각 전체 목록의 자리다.

            이달의 참가왕도 같은 이유로 스포트라이트 슬롯에만 둔다 — 활동량이 이번 달
            지표가 되면서 월 랭킹 두 개가 연달아 서면 같은 걸 두 번 본 것처럼 읽힌다. */}

        {/* 기강 활동량 — 이번 달 활동량이 있는 크루원 **전원**을 점수 비례 크기로 쌓는다.
            순위 목록이었을 땐 상위 5명(+더보기 10명)만 보여 "이만큼 많은 사람이 뛰었다"가
            전달되지 않았다. 접기(initial/max)를 쓰지 않는 이유가 그것이다 — 무더기는
            전원이 모여야 밀도로 읽히고, 잘라내면 그냥 큰 원 몇 개가 된다.

            리드문("7월 기강 활동량") 우측에 "내 활동 내역"을 같은 줄로 붙인다 — 별도
            줄로 아래에 두면 무더기와 리드 사이가 벌어져 어디에 딸린 버튼인지 흐려진다.
            리드가 이번 달 활동량을 말하는 줄이니, 내 내역도 같은 줄에서 답한다. */}
        <StorySection
          label="Activity Index"
          items={feed.actv_rank}
          initial={feed.actv_rank.length}
          max={feed.actv_rank.length}
          unit="명"
          headerAction={
            <HelpTip title="기강 활동량">{ACTV_HELP_TEXT}</HelpTip>
          }
        >
          {(entries) => (
            <>
              {/* 리드 + 내 활동 내역 — 같은 줄 양끝. 리드는 명조 15px(다른 존 리드와 동일),
                  내 내역은 산세리프 캡스 11px 링크. 로그인·본인이 무더기에 있을 때만 뜬다. */}
              {/* pt-2.5 — 다른 존의 리드(StorySection의 lead prop)와 같은 윗 여백.
                  이 존은 "내 활동 내역" 링크를 같은 줄에 놓아야 해서 lead prop을 못 쓰고
                  직접 그리는데, 그러면 lead가 받던 pt-2.5를 놓쳐 괘선에 붙어 보인다. */}
              <div className="flex items-baseline justify-between gap-3 pb-2.5 pt-2.5">
                <p className="text-[15px] leading-snug text-muted-foreground">
                  {getActvMonthLabel()} 기강 활동량
                </p>
                {myMemId && feed.actv_rank.some((e) => e.mem_id === myMemId) && (
                  <button
                    type="button"
                    onClick={() => {
                      const mine = feed.actv_rank.find(
                        (e) => e.mem_id === myMemId,
                      );
                      if (mine)
                        setHistory({ memId: mine.mem_id, name: mine.mem_nm });
                    }}
                    className="shrink-0 text-[11px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    내 활동 내역
                  </button>
                )}
              </div>
              <ActvPile entries={entries} onSelectMember={selectMember} />
            </>
          )}
        </StorySection>

        {/* 현상수배 — 오래 안 나온 얼굴들을 애정 어린 호출로 */}
        <GhostWanted ghosts={ghosts} onSelectMember={selectMember} />

        {!hasAnything && (
          <div className="px-6 text-center">
            <p className="text-[17px] text-foreground">
              아직 전할 소식이 없습니다
            </p>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              모임에 참석하거나 기록을 남기면 이 지면에 실립니다.
            </p>
          </div>
        )}

        {/* 소셜 — 지면 맨 끝. 판권면(masthead 반대편)처럼 크루 바깥으로 나가는 문을 모아둔다.
            소식이 없어도(hasAnything=false) 보여준다 — 채널은 지면 상태와 무관하다. */}
        <div className="px-6">
          <SocialLinksGrid />
        </div>
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
