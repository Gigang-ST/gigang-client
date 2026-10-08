import { Fragment } from "react";

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
  fmtPace,
  trainingPace,
  trnGroupNm,
  withMyPace,
  type PbSessPlan,
  type PbTrainingPace,
} from "@/lib/pb-class-plan";
import { formatSec, type PbScoreMember } from "@/lib/pb-class-score";
import type { PbEvent, PbParticipant, PbSession } from "@/lib/queries/pb-class";
import { cn } from "@/lib/utils";

import { EmptyState } from "@/components/common/empty-state";
import { Body, Caption, Micro } from "@/components/common/typography";
import { CardItem } from "@/components/ui/card";
import { formatAtShort, formatDtShort } from "./format";
import type { PbPhase } from "./pb-hero";
import { PbKindBadge, pbKindBarClass, pbTrnKindOf } from "./pb-kind-badge";
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

/** 내 P 계산 입력 — 보는 사람의 10K 목표와 5K 측정 기록 */
export type PbPaceInput = { goalSec: number | null; base5kSec: number | null; mid5kSec: number | null; midWkNo: number };

/**
 * 게임 참가자 행 → 내 P 입력.
 *
 * 기록은 `cnfm`(확정)을 따지지 않고 초만 쓴다. 확정은 **점수**를 거는 관문이고, 훈련 속도는 「지금 내 몸」을
 * 재는 안내라 내가 적은 기록이면 충분하다 — 게다가 본인 입력·운영진 정정 모두 이제 `cnfm_yn=true`로 저장된다.
 */
export function pbPaceInputOf(m: Pick<PbScoreMember, "goalSec" | "recs">, midWkNo: number): PbPaceInput {
  return {
    goalSec: m.goalSec,
    base5kSec: m.recs.BASE_5K?.sec ?? null,
    mid5kSec: m.recs.MID_5K?.sec ?? null,
    // 중간점검 주차는 설정값이라 「N주차 5K 기록 기준」 문구를 고정하지 않는다
    midWkNo,
  };
}

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

/**
 * `withMyPace`가 덧붙인 괄호 — 「(4:33)」·「(4:15~4:20)」. 원문에도 괄호가 있어서(「· 2회 (38분 이하는 3회)」)
 * 괄호만 보고 자르면 안 된다 — 안이 **페이스 모양뿐**인 괄호만 내 숫자로 본다.
 */
const MY_PACE_RE = /(\(\d+:\d{2}(?:~\d+:\d{2})?\))/;

/**
 * 훈련 문구 + 내 실제 페이스. 「400m @ P-15초」는 그대로 두고 옆에 「(4:33)」만 붙인다 —
 * 같은 훈련표를 보면서 사람마다 자기 숫자를 본다. 붙인 숫자는 primary(화면에서 primary 숫자 = 내 P)로 낮게 칠해
 * 원문과 층을 가른다. P가 없으면(구경꾼·계산 전) 원문 그대로.
 */
function PacedText({ text, pSec }: { text: string; pSec: number | null }) {
  if (pSec === null) return <>{text}</>;
  // split 에 캡처 그룹을 주면 잘린 괄호가 홀수 칸에 남는다
  const parts = withMyPace(text, pSec).split(MY_PACE_RE);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className="font-medium tabular-nums text-primary">
            {part}
          </span>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

/**
 * 세션 한 줄 — 「38~50분 / 첫 10K / 전원」 꼬리표 + 내용. 내 팀 줄이 주인공(반전 꼬리표·굵게)이고
 * 다른 팀 줄은 참고로 낮춘다.
 */
function SessLine({ tag, text, mine, pSec }: { tag: string; text: string; mine: boolean; pSec: number | null }) {
  return (
    <div className="flex items-baseline gap-2.5">
      <span
        className={cn(
          // 「38~50분」과 「첫 10K」의 폭이 달라 내용 시작선이 어긋나지 않게 최소 폭을 맞춘다
          "inline-flex h-5 min-w-16 shrink-0 items-center justify-center rounded-md px-1.5 text-[11px] font-semibold",
          mine ? "bg-foreground text-background" : "bg-secondary text-muted-foreground",
        )}
      >
        {tag}
      </span>
      {mine ? (
        <Body className="break-keep font-semibold leading-snug">
          <PacedText text={text} pSec={pSec} />
        </Body>
      ) : (
        <Caption className="break-keep leading-snug">
          <PacedText text={text} pSec={pSec} />
        </Caption>
      )}
    </div>
  );
}

/**
 * 개인 훈련 — 그 주 공식훈련 밖에서 각자 하는 것. **읽기만 하는 안내**라 체크 칸·기록 버튼을 두지 않는다:
 * 출석으로 인정하지 않는데(`PB_PLAN_NOTES`) 체크 칸을 세우면 「안 하면 손해」처럼 읽혀 출석 규칙과 헷갈린다.
 * 문구는 「이지런 2~3회 · 스트라이드 주 2회 · 장거리 1회 …」처럼 ` · `로 이어 적혀 있어 한 줄에 하나씩 편다 —
 * 붙인 「50분·첫 10K」(공백 없는 가운뎃점)는 한 항목 안이라 그대로 남는다.
 */
function SelfTraining({ text }: { text: string }) {
  const items = text.split(" · ").filter((s) => s.trim().length > 0);
  return (
    <div className="flex flex-col gap-1.5 rounded-xl bg-muted/60 px-3.5 py-3">
      <span className="flex items-baseline gap-1.5">
        <Micro className="font-semibold text-foreground">개인 훈련</Micro>
        <Micro>· 공식훈련 밖에서 각자</Micro>
      </span>
      <ul className="flex flex-col gap-1">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2">
            <span aria-hidden className="mt-[7px] size-1 shrink-0 rounded-full bg-muted-foreground/60" />
            <Caption className="break-keep leading-relaxed text-foreground">{it}</Caption>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SessBody({
  plan,
  trnGrpCd,
  link,
  pSec,
}: {
  plan: PbSessPlan;
  trnGrpCd: string | null;
  link: PbSession | null;
  pSec: number | null;
}) {
  const easy = isFirst10kGroup(trnGrpCd);
  const kind = pbTrnKindOf(plan.kindCd);
  // 첫 10K 세션이 따로 없으면(기록 측정 등) 모두 같은 세션이다 — 「전원」 한 줄로 말한다.
  // easyTxt 는 같은 세션의 **줄인 양**만 적는다(「6회」·「15분」). 그래서 첫 10K 그룹이어도 세션을 설명하는
  // 38~50분 줄이 늘 위에 서고, 내 줄이 어느 쪽인지는 순서가 아니라 꼬리표(반전)·굵기로 말한다.
  // 훈련팀이 아직 없으면 어느 줄도 낮추지 않는다.
  const lines = !plan.easyTxt
    ? [{ tag: TAG_ALL, text: plan.mainTxt, mine: true }]
    : [
        { tag: TAG_MAIN, text: plan.mainTxt, mine: !easy },
        { tag: TAG_FIRST_10K, text: plan.easyTxt, mine: easy || !trnGrpCd },
      ];

  return (
    <div className="flex flex-col gap-3 pb-4">
      <div className="flex flex-col gap-2">
        {lines.map((l) => (
          <SessLine key={l.tag} {...l} pSec={pSec} />
        ))}
      </div>

      {/* 훈련 종류 — 예전 「목적」 칸 자리. 목적 문장은 다 "10K 단축"으로 읽혀서, 종류의 속도와 그 종류가
          기르는 것 한 줄이 「이걸 왜 하지?」에 답한다. 띠 색은 접힌 줄의 칩과 같다 */}
      {kind && (
        <div className={cn("flex flex-col gap-0.5 border-l-[3px] py-0.5 pl-3", pbKindBarClass(kind.cd))}>
          <span className="flex flex-wrap items-baseline gap-x-1.5">
            <Caption className="font-semibold text-foreground">{kind.nm}</Caption>
            <Micro className="tabular-nums">· {kind.pace}</Micro>
          </span>
          <Caption className="break-keep leading-relaxed">{kind.what}</Caption>
        </div>
      )}

      {plan.selfTxt && <SelfTraining text={plan.selfTxt} />}

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
  pSec,
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
  pSec: number | null;
  focus: PbFocus | null;
  past: boolean;
  isFirst: boolean;
  isLast: boolean;
}) {
  const isFocus = focus?.sessNo === plan.sessNo;
  // 기록 측정(1·6주차 5K, 마지막 10K)은 훈련이 아니라 시험 날 — 레일 점을 네모로 세워 13줄 중에서 튀게 한다
  const isTest = plan.kindCd === "TT";
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
            isTest ? "rounded-[3px]" : "rounded-full",
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
              <PbKindBadge kindCd={plan.kindCd} />
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
        <SessBody plan={plan} trnGrpCd={trnGrpCd} link={link} pSec={pSec} />
      </details>
    </li>
  );
}

/** 환산 칸 — 훈련표에 실제로 나오는 속도들. 범위(P+10~15초)는 양 끝 칸을 읽으면 되고, 문구 옆 괄호도 같은 값을 말한다 */
const PACE_STEPS = [-15, -10, 0, 10, 15] as const;
/** 조깅 = P보다 km당 1:30~2:00 느리게 — `PB_PLAN_NOTES`의 조깅 정의와 같은 숫자 */
const JOG_SLOWER_SEC = [90, 120] as const;

/** 칸 머리 — 훈련 문구와 **같은 표기**(「P-15초」)라야 문구를 보고 바로 칸을 찾는다 */
const stepLabel = (d: number) => (d === 0 ? "P" : `P${d > 0 ? "+" : "-"}${Math.abs(d)}초`);

/** 내 P가 어디서 왔나 — 기록이 목표보다 느려 기록을 쓰는 경우엔 그 이유까지(「왜 목표 페이스가 아니지?」에 먼저 답한다) */
function paceBasisText(pace: PbTrainingPace, input: PbPaceInput): string {
  if (pace.basis === "record") {
    const rec = `${pace.recLabel ?? "5K"} 기록 기준`;
    return input.goalSec ? `${rec} — 목표 ${fmtPace(input.goalSec / 10)}보다 느려서` : rec;
  }
  const goal = `10K 목표 ${formatSec(input.goalSec ?? 0)} 기준`;
  return input.base5kSec !== null || input.mid5kSec !== null ? `${goal} — 5K 기록이 이미 목표보다 빨라요` : goal;
}

/**
 * 내 P — 훈련표의 모든 속도가 이 숫자 하나에서 나온다(오너 결정 2026-10-08: 목표와 최근 5K 환산 중 **느린 쪽**).
 *
 * 「P-15초」를 뛰는 사람이 매번 암산하지 않게 훈련표에 나오는 속도를 미리 환산해 둔다. 숫자는 전부 primary 가
 * 아니라 **P 칸만** primary 다 — 화면에서 primary 숫자는 「내 P」 하나를 가리킨다(문구 옆 괄호도 같은 색).
 *
 * P를 아직 못 정하면(목표도 5K 기록도 없음) 훈련팀의 대회 페이스로 물러나되, 계산된 값처럼 보이지 않게
 * 흐리게 두고 무엇을 하면 계산되는지를 말한다. 그때는 환산 칸도 문구 옆 괄호도 세우지 않는다 —
 * 팀 페이스는 「내」 숫자가 아니라서 사람마다 다른 속도를 한 숫자로 덮게 된다.
 */
function MyPaceCard({
  input,
  pace,
  trnGrpCd,
}: {
  input: PbPaceInput;
  pace: PbTrainingPace | null;
  trnGrpCd: string | null;
}) {
  if (!pace) {
    const grp = trnGroupOf(trnGrpCd);
    return (
      <CardItem className="flex flex-col gap-1">
        <Micro className="font-semibold text-foreground">내 P</Micro>
        <span className="flex items-baseline gap-2">
          <span className="font-numeric text-2xl font-medium leading-tight tabular-nums text-muted-foreground">
            {grp ? grp.paceTxt : "—"}
          </span>
          {grp && <Micro>훈련팀 대회 페이스</Micro>}
        </span>
        <Caption className="break-keep leading-relaxed">목표나 5K 기록을 올리면 내 P가 계산돼요</Caption>
      </CardItem>
    );
  }

  const p = pace.sec;
  const [jogFrom, jogTo] = JOG_SLOWER_SEC;
  return (
    <CardItem className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Micro className="font-semibold text-foreground">내 P</Micro>
        <span className="flex items-baseline gap-1">
          <span className="font-numeric text-3xl font-medium leading-none tabular-nums text-primary">{fmtPace(p)}</span>
          <Caption>/km</Caption>
        </span>
        <Micro className="break-keep leading-snug">{paceBasisText(pace, input)}</Micro>
      </div>

      <div className="flex flex-col rounded-xl bg-muted/60 py-2.5">
        <dl aria-label="내 P 환산" className="grid grid-cols-5">
          {PACE_STEPS.map((d) => (
            <div key={d} className="flex flex-col items-center gap-0.5">
              <dt className={cn("text-[11px]", d === 0 ? "font-semibold text-primary" : "text-muted-foreground")}>
                {stepLabel(d)}
              </dt>
              <dd
                className={cn(
                  "text-[13px] tabular-nums",
                  d === 0 ? "font-semibold text-primary" : "text-foreground",
                )}
              >
                {fmtPace(p + d)}
              </dd>
            </div>
          ))}
        </dl>
        <div className="mx-3.5 mt-2.5 flex items-baseline justify-between gap-2 border-t border-border pt-2">
          <Micro>{`조깅 · P+${fmtPace(jogFrom)}~${fmtPace(jogTo)}`}</Micro>
          <span className="text-[13px] tabular-nums text-foreground">{`${fmtPace(p + jogFrom)}~${fmtPace(p + jogTo)}`}</span>
        </div>
      </div>
    </CardItem>
  );
}

/** 훈련표 머리 — 내 훈련팀(있으면) + 내 P(참가자) + 모든 세션 공통 규칙 */
function PlanHeader({
  trnGrpCd,
  participant,
  paceInput,
  pace,
}: {
  trnGrpCd: string | null;
  participant: boolean;
  paceInput: PbPaceInput | null;
  pace: PbTrainingPace | null;
}) {
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
            훈련팀은 1주차 5K 기록으로 정해져요. 정해지면 내 팀 세션이 굵게 보여요.
          </Caption>
        )
      )}
      {paceInput && <MyPaceCard input={paceInput} pace={pace} trnGrpCd={trnGrpCd} />}
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
 * 훈련 탭 — 주차별 훈련 내용 · **훈련 종류**(무엇을 기르나) · **내 P**로 환산한 속도 · 개인 훈련 안내.
 *
 * - 회차는 레일로 잇고, 「지금 볼 훈련」 한 칸만 펼친다. 13칸을 다 펼치면 2,000px 가 넘는 벽이 되고,
 *   접힌 줄만으로도 「주차 · 날짜 · 종류 · 제목」이 보여 12주 흐름이 한눈에 읽힌다.
 *   개인 훈련은 접힌 줄엔 올리지 않는다(375px 에서 세 줄째가 생기면 13줄 흐름이 안 읽힌다) — 펼친 칸마다 있다.
 * - 날짜: 연결된 벙이 있으면 그 시각(KST), 없으면 그 주의 시작일(`weekStartDt` — 공식훈련 요일).
 *   측정은 W13·W14 중 하루라 벙이 연결되기 전엔 날짜를 지어내지 않고 「날짜 미정」이다.
 * - 참가자에겐 회차마다 내 출석 상태를 레일 점·글자로 단다(`buildSessStrip`과 같은 판정).
 * - 내 P(`trainingPace`)가 정해지면 훈련 문구의 「P-15초」 옆에 내 실제 페이스를 붙인다(`withMyPace`).
 */
export function PbTraining({
  plans,
  evt,
  cfg,
  sessions,
  phase,
  me,
  trnGrpCd,
  paceInput = null,
}: {
  plans: PbSessPlan[];
  evt: PbEvent;
  cfg: PbClassCfg;
  sessions: PbSession[];
  phase: PbPhase;
  /** 승인된 참가자만 — 회차별 출석 상태를 단다 */
  me: PbParticipant | null;
  trnGrpCd: string | null;
  /**
   * 보는 사람의 목표·5K 기록(`pbPaceInputOf`) — 승인된 참가자이고 게임 조회가 됐을 때만.
   * null 이면 내 P 카드도 문구 옆 숫자도 없다. 게임 조회가 실패했을 때 「목표나 기록을 올리면…」이라고
   * 말하면 이미 올린 사람에게 거짓말이 되므로, 모르면 아예 세우지 않는다.
   */
  paceInput?: PbPaceInput | null;
}) {
  const dow = parseEventTime(evt.sttDt).format("dd");
  const lead = `매주 ${dow}요일, 주마다 종류가 다른 훈련을 해요`;

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
  const pace = paceInput ? trainingPace(paceInput) : null;
  const pSec = pace?.sec ?? null;

  return (
    <PbZone label="Weekly Plan" lead={lead}>
      <PlanHeader trnGrpCd={trnGrpCd} participant={me !== null} paceInput={paceInput} pace={pace} />

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
              pSec={pSec}
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
