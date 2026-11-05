import { wkLabel } from "@/lib/pb-class";
import { formatSec } from "@/lib/pb-class-score";
import { PB_STREAK_EMOJI, type PbTeamBar, type PbTeamCard, type PbTeamMember, type PbTeams as PbTeamsData } from "@/lib/pb-class-teams";
import type { StoryPost } from "@/lib/queries/story-posts";
import { cn } from "@/lib/utils";

import { Avatar } from "@/components/common/avatar";
import { EmptyState } from "@/components/common/empty-state";
import { Body, Caption, Micro } from "@/components/common/typography";
import { CardItem } from "@/components/ui/card";
import { formatPt } from "./format";
import { PbTeamDot, teamColorClass } from "./pb-team-color";
import { PbTeamPhotos, type PbTeamPhotosViewer } from "./pb-team-photos";
import { trnGroupLabel } from "./pb-training";
import { PbZone } from "./pb-zone";

/** 크루 한 줄 — 상태(출석)를 먼저, 근거(빨라진 만큼)를 뒤에. 숫자만 진하게 */
function CrewLine({ g }: { g: NonNullable<PbTeamsData["glance"]> }) {
  const num = "font-semibold tabular-nums text-foreground";
  const tail = g.fasterSec ? (
    <>
      , 크루 평균 10K가 1주차보다 <span className={num}>{formatSec(g.fasterSec)}</span> 빨라졌어요
    </>
  ) : null;
  return (
    <Body className="break-keep text-muted-foreground">
      {g.label}엔{" "}
      {g.all ? (
        <>
          <span className={num}>{g.eligibleCnt}명</span> 모두 나왔{tail ? "고" : "어요"}
        </>
      ) : g.attdCnt === 0 ? (
        <>아무도 못 나왔{tail ? "고" : "어요"}</>
      ) : (
        <>
          {g.eligibleCnt}명 중 <span className={num}>{g.attdCnt}명</span>이 나왔{tail ? "고" : "어요"}
        </>
      )}
      {tail}
    </Body>
  );
}

/** 순위 변동 — 오르면 ▲, 내리면 ▼, 그대로면 안 그린다 */
function RankMove({ move }: { move: number }) {
  if (move === 0) return null;
  const up = move > 0;
  return (
    <span className={cn("font-semibold", up ? "text-success" : "text-muted-foreground")}>
      {up ? "▲" : "▼"}
      {Math.abs(move)}
    </span>
  );
}

/**
 * 팀 출석 흐름 — 회차마다 팀 출석률 막대. 이름은 없다(누가 빠졌는지가 아니라 팀이 꾸준한지를 본다).
 * 취소된 회차는 막대 대신 「취소」, 아직 회차가 없는(미정) 칸은 빈 바닥만.
 */
function TeamBars({ bars, colorNo }: { bars: PbTeamBar[]; colorNo: number | null }) {
  if (bars.length === 0) return null;
  return (
    <div className="flex flex-col gap-1" aria-label="회차별 팀 출석률">
      <div className="flex h-7 items-end gap-[3px]">
        {bars.map((b) => (
          <div
            key={b.tick}
            title={
              b.canceled ? `${b.label} 취소` : b.rate === null ? b.label : `${b.label} ${Math.round(b.rate * 100)}%`
            }
            className="relative h-full flex-1 overflow-hidden rounded-t-sm bg-secondary"
          >
            {b.rate !== null && (
              <div
                className={cn("absolute inset-x-0 bottom-0 rounded-t-sm opacity-80", teamColorClass(colorNo))}
                style={{ height: `${Math.round(b.rate * 100)}%` }}
              />
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-[3px]">
        {bars.map((b) => (
          <span key={b.tick} className="flex-1 text-center text-[9px] leading-none text-muted-foreground tabular-nums">
            {b.canceled ? "취소" : b.tick}
          </span>
        ))}
      </div>
    </div>
  );
}

/** 팀원 한 줄 — 얼굴·이름·훈련팀 / 예상 10K · 빨라진 만큼 · 목표. **출석은 싣지 않는다** */
function MemberRow({ m, showJoin }: { m: PbTeamMember; showJoin?: boolean }) {
  const trn = trnGroupLabel(m.trnGrpCd);
  const sub = [trn ? `훈련 ${trn}` : "훈련팀 정해지기 전", showJoin && m.joinWkNo > 1 ? `${wkLabel(m.joinWkNo)} 합류` : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className="flex items-center gap-3 border-t border-dashed border-border py-2 first:border-t-0">
      <Avatar src={m.avatarUrl} seed={m.memId} size="sm" />
      <div className="flex min-w-0 flex-1 flex-col">
        <Body className="truncate font-semibold">
          {m.memNm}
          {m.isMe && <span className="ml-1 text-[11px] font-semibold text-primary">나</span>}
        </Body>
        <Micro className="truncate">{sub}</Micro>
      </div>
      <div className="flex shrink-0 flex-col items-end">
        <Body className="font-numeric font-medium tabular-nums">
          {m.pred10kSec ? formatSec(m.pred10kSec) : "--:--"}
          <Micro className="ml-1">10K 예상</Micro>
        </Body>
        {m.fasterSec && (
          <Micro className="font-semibold tabular-nums text-success">▲{formatSec(m.fasterSec)}</Micro>
        )}
        {m.goalSec && <Micro className="tabular-nums">목표 {formatSec(m.goalSec)}</Micro>}
      </div>
    </li>
  );
}

function TeamCard({
  t,
  measureWkNo,
  photos,
  viewer,
}: {
  t: PbTeamCard;
  measureWkNo: number | null;
  photos: StoryPost[];
  viewer: PbTeamPhotosViewer;
}) {
  const weekLabel = t.week ? (t.week.wkNo === measureWkNo ? "측정" : wkLabel(t.week.wkNo)) : null;
  return (
    <CardItem data-mine={t.isMine ? "true" : undefined} className={cn("flex flex-col gap-2", t.isMine && "border-primary")}>
      <div className="flex items-center gap-2">
        <PbTeamDot colorNo={t.colorNo} />
        <Body className="truncate font-semibold">{t.grpNm}</Body>
        {t.isMine && <Micro className="shrink-0 font-semibold text-primary">내 팀</Micro>}
        {t.recent && (
          <Caption className="ml-auto shrink-0 tabular-nums">
            최근 회차{" "}
            <span className="font-semibold text-foreground">
              {t.recent.attdCnt}/{t.recent.eligibleCnt}명
            </span>{" "}
            출석
          </Caption>
        )}
      </div>

      {t.recent && (
        <div className="h-1.5 overflow-hidden rounded-full bg-secondary" aria-hidden>
          <div
            className={cn("h-full rounded-full", teamColorClass(t.colorNo))}
            style={{ width: `${Math.round((t.recent.attdCnt / t.recent.eligibleCnt) * 100)}%` }}
          />
        </div>
      )}

      {(t.week || t.allAttendStreak > 0) && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {t.week && (
            <Micro className="tabular-nums">
              <span className="font-semibold text-foreground">{t.rank}위</span>
              {" · "}
              {weekLabel} <span className="font-semibold text-foreground">+{formatPt(t.week.gain)}점</span>{" "}
              <RankMove move={t.week.rankMove} />
            </Micro>
          )}
          {t.allAttendStreak > 0 && (
            <Micro className="rounded-full bg-warning/15 px-2 py-0.5 font-semibold text-warning">
              전원 출석 {t.allAttendStreak}주 연속 {PB_STREAK_EMOJI}
            </Micro>
          )}
        </div>
      )}

      <TeamBars bars={t.bars} colorNo={t.colorNo} />

      {t.members.length === 0 ? (
        <Caption>아직 팀원이 없어요</Caption>
      ) : (
        <ul aria-label={`${t.grpNm} 팀원`} className="flex flex-col">
          {t.members.map((m) => (
            <MemberRow key={m.memId} m={m} />
          ))}
        </ul>
      )}

      {photos.length > 0 && <PbTeamPhotos grpNm={t.grpNm} posts={photos} viewer={viewer} />}
    </CardItem>
  );
}

/**
 * 점수판 탭 ④ 「Teams」 — 게임팀마다 누가 있고 어떻게 뛰고 있는지(#621, 오너 2026-11-05).
 *
 * 이름이 실리는 칸이라 **승인된 참가자에게만** 그린다(10K 트랙·누적 출석과 같은 범위) — 호출부가 그때만 이 노드를 만든다.
 * 출석은 팀 단위(「n/m명」·출석률 막대)로만 말하고 팀원 줄엔 싣지 않는다 — 출석표를 걷은 결정(2026-10-08) 그대로다.
 * 팀원 목표는 승인 참가자끼리 공개한다(오너 2026-11-05). 계산은 전부 `lib/pb-class-teams.ts`.
 */
export function PbTeams({
  data,
  measureWkNo,
  photosByGrp,
  viewer,
}: {
  data: PbTeamsData;
  measureWkNo: number | null;
  photosByGrp: ReadonlyMap<string, StoryPost[]>;
  viewer: PbTeamPhotosViewer;
}) {
  const { glance, teams, noTeam } = data;
  return (
    <PbZone label="Teams" lead="팀 구성과 팀별 흐름">
      {glance && <CrewLine g={glance} />}

      {teams.length === 0 ? (
        <EmptyState variant="card" message="팀 발표 전이에요" />
      ) : (
        teams.map((t) => (
          <TeamCard key={t.grpId} t={t} measureWkNo={measureWkNo} photos={photosByGrp.get(t.grpId) ?? []} viewer={viewer} />
        ))
      )}

      {noTeam.length > 0 && (
        <CardItem variant="dashed" className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Body className="font-semibold text-muted-foreground">팀 없음</Body>
            <Caption className="ml-auto tabular-nums">{noTeam.length}명</Caption>
          </div>
          <ul aria-label="팀 없는 참가자" className="flex flex-col">
            {noTeam.map((m) => (
              <MemberRow key={m.memId} m={m} showJoin />
            ))}
          </ul>
        </CardItem>
      )}
    </PbZone>
  );
}
