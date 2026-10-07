import Link from "next/link";
import { ChevronDown, ChevronRight, Timer } from "lucide-react";

import { parseEventTime } from "@/lib/dayjs";
import {
  buildSessStrip,
  weekStartDt,
  wkLabel,
  type PbClassCfg,
  type PbStripCell,
  type PbStripState,
} from "@/lib/pb-class";
import {
  PB_FIRST_10K_GROUP_CD,
  PB_PLAN_NOTES,
  PB_TRN_GROUPS,
  trnGroupNm,
  type PbSessPlan,
} from "@/lib/pb-class-plan";
import { formatSec } from "@/lib/pb-class-score";
import type { PbEvent, PbParticipant, PbSession } from "@/lib/queries/pb-class";
import { cn } from "@/lib/utils";

import { EmptyState } from "@/components/common/empty-state";
import { Body, Caption, Micro } from "@/components/common/typography";
import { formatAtShort, formatDtShort } from "./format";
import type { PbPhase } from "./pb-hero";
import { PbPhaseBadge } from "./pb-phase-badge";
import { PbScrollIntoView } from "./pb-scroll-into-view";
import { PbZone } from "./pb-zone";

/** 훈련팀 코드 → 안내 행(목표 시간·페이스). D1·D2처럼 쪼갠 반도 D 행을 본다 */
export function trnGroupOf(cd: string | null | undefined) {
  if (!cd) return null;
  return PB_TRN_GROUPS.find((g) => g.cd === cd) ?? PB_TRN_GROUPS.find((g) => cd.startsWith(g.cd)) ?? null;
}

/**
 * 회원 화면에 찍는 훈련팀 이름 — **목표 시간으로 부른다**(오너 지시: 「트레이닝그룹 ABCD는 목표 시간으로 불러라」).
 * 쪼갠 반(D1·D2)도 같은 목표 시간 그룹이라 부모 행의 이름을 쓴다. 코어 `trnGroupNm`은 목록에 없는 코드를
 * 그대로 돌려주는데, 그러면 회원 화면에 「D1」 같은 알파벳이 새어 나간다 — 어느 행에도 안 걸리는 코드만 코어 폴백.
 */
export function trnGroupLabel(cd: string | null | undefined): string | null {
  return trnGroupOf(cd)?.nm ?? trnGroupNm(cd);
}

/** 첫 10K 그룹(6:00/km)인가 — 이 그룹만 줄인 세션(easyTxt)을 따로 받는다 */
const isFirst10kGroup = (cd: string | null | undefined) => !!cd && cd.startsWith(PB_FIRST_10K_GROUP_CD);

export type PbFocus = { sessNo: number; tag: string };

/**
 * 훈련표에서 펼쳐 둘 회차 — 「지금 볼 훈련」.
 *
 * 날짜상 이번 주라도 그 주 공식훈련이 **이미 열렸으면** 다음 주로 넘긴다. 금요일에 훈련 탭을 연 사람이
 * 알고 싶은 건 지난 수요일이 아니라 다음 수요일이다. 측정까지 끝났거나 종료된 프로젝트면 펼칠 게 없다.
 */
export function pbFocusOf(phase: PbPhase, sessions: readonly PbSession[], cfg: PbClassCfg): PbFocus | null {
  const trainingWeeks = cfg.totSessCnt - 1;
  const measureNo = trainingWeeks + 1;
  const measure = sessions.find((s) => s.sessType === "MEASURE");
  const measureFocus = (): PbFocus | null => (measure?.held ? null : { sessNo: measureNo, tag: "다가오는 측정" });

  if (phase.kind === "closed") return null;
  if (phase.kind === "before") return { sessNo: 1, tag: "첫 훈련" };
  if (phase.kind === "measure") return measureFocus();
  const thisWeek = sessions.find((s) => s.sessType === "TRAINING" && s.wkNo === phase.wkNo);
  if (!thisWeek?.held) return { sessNo: phase.wkNo, tag: "이번 주" };
  return phase.wkNo + 1 > trainingWeeks ? measureFocus() : { sessNo: phase.wkNo + 1, tag: "다음 훈련" };
}

const STATE_TEXT: Partial<Record<PbStripState, string>> = {
  attended: "출석",
  missed: "결석",
  canceled: "취소",
  before_join: "합류 전",
};

const STATE_TONE: Partial<Record<PbStripState, string>> = {
  attended: "text-primary",
  missed: "text-muted-foreground",
  canceled: "text-muted-foreground line-through",
  before_join: "text-muted-foreground/60",
};

/** 레일 위 점 — 내 출석 상태(참가자) 또는 지나감/앞으로(구경꾼) */
function railNodeClass(state: PbStripState | null, past: boolean, focus: boolean): string {
  if (focus) return "bg-background ring-[3px] ring-primary";
  if (state === "attended") return "bg-primary";
  if (state === "missed" || state === "canceled") return "bg-muted-foreground/30";
  return past ? "bg-muted-foreground/30" : "bg-background ring-[1.5px] ring-border";
}

/**
 * 세션 줄 꼬리표 — 훈련팀을 목표 시간으로 부르므로 세션도 같은 말로 가른다(알파벳 코드를 화면에 안 쓴다).
 * 「38~50분」은 첫 10K를 뺀 그룹들의 목표 시간 범위라 `PB_TRN_GROUPS`에서 뽑는다 — 그룹이 바뀌면 같이 바뀐다.
 */
const MAIN_GROUPS = PB_TRN_GROUPS.filter((g) => g.cd !== PB_FIRST_10K_GROUP_CD);
const TAG_MAIN = `${MAIN_GROUPS[0].goalSec / 60}~${MAIN_GROUPS[MAIN_GROUPS.length - 1].goalSec / 60}분`;
const TAG_FIRST_10K = "첫 10K";
const TAG_ALL = "전원";

/** 세션 한 줄 — 「38~50분 / 첫 10K / 전원」 꼬리표 + 내용. 내 팀 줄이 주인공이고 다른 팀 줄은 참고로 낮춘다 */
function SessLine({ tag, text, primary }: { tag: string; text: string; primary: boolean }) {
  return (
    <div className="flex items-baseline gap-2.5">
      <span
        className={cn(
          // 「38~50분」과 「첫 10K」의 폭이 달라 내용 시작선이 어긋나지 않게 최소 폭을 맞춘다
          "inline-flex h-5 min-w-16 shrink-0 items-center justify-center rounded-md px-1.5 text-[11px] font-semibold",
          primary ? "bg-foreground text-background" : "bg-secondary text-muted-foreground",
        )}
      >
        {tag}
      </span>
      {primary ? (
        <Body className="font-semibold leading-snug">{text}</Body>
      ) : (
        <Caption className="leading-snug">{text}</Caption>
      )}
    </div>
  );
}

function SessBody({ plan, trnGrpCd, link }: { plan: PbSessPlan; trnGrpCd: string | null; link: PbSession | null }) {
  const easy = isFirst10kGroup(trnGrpCd);
  // 첫 10K 세션이 따로 없으면(타임트라이얼 등) 모두 같은 세션이다 — 「전원」 한 줄로 말한다
  const lines = !plan.easyTxt
    ? [{ tag: TAG_ALL, text: plan.mainTxt, primary: true }]
    : easy
      ? [
          { tag: TAG_FIRST_10K, text: plan.easyTxt, primary: true },
          { tag: TAG_MAIN, text: plan.mainTxt, primary: false },
        ]
      : [
          { tag: TAG_MAIN, text: plan.mainTxt, primary: true },
          { tag: TAG_FIRST_10K, text: plan.easyTxt, primary: !trnGrpCd },
        ];

  return (
    <div className="flex flex-col gap-3 pb-4">
      <div className="flex flex-col gap-2">
        {lines.map((l) => (
          <SessLine key={l.tag} {...l} />
        ))}
      </div>

      {/* 목적 — 이 훈련표의 핵심. 세션 내용과 층을 달리해 「왜」가 따로 읽히게 한다 */}
      <div className="flex flex-col gap-1 rounded-r-xl border-l-[3px] border-primary/50 bg-primary/5 px-3.5 py-3">
        <Micro className="font-semibold tracking-wide text-primary">목적</Micro>
        <Caption className="break-keep leading-relaxed text-foreground">{plan.purpTxt}</Caption>
      </div>

      {(plan.noteTxt || (link && !link.delYn)) && (
        <div className="flex items-center justify-between gap-3">
          {plan.noteTxt ? (
            <Micro className="min-w-0 break-keep">
              <span className="font-semibold text-foreground">비고</span> · {plan.noteTxt}
            </Micro>
          ) : (
            <span />
          )}
          {link && !link.delYn && (
            <Link
              href={`/gatherings/${link.gthrId}`}
              className="-my-3 inline-flex min-h-11 shrink-0 items-center gap-0.5 text-[13px] font-medium text-primary"
            >
              벙 보기
              <ChevronRight aria-hidden className="size-3.5" />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function PlanItem({
  plan,
  label,
  dateText,
  link,
  cell,
  trnGrpCd,
  focus,
  past,
  isFirst,
  isLast,
}: {
  plan: PbSessPlan;
  label: string;
  dateText: string;
  link: PbSession | null;
  cell: PbStripCell | null;
  trnGrpCd: string | null;
  focus: PbFocus | null;
  past: boolean;
  isFirst: boolean;
  isLast: boolean;
}) {
  const isFocus = focus?.sessNo === plan.sessNo;
  const isMeasure = plan.phaseNm === "측정";
  const state = cell?.state ?? null;
  const stateText = state ? STATE_TEXT[state] : undefined;

  return (
    <li id={`pb-sess-${plan.sessNo}`} data-focus={isFocus ? "true" : undefined} className="flex scroll-mt-6 gap-3">
      {/* 레일 — 회차를 한 줄로 잇는다. 맨 위·맨 아래는 점에서 끊는다 */}
      <span aria-hidden className="relative flex w-3 shrink-0 justify-center">
        <span
          className={cn(
            "absolute w-px bg-border",
            isFirst ? "top-[26px]" : "top-0",
            isLast ? "h-[26px]" : "bottom-0",
          )}
        />
        <span
          className={cn(
            "relative mt-5 size-3 shrink-0",
            isMeasure ? "rounded-[3px]" : "rounded-full",
            railNodeClass(state, past, isFocus),
          )}
        />
      </span>

      <details
        open={isFocus}
        className={cn(
          "group min-w-0 flex-1 rounded-2xl px-3",
          isFocus ? "my-1 bg-primary/5 ring-1 ring-primary/25" : "",
        )}
      >
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-2 py-3 [&::-webkit-details-marker]:hidden">
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="flex items-center gap-1.5">
              <Caption className={cn("font-semibold tabular-nums", past ? "text-muted-foreground" : "text-foreground")}>
                {label}
              </Caption>
              <Caption className="tabular-nums">· {dateText}</Caption>
              {isFocus && (
                <span className="ml-0.5 inline-flex h-5 items-center rounded-full bg-primary px-2 text-[11px] font-semibold text-primary-foreground">
                  {focus!.tag}
                </span>
              )}
            </span>
            <span className="flex min-w-0 items-center gap-2">
              <PbPhaseBadge phaseNm={plan.phaseNm} />
              <Body className={cn("truncate font-semibold", past && !isFocus && "text-muted-foreground")}>
                {plan.ttl}
              </Body>
            </span>
          </span>
          {stateText && (
            <Micro className={cn("shrink-0 font-semibold", state && STATE_TONE[state])}>{stateText}</Micro>
          )}
          <ChevronDown
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
          />
        </summary>
        <SessBody plan={plan} trnGrpCd={trnGrpCd} link={link} />
      </details>
    </li>
  );
}

/** 훈련표 머리 — 내 훈련팀(있으면) + 모든 세션 공통 규칙 */
function PlanHeader({ trnGrpCd, participant }: { trnGrpCd: string | null; participant: boolean }) {
  const grp = trnGroupOf(trnGrpCd);
  const nm = trnGroupLabel(trnGrpCd);
  return (
    <>
      {nm ? (
        <div className="flex items-center gap-3 rounded-2xl bg-secondary px-4 py-3">
          {/* 예전엔 이 자리에 알파벳(A~E) 코드가 큰 글씨로 섰다 — 이제 팀 이름이 목표 시간이라 아이콘이 대신한다 */}
          <span
            aria-hidden
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-foreground text-background"
          >
            <Timer className="size-5" />
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <Micro>내 훈련팀</Micro>
            <Body className="font-semibold leading-snug">{nm}</Body>
            {/* 목표기록·대회 페이스만 — 주간 거리는 안내에서 걷었다(오너 지시). 쪼갠 코드 등 행을 못 찾으면 이름만 */}
            {grp && (
              <Micro className="tabular-nums">{`10K 목표 ${formatSec(grp.goalSec)} 이내 · 대회 페이스 ${grp.paceTxt}`}</Micro>
            )}
          </span>
        </div>
      ) : (
        participant && (
          <Caption className="break-keep leading-relaxed">
            훈련팀은 1주차 5K 기록으로 정해져요. 정해지면 내 팀 세션이 위에 와요.
          </Caption>
        )
      )}
      <ul className="flex flex-col gap-1.5 rounded-2xl bg-muted/60 px-4 py-3.5">
        {PB_PLAN_NOTES.map((n) => (
          <li key={n} className="flex gap-2">
            <span aria-hidden className="mt-[7px] size-1 shrink-0 rounded-full bg-muted-foreground/60" />
            <Caption className="break-keep leading-relaxed">{n}</Caption>
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * 훈련 탭 — 주차별 훈련 내용과 **목적**(오너 요청: "이걸 왜 하지?"를 화면에서 바로).
 *
 * - 회차는 레일로 잇고, 「지금 볼 훈련」 한 칸만 펼친다. 13칸을 다 펼치면 2,000px 가 넘는 벽이 되고,
 *   접힌 줄만으로도 「주차 · 날짜 · 단계 · 제목」이 보여 12주 흐름이 한눈에 읽힌다.
 * - 날짜: 연결된 벙이 있으면 그 시각(KST), 없으면 그 주의 시작일(`weekStartDt` — 공식훈련 요일).
 *   측정은 W13·W14 중 하루라 벙이 연결되기 전엔 날짜를 지어내지 않고 「날짜 미정」이다.
 * - 참가자에겐 회차마다 내 출석 상태를 레일 점·글자로 단다(`buildSessStrip`과 같은 판정).
 */
export function PbTraining({
  plans,
  evt,
  cfg,
  sessions,
  phase,
  me,
  trnGrpCd,
}: {
  plans: PbSessPlan[];
  evt: PbEvent;
  cfg: PbClassCfg;
  sessions: PbSession[];
  phase: PbPhase;
  /** 승인된 참가자만 — 회차별 출석 상태를 단다 */
  me: PbParticipant | null;
  trnGrpCd: string | null;
}) {
  const dow = parseEventTime(evt.sttDt).format("dd");
  const lead = `매주 ${dow}요일, 주마다 하는 훈련과 그 이유`;

  if (plans.length === 0) {
    return (
      <PbZone label="Weekly Plan" lead={lead}>
        <EmptyState variant="card" message="운영진이 훈련표를 준비하고 있어요" />
      </PbZone>
    );
  }

  const trainingWeeks = cfg.totSessCnt - 1;
  const focus = pbFocusOf(phase, sessions, cfg);
  const cells = me
    ? buildSessStrip({ links: sessions, attendedGthrIds: new Set(me.attendedGthrIds), joinWkNo: me.joinWkNo, cfg })
    : null;
  const sorted = [...plans].sort((a, b) => a.sessNo - b.sessNo);

  return (
    <PbZone label="Weekly Plan" lead={lead}>
      <PlanHeader trnGrpCd={trnGrpCd} participant={me !== null} />

      <ol aria-label="주차별 훈련" className="mt-2 flex flex-col">
        {sorted.map((plan, i) => {
          const isMeasure = plan.sessNo > trainingWeeks;
          const link =
            (isMeasure
              ? sessions.find((s) => s.sessType === "MEASURE")
              : sessions.find((s) => s.sessType === "TRAINING" && s.wkNo === plan.sessNo)) ?? null;
          const cell =
            cells?.find((c) => (isMeasure ? c.sessType === "MEASURE" : c.sessType === "TRAINING" && c.wkNo === plan.sessNo)) ??
            null;
          const dateText = link
            ? formatAtShort(link.sttAt)
            : isMeasure
              ? "날짜 미정"
              : formatDtShort(weekStartDt(evt.sttDt, plan.sessNo));
          // 지나간 회차 — 펼칠 회차 앞이면 지난 것. 펼칠 게 없으면(종료·측정 끝) 전부 지난 것
          const past = focus ? plan.sessNo < focus.sessNo : true;
          return (
            <PlanItem
              key={plan.sessNo}
              plan={plan}
              label={isMeasure ? "측정" : wkLabel(plan.sessNo)}
              dateText={dateText}
              link={link}
              cell={cell}
              trnGrpCd={trnGrpCd}
              focus={focus}
              past={past}
              isFirst={i === 0}
              isLast={i === sorted.length - 1}
            />
          );
        })}
      </ol>

      {focus && <PbScrollIntoView targetId={`pb-sess-${focus.sessNo}`} />}
    </PbZone>
  );
}
